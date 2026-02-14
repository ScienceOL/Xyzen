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

from app.agents.utils import extract_text_from_content
from app.tools.builtin.subagent.schemas import SpawnSubagentInput

if TYPE_CHECKING:
    from uuid import UUID

    from langgraph.graph.state import CompiledStateGraph
    from langgraph.store.base import BaseStore
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.core.providers import ProviderManager

logger = logging.getLogger(__name__)

# Maximum nesting depth for subagent spawning
MAX_SUBAGENT_DEPTH = 3

# Timeout for subagent execution (5 minutes)
SUBAGENT_TIMEOUT_SECONDS = 300

# Subagent always uses the react builtin
SUBAGENT_TYPE_KEY = "react"


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
        "generate content)."
    )

    async def spawn_subagent_bound(task: str) -> str:
        """Spawn a subagent to handle the given task."""
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
) -> str:
    """
    Core implementation: build a react subagent, run it, return the text result.

    Creates a fresh database session from the session factory to avoid
    stale session issues with the parent's captured session.
    """
    from app.tools.builtin.subagent.context import get_session_factory

    # 1. Depth check
    if current_depth >= MAX_SUBAGENT_DEPTH:
        return (
            f"Error: Maximum subagent nesting depth ({MAX_SUBAGENT_DEPTH}) reached. "
            "Cannot spawn further subagents."
        )

    # 2. Get session factory from context
    session_factory = get_session_factory()
    if not session_factory:
        raise RuntimeError(
            "No session factory available for subagent. "
            "Ensure set_session_factory(...) is called in task setup."
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
        elapsed = time.time() - start_time
        logger.warning("Subagent timed out after %.1fs", elapsed)
        return f"[Subagent timed out after {SUBAGENT_TIMEOUT_SECONDS}s]"
    except Exception as e:
        logger.exception("Subagent failed")
        return f"Error running subagent: {e}"

    elapsed = time.time() - start_time
    logger.info("Subagent completed in %.1fs", elapsed)
    return result or "No output from subagent."


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

    # If the subagent itself should have spawn capability (depth < max),
    # add the spawn_subagent tool recursively
    if current_depth + 1 < MAX_SUBAGENT_DEPTH:
        nested_tools = await create_subagent_tool_for_session(
            db=db,
            user_id=user_id,
            session_id=session_id,
            topic_id=topic_id,
            user_provider_manager=user_provider_manager,
            provider_id=provider_id,
            model_name=model_name,
            current_depth=current_depth + 1,
            store=store,
        )
        subagent_tools.extend(nested_tools)

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
    """
    state = await graph.ainvoke(
        {"messages": [HumanMessage(content=task)]},
        config={"recursion_limit": 30},
    )

    messages: list[Any]
    if isinstance(state, dict):
        raw_messages = state.get("messages", [])
        messages = list(raw_messages) if isinstance(raw_messages, list) else []
    else:
        raw_messages = getattr(state, "messages", [])
        messages = list(raw_messages) if isinstance(raw_messages, list) else []

    # Walk backwards to find the latest final assistant message.
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            return extract_text_from_content(msg.content)

    return ""


__all__ = [
    "create_subagent_tool_for_session",
]
