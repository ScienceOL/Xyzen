"""
Agent Factory - Creates agents for chat conversations.

This module provides factory functions to instantiate the appropriate agent
based on session configuration, agent type, and other parameters.

Supports:
- graph_config v1: Legacy JSON-configured graph agent (uses GraphBuilder)
- graph_config v2: Simplified JSON-configured graph agent (uses GraphBuilderV2)
- No config: Falls back to the built-in react system agent
- graph_config with metadata.system_agent_key: Uses specified system agent

The default agent is the "react" system agent.

Version detection:
- v2.x configs use GraphBuilderV2 with LangGraph primitives (ToolNode, tools_condition)
- v1.x configs use legacy GraphBuilder (will be migrated to v2 on read)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langgraph.graph.state import CompiledStateGraph
from sqlmodel.ext.asyncio.session import AsyncSession

from app.agents.types import DynamicCompiledGraph, LLMFactory, SystemAgentInfo
from app.core.chat.agent_event_handler import AgentEventContext

if TYPE_CHECKING:
    from uuid import UUID

    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

    from app.core.providers import ProviderManager
    from app.models.agent import Agent
    from app.models.sessions import Session
    from app.models.topic import Topic as TopicModel

logger = logging.getLogger(__name__)

# Default system agent key when no agent is specified
DEFAULT_SYSTEM_AGENT = "react"


async def create_chat_agent(
    db: AsyncSession,
    agent_config: "Agent | None",
    topic: "TopicModel",
    user_provider_manager: "ProviderManager",
    provider_id: str | None,
    model_name: str | None,
    system_prompt: str,
) -> tuple[CompiledStateGraph[Any, None, Any, Any], AgentEventContext]:
    """
    Create the appropriate agent for a chat session.

    This factory function determines which agent type to use based on
    the configuration and instantiates it with the necessary parameters.

    Args:
        db: Database session
        agent_config: Agent configuration from database (optional)
        topic: Topic/conversation context
        user_provider_manager: Provider manager for LLM access
        provider_id: Provider ID to use
        model_name: Model name to use
        system_prompt: System prompt for the agent

    Returns:
        Tuple of (CompiledStateGraph, AgentEventContext) for streaming execution
    """
    from app.agents.agent_tools import prepare_langchain_tools
    from app.repos.session import SessionRepository

    # Get session for configuration
    session_repo = SessionRepository(db)
    session: "Session | None" = await session_repo.get_session_by_id(topic.session_id)

    # Check if built-in search is enabled
    google_search_enabled: bool = session.google_search_enabled if session else False

    # Prepare tools from MCP servers
    session_id: "UUID | None" = topic.session_id if topic else None
    tools: list[BaseTool] = await prepare_langchain_tools(db, agent_config, session_id)

    # Determine how to execute this agent
    agent_type_str, system_key = _resolve_agent_config(agent_config)

    # For frontend event tracking, use the actual system key (react, deep_research)
    # instead of generic "system" so the UI can distinguish between agent types
    event_agent_type = system_key if system_key else agent_type_str

    # Create event context for tracking
    event_ctx = AgentEventContext(
        agent_id=str(agent_config.id) if agent_config else "default",
        agent_name=agent_config.name if agent_config else "Default Agent",
        agent_type=event_agent_type,
    )

    # Create LLM factory for graph and system agents
    async def create_llm(**kwargs: Any) -> "BaseChatModel":
        override_model = kwargs.get("model") or model_name
        override_temp = kwargs.get("temperature")

        # Build kwargs conditionally to avoid passing None values
        # (some providers like Google don't accept temperature=None)
        model_kwargs: dict[str, Any] = {
            "model": override_model,
            "google_search_enabled": google_search_enabled,
        }
        if override_temp is not None:
            model_kwargs["temperature"] = override_temp

        return await user_provider_manager.create_langchain_model(
            provider_id,
            **model_kwargs,
        )

    # Route to appropriate agent builder based on type
    if agent_type_str == "graph":
        return await _create_graph_agent(
            agent_config,
            create_llm,
            tools,
            event_ctx,
        )

    # System agent (includes react, deep_research, etc.)
    return await _create_system_agent(
        system_key,
        agent_config,
        create_llm,
        tools,
        system_prompt,
        google_search_enabled,
        event_ctx,
    )


def _detect_config_version(config: dict) -> str:
    """Detect the version of a graph config.

    Returns:
        Version string (e.g., "1.0", "2.0")
    """
    version = config.get("version", "1.0")
    return version


async def _create_graph_agent(
    agent_config: "Agent | None",
    llm_factory: LLMFactory,
    tools: list["BaseTool"],
    event_ctx: AgentEventContext,
) -> tuple[DynamicCompiledGraph, AgentEventContext]:
    """Create a JSON-configured graph agent.

    All configs are migrated to v2 and use GraphBuilderV2 with LangGraph primitives.
    v1 configs are automatically migrated at runtime.
    """
    if not agent_config or not agent_config.graph_config:
        raise ValueError("Graph agent requires agent_config with graph_config")

    from app.agents.graph_builder_v2 import GraphBuilderV2
    from app.schemas.graph_config_v2 import GraphConfig as GraphConfigV2
    from app.schemas.graph_config_v2 import migrate_graph_config

    # Build tool registry
    tool_registry = {t.name: t for t in tools}

    # Detect version and migrate if needed
    version = _detect_config_version(agent_config.graph_config)

    if version.startswith("2."):
        # Already v2, just validate
        graph_config = GraphConfigV2.model_validate(agent_config.graph_config)
        logger.debug(f"Using v2 config for agent '{agent_config.name}'")
    else:
        # Auto-migrate v1 to v2
        logger.info(f"Migrating v1 config to v2 for agent '{agent_config.name}'")
        graph_config = migrate_graph_config(agent_config.graph_config)
        logger.info(f"Migration complete: {len(graph_config.nodes)} nodes, {len(graph_config.edges)} edges")

    # Always use v2 builder
    builder = GraphBuilderV2(
        config=graph_config,
        llm_factory=llm_factory,
        tool_registry=tool_registry,
    )
    compiled_graph = builder.build()
    logger.info(f"Created graph agent '{agent_config.name}' with {len(graph_config.nodes)} nodes")

    return compiled_graph, event_ctx


async def _create_system_agent(
    system_key: str,
    agent_config: "Agent | None",
    llm_factory: LLMFactory,
    tools: list["BaseTool"],
    system_prompt: str,
    google_search_enabled: bool,
    event_ctx: AgentEventContext,
) -> tuple[CompiledStateGraph[Any, None, Any, Any], AgentEventContext]:
    """
    Create a Python-coded system agent.

    Args:
        system_key: System agent key (e.g., "react", "deep_research")
        agent_config: Optional agent configuration
        llm_factory: Factory function to create LLM
        tools: List of tools available to the agent
        system_prompt: System prompt for the agent
        google_search_enabled: Whether Google search is enabled
        event_ctx: Event context for tracking

    Returns:
        Tuple of (CompiledStateGraph, AgentEventContext)
    """
    from app.agents.system import system_agent_registry

    # Get system agent instance
    llm = await llm_factory()
    system_agent = system_agent_registry.get_instance(
        system_key,
        llm=llm,
        tools=tools,
    )

    if not system_agent:
        raise ValueError(f"System agent not found: {system_key}")

    # Special handling for react agent - pass system_prompt and google_search
    if system_key == "react":
        from app.agents.system.react import ReActAgent

        if isinstance(system_agent, ReActAgent):
            system_agent.system_prompt = system_prompt
            system_agent.google_search_enabled = google_search_enabled

    # Build graph
    compiled_graph = system_agent.build_graph()

    logger.info(f"Created system agent '{system_key}' with {len(tools)} tools")
    return compiled_graph, event_ctx


def _resolve_agent_config(agent_config: "Agent | None") -> tuple[str, str]:
    """
    Resolve how to execute an agent based on its graph_config.

    Resolution logic:
    1. No agent_config → use react fallback
    2. Agent has graph_config with metadata.system_agent_key → use that system agent
    3. Agent has graph_config → use graph agent
    4. Agent has no graph_config → use react fallback

    Args:
        agent_config: Agent configuration (may be None)

    Returns:
        Tuple of (agent_type_for_events, system_key)
        - agent_type_for_events: "graph" or "system" for event tracking
        - system_key: System agent key (e.g., "react", "deep_research"), empty for pure graph
    """
    if agent_config is None:
        # Default to react system agent
        return "system", DEFAULT_SYSTEM_AGENT

    # Check graph_config
    if agent_config.graph_config:
        # Check for system_agent_key in metadata (uses system agent as base)
        metadata = agent_config.graph_config.get("metadata", {})
        system_key = metadata.get("system_agent_key")
        if system_key:
            return "system", system_key
        # Pure graph agent
        return "graph", ""

    # No graph_config = use react fallback
    return "system", DEFAULT_SYSTEM_AGENT


async def create_agent_from_builtin(
    builtin_name: str,
    user_provider_manager: "ProviderManager",
    provider_id: str | None,
    model_name: str | None,
) -> CompiledStateGraph[Any, None, Any, Any] | None:
    """
    Create an agent from the builtin registry.

    Args:
        builtin_name: Name of the builtin agent in registry
        user_provider_manager: Provider manager for LLM access
        provider_id: Provider ID to use
        model_name: Model name to use

    Returns:
        Compiled StateGraph or None if agent not found
    """
    from app.agents import registry

    agent = registry.get_agent(builtin_name)
    if agent is None:
        logger.warning(f"Builtin agent '{builtin_name}' not found in registry")
        return None

    try:
        graph: CompiledStateGraph[Any, None, Any, Any] = agent.build_graph()
        logger.info(f"Created builtin agent '{builtin_name}'")
        return graph
    except Exception as e:
        logger.error(f"Failed to build builtin agent '{builtin_name}': {e}")
        return None


async def create_system_agent_graph(
    system_key: str,
    user_provider_manager: "ProviderManager",
    provider_id: str | None,
    model_name: str | None,
    tools: list["BaseTool"] | None = None,
) -> tuple[CompiledStateGraph[Any, None, Any, Any], AgentEventContext] | None:
    """
    Create a system agent graph directly by key.

    Useful for invoking system agents outside of the normal chat flow.

    Args:
        system_key: System agent key (e.g., "deep_research")
        user_provider_manager: Provider manager for LLM access
        provider_id: Provider ID to use
        model_name: Model name to use
        tools: Optional tools to provide

    Returns:
        Tuple of (CompiledStateGraph, AgentEventContext) or None if not found
    """
    from app.agents.system import system_agent_registry

    # Create LLM
    llm = await user_provider_manager.create_langchain_model(
        provider_id,
        model=model_name,
    )

    # Get system agent
    system_agent = system_agent_registry.get_instance(
        system_key,
        llm=llm,
        tools=tools or [],
    )

    if not system_agent:
        logger.warning(f"System agent '{system_key}' not found")
        return None

    # Create event context
    # Use the actual system_key (e.g., "deep_research") as agent_type
    # so frontend can distinguish between different system agents
    event_ctx = AgentEventContext(
        agent_id=system_key,
        agent_name=system_agent.name,
        agent_type=system_key,
    )

    # Build graph
    try:
        graph = system_agent.build_graph()
        logger.info(f"Created system agent graph '{system_key}'")
        return graph, event_ctx
    except Exception as e:
        logger.error(f"Failed to build system agent '{system_key}': {e}")
        return None


def list_available_system_agents() -> list[SystemAgentInfo]:
    """
    List all available system agents.

    Returns:
        List of system agent metadata dictionaries
    """
    from app.agents.system import system_agent_registry

    return system_agent_registry.get_all_metadata()  # type: ignore[return-value]
