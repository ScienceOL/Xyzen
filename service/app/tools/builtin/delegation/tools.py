"""
Delegation tool factory and execution logic.

Creates tools that allow the CEO (root) agent to list, inspect,
and delegate tasks to the user's other agents.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import TYPE_CHECKING, Any
from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import BaseTool, StructuredTool

from app.agents.utils import extract_text_from_content
from app.tools.builtin.delegation.schemas import DelegateToAgentInput, GetAgentDetailsInput

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.core.providers import ProviderManager

logger = logging.getLogger(__name__)

# Timeout for delegated agent execution (30 minutes)
DELEGATION_TIMEOUT_SECONDS = 1800


async def create_delegation_tools_for_session(
    db: "AsyncSession",
    user_id: str,
    root_agent_id: UUID,
    user_provider_manager: "ProviderManager",
    provider_id: str | None,
    model_name: str | None,
    store: "BaseStore | None" = None,
) -> list[BaseTool]:
    """
    Create delegation tools (list, details, delegate) bound to the session context.

    Args:
        db: Database session (used at creation time only; execution uses session factory).
        user_id: Current user ID.
        root_agent_id: Agent ID of the CEO agent (excluded from listings).
        user_provider_manager: Provider manager for LLM access.
        provider_id: Provider ID for the LLM.
        model_name: Model name for the LLM.
        store: Optional LangGraph store for cross-thread memory.
    """
    from app.tools.builtin.subagent.context import get_session_factory

    if not get_session_factory():
        raise RuntimeError(
            "Delegation tools require session factory context. "
            "Call set_session_factory(...) before creating delegation tools."
        )

    # ── list_user_agents ──────────────────────────────────────────────
    async def list_user_agents_bound() -> str:
        """List all agents owned by the current user (excluding the CEO agent)."""
        return await _list_user_agents_impl(user_id=user_id, root_agent_id=root_agent_id)

    list_tool = StructuredTool.from_function(
        func=None,
        coroutine=list_user_agents_bound,
        name="list_user_agents",
        description=(
            "List all agents owned by the current user. "
            "Returns a JSON array with each agent's id, name, description, and tags. "
            "Use this to discover which agents are available for delegation."
        ),
    )

    # ── get_agent_details ─────────────────────────────────────────────
    async def get_agent_details_bound(agent_id: str) -> str:
        """Get detailed information about a specific agent."""
        return await _get_agent_details_impl(agent_id=agent_id, user_id=user_id)

    details_tool = StructuredTool(
        name="get_agent_details",
        description=(
            "Get detailed information about a specific agent, including its "
            "system prompt, model, provider, and connected tools. "
            "Use this before delegating to understand the agent's capabilities."
        ),
        args_schema=GetAgentDetailsInput,
        coroutine=get_agent_details_bound,
    )

    # ── delegate_to_agent ─────────────────────────────────────────────
    async def delegate_to_agent_bound(agent_id: str, task: str) -> str:
        """Delegate a task to the specified agent."""
        return await _delegate_to_agent_impl(
            agent_id=agent_id,
            task=task,
            user_id=user_id,
            user_provider_manager=user_provider_manager,
            provider_id=provider_id,
            model_name=model_name,
            store=store,
        )

    delegate_tool = StructuredTool(
        name="delegate_to_agent",
        description=(
            "Delegate a task to a specific agent. The agent will execute the task "
            "using its own configuration (prompt, tools, knowledge) and return the result. "
            "Be specific in the task description — the agent has no prior context."
        ),
        args_schema=DelegateToAgentInput,
        coroutine=delegate_to_agent_bound,
    )

    return [list_tool, details_tool, delegate_tool]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Implementation helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def _list_user_agents_impl(user_id: str, root_agent_id: UUID) -> str:
    """List user's agents, excluding the root agent itself."""
    from app.repos.agent import AgentRepository
    from app.tools.builtin.subagent.context import get_session_factory

    session_factory = get_session_factory()
    if not session_factory:
        return "Error: session factory not available."

    async with session_factory() as db:
        repo = AgentRepository(db)
        agents = await repo.get_agents_by_user(user_id)

    result = []
    for agent in agents:
        if agent.id == root_agent_id:
            continue
        result.append(
            {
                "id": str(agent.id),
                "name": agent.name,
                "description": agent.description or "",
                "tags": agent.tags or [],
            }
        )

    if not result:
        return "No agents found. The user has no other agents besides the CEO agent."

    return json.dumps(result, ensure_ascii=False)


async def _get_agent_details_impl(agent_id: str, user_id: str) -> str:
    """Get details for a specific agent."""
    from app.repos.agent import AgentRepository
    from app.tools.builtin.subagent.context import get_session_factory

    session_factory = get_session_factory()
    if not session_factory:
        return "Error: session factory not available."

    try:
        parsed_id = UUID(agent_id)
    except ValueError:
        return f"Error: '{agent_id}' is not a valid agent ID."

    async with session_factory() as db:
        repo = AgentRepository(db)
        agent = await repo.get_agent_by_id(parsed_id)

    if not agent:
        return f"Error: Agent with id '{agent_id}' not found."
    if agent.user_id != user_id:
        return f"Error: Agent '{agent_id}' does not belong to the current user."

    detail: dict[str, Any] = {
        "id": str(agent.id),
        "name": agent.name,
        "description": agent.description or "",
        "tags": agent.tags or [],
        "model": agent.model,
        "prompt": (agent.prompt or "")[:500],  # Truncate long prompts
    }
    return json.dumps(detail, ensure_ascii=False)


async def _delegate_to_agent_impl(
    agent_id: str,
    task: str,
    user_id: str,
    user_provider_manager: "ProviderManager",
    provider_id: str | None,
    model_name: str | None,
    store: "BaseStore | None",
) -> str:
    """Delegate a task to a target agent using its real configuration."""
    from app.agents.components import ensure_components_registered
    from app.agents.factory import build_graph_agent
    from app.repos.agent import AgentRepository
    from app.tools.builtin.subagent.context import get_session_factory
    from app.tools.prepare import prepare_tools

    session_factory = get_session_factory()
    if not session_factory:
        return "Error: session factory not available."

    try:
        parsed_id = UUID(agent_id)
    except ValueError:
        return f"Error: '{agent_id}' is not a valid agent ID."

    start_time = time.time()

    try:
        async with session_factory() as db:
            # 1. Load target agent
            repo = AgentRepository(db)
            agent = await repo.get_agent_by_id(parsed_id)

            if not agent:
                return f"Error: Agent '{agent_id}' not found."
            if agent.user_id != user_id:
                return f"Error: Agent '{agent_id}' does not belong to the current user."

            # 2. Resolve graph config
            from app.agents.builtin import get_builtin_config

            if agent.graph_config:
                config_dict = dict(agent.graph_config)
            else:
                react_config = get_builtin_config("react")
                if not react_config:
                    return "Error: Default builtin agent not found."
                config_dict = react_config.model_dump()

            # Inject agent's own prompt into the config
            if agent.prompt:
                from app.agents.factory import inject_system_prompt

                config_dict = inject_system_prompt(config_dict, agent.prompt)

            # 3. Prepare tools for the target agent
            tools: list[BaseTool] = await prepare_tools(
                db,
                agent,
                None,  # session_id — delegation is sessionless
                user_id,
                session_knowledge_set_id=agent.knowledge_set_id,
                topic_id=None,
            )

            # 4. Build the agent graph
            use_model = agent.model or model_name
            use_provider = str(agent.provider_id) if agent.provider_id else provider_id

            async def create_llm(**kwargs: Any) -> Any:
                override_model = kwargs.get("model") or use_model
                override_temp = kwargs.get("temperature")
                model_kwargs: dict[str, Any] = {"model": override_model}
                if override_temp is not None:
                    model_kwargs["temperature"] = override_temp
                return await user_provider_manager.create_langchain_model(
                    use_provider,
                    **model_kwargs,
                )

            ensure_components_registered()

            compiled_graph, _ = await build_graph_agent(
                config_dict,
                create_llm,
                tools,
                system_prompt=agent.prompt or "",
                store=store,
            )

        # 5. Execute with timeout (outside db session)
        result = await asyncio.wait_for(
            _run_delegated_agent(compiled_graph, task),
            timeout=DELEGATION_TIMEOUT_SECONDS,
        )

    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        logger.warning("Delegated agent '%s' timed out after %.1fs", agent_id, elapsed)
        return f"[Agent '{agent_id}' timed out after {DELEGATION_TIMEOUT_SECONDS}s]"
    except Exception as e:
        logger.exception("Delegation to agent '%s' failed", agent_id)
        return f"Error delegating to agent '{agent_id}': {e}"

    elapsed = time.time() - start_time
    logger.info("Delegation to agent '%s' completed in %.1fs", agent_id, elapsed)
    return result or "No output from the delegated agent."


async def _run_delegated_agent(
    graph: Any,
    task: str,
) -> str:
    """Run a delegated agent graph and collect the final text output.
    Also records LLM token usage from the delegated agent's messages."""
    state = await graph.ainvoke(
        {"messages": [HumanMessage(content=task)]},
        config={"recursion_limit": 200},
    )

    messages: list[Any]
    if isinstance(state, dict):
        raw = state.get("messages", [])
        messages = list(raw) if isinstance(raw, list) else []
    else:
        raw = getattr(state, "messages", [])
        messages = list(raw) if isinstance(raw, list) else []

    # Extract and record token usage
    from app.core.consume.tracking import record_messages_usage_from_context

    await record_messages_usage_from_context(messages, source="delegation")

    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            return extract_text_from_content(msg.content)

    return ""


__all__ = ["create_delegation_tools_for_session"]
