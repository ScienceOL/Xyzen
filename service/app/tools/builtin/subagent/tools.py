"""
Subagent tool factory and execution logic.

Creates the spawn_subagent tool that allows a parent agent to dynamically
delegate tasks to a react subagent. The subagent runs synchronously and
returns its text result as a normal tool call response.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import BaseTool, StructuredTool

from app.common.code.chat_error_code import ChatErrorCode
from app.agents.utils import extract_text_from_content
from app.tools.builtin.subagent.schemas import SpawnSubagentInput, SpawnSubagentOutcome

if TYPE_CHECKING:
    from uuid import UUID

    from langgraph.graph.state import CompiledStateGraph
    from langgraph.store.base import BaseStore
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.core.providers import ProviderManager

logger = logging.getLogger(__name__)

# Maximum nesting depth for subagent spawning
MAX_SUBAGENT_DEPTH = 3

# Maximum number of subagent delegations in one parent agent turn
MAX_SUBAGENT_CALLS_PER_TURN = 2

# Timeout for subagent execution (seconds)
SUBAGENT_TIMEOUT_SECONDS = 1800

# Recursion limit for subagent graph execution
SUBAGENT_RECURSION_LIMIT = 200

# Subagent always uses the react builtin
SUBAGENT_TYPE_KEY = "react"


def _serialize_subagent_outcome(
    *,
    ok: bool,
    output: str = "",
    error_code: str | None = None,
    error_message: str | None = None,
    duration_ms: int = 0,
) -> str:
    """Serialize a structured subagent outcome payload."""
    payload = SpawnSubagentOutcome(
        ok=ok,
        error_code=error_code,
        error_message=error_message,
        output=output,
        duration_ms=max(0, duration_ms),
    )
    return payload.model_dump_json()


def _is_recursion_limit_error(error: Exception) -> bool:
    """Detect recursion-limit failures without depending on provider-specific types."""
    error_text = str(error).lower()
    return (
        "recursion limit" in error_text
        or "recursion_limit" in error_text
        or type(error).__name__.lower() == "graphrecursionerror"
    )


async def create_subagent_tool_for_session(
    db: "AsyncSession",
    user_id: str | None,
    session_id: "UUID | None",
    topic_id: "UUID | None",
    user_provider_manager: "ProviderManager",
    provider_id: str | None,
    model_name: str | None,
    current_depth: int = 0,
    store: "BaseStore | None" = None,
) -> list[BaseTool]:
    """
    Create the spawn_subagent tool bound to the current session context.

    The subagent is always a react agent with the default available tools.

    Note: The `db` session is only used for reference at creation time.
    At execution time, the subagent creates its own fresh session via
    the session factory set in contextvars.
    """
    from app.tools.builtin.subagent.context import get_session_factory

    # Fail fast with an explicit error if the execution context is not initialized.
    # Chat tasks set this via set_session_factory(TaskSessionLocal).
    if not get_session_factory():
        raise RuntimeError(
            "spawn_subagent requires session factory context. "
            "Call set_session_factory(...) before creating subagent tools."
        )

    tool_description = (
        "Spawn a subagent to handle a specific task autonomously. "
        "The subagent is a general-purpose react agent with tool-calling "
        "capabilities. It runs independently, executes the task, and "
        "returns its result.\n\n"
        "Use this when you want to delegate a sub-task that can be "
        "handled independently (e.g., research a topic, analyze data, "
        "generate content).\n\n"
        "Important: avoid repeated retries. If subagent returns timeout or "
        "recursion-limit failure, summarize the failure and continue with a "
        "best-effort direct answer."
    )

    # Per-parent-turn budget for subagent delegations.
    budget_state = {"calls": 0}

    async def spawn_subagent_bound(task: str) -> str:
        """Spawn a subagent to handle the given task."""
        budget_state["calls"] += 1
        attempt_index = budget_state["calls"]
        if attempt_index > MAX_SUBAGENT_CALLS_PER_TURN:
            error_message = (
                f"Subagent delegation budget exceeded ({MAX_SUBAGENT_CALLS_PER_TURN} per turn). "
                "Continue with a best-effort answer without further subagent calls."
            )
            logger.warning(
                "Subagent budget guard triggered: attempt=%d max_calls=%d depth=%d",
                attempt_index,
                MAX_SUBAGENT_CALLS_PER_TURN,
                current_depth,
            )
            return _serialize_subagent_outcome(
                ok=False,
                error_code=ChatErrorCode.TOOL_EXECUTION_FAILED.value,
                error_message=error_message,
            )

        return await _spawn_subagent_impl(
            task=task,
            user_id=user_id,
            session_id=session_id,
            topic_id=topic_id,
            user_provider_manager=user_provider_manager,
            provider_id=provider_id,
            model_name=model_name,
            current_depth=current_depth,
            store=store,
            attempt_index=attempt_index,
        )

    tool = StructuredTool(
        name="spawn_subagent",
        description=tool_description,
        args_schema=SpawnSubagentInput,
        coroutine=spawn_subagent_bound,
    )

    return [tool]


async def _spawn_subagent_impl(
    task: str,
    user_id: str | None,
    session_id: "UUID | None",
    topic_id: "UUID | None",
    user_provider_manager: "ProviderManager",
    provider_id: str | None,
    model_name: str | None,
    current_depth: int,
    store: "BaseStore | None",
    attempt_index: int,
) -> str:
    """
    Core implementation: build a react subagent, run it, return the text result.

    Creates a fresh database session from the session factory to avoid
    stale session issues with the parent's captured session.
    """
    from app.tools.builtin.subagent.context import get_session_factory

    # 1. Depth check
    if current_depth >= MAX_SUBAGENT_DEPTH:
        error_message = (
            f"Maximum subagent nesting depth ({MAX_SUBAGENT_DEPTH}) reached. Cannot spawn further subagents."
        )
        logger.warning(
            "Subagent depth guard triggered: attempt=%d depth=%d max_depth=%d",
            attempt_index,
            current_depth,
            MAX_SUBAGENT_DEPTH,
        )
        return _serialize_subagent_outcome(
            ok=False,
            error_code=ChatErrorCode.TOOL_EXECUTION_FAILED.value,
            error_message=error_message,
        )

    # 2. Get session factory from context
    session_factory = get_session_factory()
    if not session_factory:
        error_message = (
            "No session factory available for subagent. Ensure set_session_factory(...) is called in task setup."
        )
        logger.error(
            "Subagent session factory missing: attempt=%d depth=%d",
            attempt_index,
            current_depth,
        )
        return _serialize_subagent_outcome(
            ok=False,
            error_code=ChatErrorCode.TOOL_EXECUTION_FAILED.value,
            error_message=error_message,
        )

    start_time = time.time()

    try:
        # 3. Create a fresh db session for the subagent
        async with session_factory() as db:
            compiled_graph = await _build_subagent_graph(
                db=db,
                user_id=user_id,
                session_id=session_id,
                topic_id=topic_id,
                user_provider_manager=user_provider_manager,
                provider_id=provider_id,
                model_name=model_name,
                current_depth=current_depth,
                store=store,
            )

        # 4. Run subagent with timeout (no db session needed for execution)
        result = await asyncio.wait_for(
            _run_subagent(compiled_graph, task),
            timeout=SUBAGENT_TIMEOUT_SECONDS,
        )

    except asyncio.TimeoutError:
        duration_ms = int((time.time() - start_time) * 1000)
        error_message = f"Subagent timed out after {SUBAGENT_TIMEOUT_SECONDS}s."
        logger.warning(
            "Subagent timed out: attempt=%d depth=%d duration_ms=%d timeout_s=%d",
            attempt_index,
            current_depth,
            duration_ms,
            SUBAGENT_TIMEOUT_SECONDS,
        )
        return _serialize_subagent_outcome(
            ok=False,
            error_code=ChatErrorCode.AGENT_TIMEOUT.value,
            error_message=error_message,
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        error_code = (
            ChatErrorCode.AGENT_RECURSION_LIMIT.value
            if _is_recursion_limit_error(e)
            else ChatErrorCode.TOOL_EXECUTION_FAILED.value
        )
        error_message = (
            "Subagent reached recursion limit."
            if error_code == ChatErrorCode.AGENT_RECURSION_LIMIT.value
            else "Subagent execution failed."
        )
        logger.exception(
            "Subagent failed: attempt=%d depth=%d duration_ms=%d error_code=%s",
            attempt_index,
            current_depth,
            duration_ms,
            error_code,
        )
        return _serialize_subagent_outcome(
            ok=False,
            error_code=error_code,
            error_message=error_message,
            duration_ms=duration_ms,
        )

    duration_ms = int((time.time() - start_time) * 1000)
    logger.info(
        "Subagent completed: attempt=%d depth=%d duration_ms=%d",
        attempt_index,
        current_depth,
        duration_ms,
    )
    return _serialize_subagent_outcome(
        ok=True,
        output=result or "No output from subagent.",
        duration_ms=duration_ms,
    )


async def _build_subagent_graph(
    db: "AsyncSession",
    user_id: str | None,
    session_id: "UUID | None",
    topic_id: "UUID | None",
    user_provider_manager: "ProviderManager",
    provider_id: str | None,
    model_name: str | None,
    current_depth: int,
    store: "BaseStore | None",
) -> "CompiledStateGraph[Any, None, Any, Any]":
    """
    Build the subagent's compiled graph — always a react agent.
    """
    from app.agents.builtin import get_builtin_config
    from app.agents.components import ensure_components_registered
    from app.agents.factory import build_graph_agent
    from app.tools.prepare import prepare_tools

    # Prepare subagent's tools (default tools, no specific agent config)
    subagent_tools: list[BaseTool] = await prepare_tools(
        db,
        None,
        session_id,
        user_id,
        session_knowledge_set_id=None,
        topic_id=topic_id,
    )

    # Intentional guardrail: nested subagent delegation is disabled.
    # Only root agents can call spawn_subagent.
    _ = current_depth

    # Always use react builtin config
    react_config = get_builtin_config(SUBAGENT_TYPE_KEY)
    if not react_config:
        raise ValueError(f"Builtin agent '{SUBAGENT_TYPE_KEY}' not found")
    config_dict = react_config.model_dump()

    # Create LLM factory for subagent
    async def create_llm(**kwargs: Any) -> Any:
        override_model = kwargs.get("model") or model_name
        override_temp = kwargs.get("temperature")

        model_kwargs: dict[str, Any] = {"model": override_model}
        if override_temp is not None:
            model_kwargs["temperature"] = override_temp

        return await user_provider_manager.create_langchain_model(
            provider_id,
            **model_kwargs,
        )

    ensure_components_registered()

    compiled_graph, _ = await build_graph_agent(
        config_dict,
        create_llm,
        subagent_tools,
        system_prompt="",
        store=store,
    )

    return compiled_graph


async def _run_subagent(
    graph: "CompiledStateGraph[Any, None, Any, Any]",
    task: str,
) -> str:
    """
    Run a subagent graph and collect the final text output.
    Also records LLM token usage from the subagent's messages.
    """
    state = await graph.ainvoke(
        {"messages": [HumanMessage(content=task)]},
        config={"recursion_limit": SUBAGENT_RECURSION_LIMIT},
    )

    messages: list[Any]
    if isinstance(state, dict):
        raw_messages = state.get("messages", [])
        messages = list(raw_messages) if isinstance(raw_messages, list) else []
    else:
        raw_messages = getattr(state, "messages", [])
        messages = list(raw_messages) if isinstance(raw_messages, list) else []

    # Extract and record token usage from subagent messages
    from app.core.consume.tracking import record_messages_usage_from_context

    await record_messages_usage_from_context(messages, source="subagent")

    # Walk backwards to find the latest final assistant message.
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            return extract_text_from_content(msg.content)

    return ""


__all__ = [
    "create_subagent_tool_for_session",
]
