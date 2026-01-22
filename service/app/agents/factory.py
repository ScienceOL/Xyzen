"""
Agent Factory - Creates agents for chat conversations.

This module provides factory functions to instantiate the appropriate agent
based on session configuration, agent type, and other parameters.

Unified Agent Creation Path:
All agents (builtin and user-defined) go through the same path:
1. Resolve GraphConfig (from DB or builtin registry)
2. Build using GraphBuilder
3. Return CompiledStateGraph + AgentEventContext

Config Resolution Order:
1. agent_config.graph_config exists → use it directly
2. agent_config.graph_config.metadata.builtin_key exists → use builtin config
3. agent_config.graph_config.metadata.system_agent_key exists → use builtin config (legacy)
4. No config → fall back to "react" builtin

The default agent is the "react" builtin agent.
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

# Default builtin agent key when no agent is specified
DEFAULT_BUILTIN_AGENT = "react"


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

    This factory function uses a unified path for all agents:
    1. Resolve which GraphConfig to use
    2. Build the graph using GraphBuilder
    3. Return the compiled graph and event context

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
    from app.repos.session import SessionRepository
    from app.tools.prepare import prepare_tools

    # Get session for configuration
    session_repo = SessionRepository(db)
    session: "Session | None" = await session_repo.get_session_by_id(topic.session_id)

    # Get user_id for knowledge tool context binding
    user_id: str | None = session.user_id if session else None

    # Get session-level knowledge_set_id override (if any)
    session_knowledge_set_id: "UUID | None" = session.knowledge_set_id if session else None

    # Prepare tools from builtin tools and MCP servers
    session_id: "UUID | None" = topic.session_id if topic else None
    topic_id: "UUID | None" = topic.id if topic else None
    tools: list[BaseTool] = await prepare_tools(
        db,
        agent_config,
        session_id,
        user_id,
        session_knowledge_set_id=session_knowledge_set_id,
        topic_id=topic_id,
    )

    # Resolve the agent configuration
    resolved_config, agent_type_key = _resolve_agent_config(agent_config, system_prompt)

    # Create event context for tracking
    event_ctx = AgentEventContext(
        agent_id=str(agent_config.id) if agent_config else "default",
        agent_name=agent_config.name if agent_config else "Default Agent",
        agent_type=agent_type_key,
    )

    # Create LLM factory
    async def create_llm(**kwargs: Any) -> "BaseChatModel":
        override_model = kwargs.get("model") or model_name
        override_temp = kwargs.get("temperature")

        # Build kwargs conditionally to avoid passing None values
        # (some providers like Google don't accept temperature=None)
        model_kwargs: dict[str, Any] = {
            "model": override_model,
        }
        if override_temp is not None:
            model_kwargs["temperature"] = override_temp

        return await user_provider_manager.create_langchain_model(
            provider_id,
            **model_kwargs,
        )

    # Build the agent using unified GraphBuilder path
    compiled_graph, node_component_keys = await _build_graph_agent(
        resolved_config,
        create_llm,
        tools,
        system_prompt,
    )

    # Populate node->component mapping for frontend rendering
    if node_component_keys:
        event_ctx.node_component_keys = node_component_keys
        logger.debug(f"Populated {len(node_component_keys)} node->component mappings")

    logger.info(f"Created agent '{agent_type_key}' with {len(tools)} tools")
    return compiled_graph, event_ctx


def _resolve_agent_config(
    agent_config: "Agent | None",
    system_prompt: str,
) -> tuple[dict[str, Any], str]:
    """
    Resolve which GraphConfig to use for an agent.

    Resolution order:
    1. agent_config has graph_config → use it, check for builtin_key/system_agent_key
    2. agent_config is None or has no graph_config → use default builtin (react)

    Args:
        agent_config: Agent configuration from database (may be None)
        system_prompt: System prompt to inject if using react agent

    Returns:
        Tuple of (raw_config_dict, agent_type_key)
        - raw_config_dict: GraphConfig as dict (for version detection)
        - agent_type_key: Agent type for events (e.g., "react", "deep_research")
    """
    from app.agents.builtin import get_builtin_config

    if agent_config and agent_config.graph_config:
        # Agent has a graph_config
        raw_config = agent_config.graph_config
        metadata = raw_config.get("metadata", {})

        # Check for builtin_key or system_agent_key (legacy)
        builtin_key = metadata.get("builtin_key") or metadata.get("system_agent_key")

        if builtin_key:
            # This config references a builtin - use the builtin config
            builtin_config = get_builtin_config(builtin_key)
            if builtin_config:
                # Apply system_prompt override for react
                config_dict = builtin_config.model_dump()
                if builtin_key == "react" and system_prompt:
                    config_dict = _inject_system_prompt(config_dict, system_prompt)
                return config_dict, builtin_key

            # Builtin not found, use the provided config as-is
            logger.warning(f"Builtin '{builtin_key}' not found, using provided config")
            return raw_config, builtin_key or "graph"

        # Pure user-defined graph config
        return raw_config, "graph"

    # No agent config or no graph_config - use default builtin (react)
    builtin_config = get_builtin_config(DEFAULT_BUILTIN_AGENT)
    if not builtin_config:
        raise ValueError(f"Default builtin agent '{DEFAULT_BUILTIN_AGENT}' not found")

    config_dict = builtin_config.model_dump()
    if system_prompt:
        config_dict = _inject_system_prompt(config_dict, system_prompt)

    return config_dict, DEFAULT_BUILTIN_AGENT


def _inject_system_prompt(config_dict: dict[str, Any], system_prompt: str) -> dict[str, Any]:
    """
    Inject system_prompt into a graph config.

    Handles both:
    1. Component nodes with stdlib:react - updates config_overrides
    2. LLM nodes - updates prompt_template

    Args:
        config_dict: GraphConfig as dict
        system_prompt: System prompt to inject

    Returns:
        Modified config dict with system_prompt injected
    """
    # Deep copy to avoid mutating original
    import copy

    config = copy.deepcopy(config_dict)

    # Find nodes and inject system_prompt (first matching node only)
    for node in config.get("nodes", []):
        # Handle component nodes (existing behavior)
        if node.get("type") == "component":
            comp_config = node.get("component_config", {})
            comp_ref = comp_config.get("component_ref", {})

            # Only inject into react components
            if comp_ref.get("key") == "react":
                overrides = comp_config.setdefault("config_overrides", {})
                overrides["system_prompt"] = system_prompt
                break

        # Handle LLM nodes
        elif node.get("type") == "llm":
            llm_config = node.get("llm_config", {})
            llm_config["prompt_template"] = system_prompt
            break

    return config


def _detect_config_version(config: dict) -> str:
    """
    Detect the version of a graph config.

    Returns:
        Version string (e.g., "1.0", "2.0")
    """
    version = config.get("version", "1.0")
    return version


async def _build_graph_agent(
    raw_config: dict[str, Any],
    llm_factory: LLMFactory,
    tools: list["BaseTool"],
    system_prompt: str,
) -> tuple[DynamicCompiledGraph, dict[str, str]]:
    """
    Build a graph agent from configuration using GraphBuilder.

    This is the unified build path for all agents (builtin and user-defined).
    All configs are migrated to v2 format if needed.

    Args:
        raw_config: GraphConfig as dict (may be v1 or v2)
        llm_factory: Factory function to create LLM instances
        tools: List of tools available to the agent
        system_prompt: System prompt (already injected into config)

    Returns:
        Tuple of (CompiledStateGraph, node_component_keys)
    """
    from app.agents.components import ensure_components_registered
    from app.agents.graph_builder import GraphBuilder
    from app.schemas.graph_config import GraphConfig as GraphConfigV2
    from app.schemas.graph_config import migrate_graph_config

    # Ensure components are registered before building
    ensure_components_registered()

    # Build tool registry
    tool_registry = {t.name: t for t in tools}

    # Detect version and migrate if needed
    version = _detect_config_version(raw_config)

    if version.startswith("2."):
        # Already v2, just validate
        graph_config = GraphConfigV2.model_validate(raw_config)
        logger.debug("Using v2 config")
    else:
        # Auto-migrate v1 to v2
        logger.info("Migrating v1 config to v2")
        graph_config = migrate_graph_config(raw_config)
        logger.info(f"Migration complete: {len(graph_config.nodes)} nodes, {len(graph_config.edges)} edges")

    # Build using GraphBuilder
    builder = GraphBuilder(
        config=graph_config,
        llm_factory=llm_factory,
        tool_registry=tool_registry,
    )

    compiled_graph = await builder.build()
    node_component_keys = builder.get_node_component_keys()

    logger.info(f"Built graph agent with {len(graph_config.nodes)} nodes")
    return compiled_graph, node_component_keys


async def create_agent_from_builtin(
    builtin_key: str,
    user_provider_manager: "ProviderManager",
    provider_id: str | None,
    model_name: str | None,
    tools: list["BaseTool"] | None = None,
    system_prompt: str = "",
) -> tuple[CompiledStateGraph[Any, None, Any, Any], AgentEventContext] | None:
    """
    Create an agent directly from a builtin config.

    Useful for programmatic agent creation outside of chat flow.

    Args:
        builtin_key: Key of the builtin agent (e.g., "react", "deep_research")
        user_provider_manager: Provider manager for LLM access
        provider_id: Provider ID to use
        model_name: Model name to use
        tools: Optional tools to provide
        system_prompt: Optional system prompt override

    Returns:
        Tuple of (CompiledStateGraph, AgentEventContext) or None if not found
    """
    from app.agents.builtin import get_builtin_config

    config = get_builtin_config(builtin_key)
    if not config:
        logger.warning(f"Builtin agent '{builtin_key}' not found")
        return None

    # Create LLM factory
    async def create_llm(**kwargs: Any) -> "BaseChatModel":
        override_model = kwargs.get("model") or model_name
        override_temp = kwargs.get("temperature")

        model_kwargs: dict[str, Any] = {
            "model": override_model,
            "streaming": True,  # Enable streaming for token-by-token output
        }
        if override_temp is not None:
            model_kwargs["temperature"] = override_temp

        return await user_provider_manager.create_langchain_model(
            provider_id,
            **model_kwargs,
        )

    # Get config and inject system prompt if needed
    config_dict = config.model_dump()
    if system_prompt:
        config_dict = _inject_system_prompt(config_dict, system_prompt)

    # Build the agent
    try:
        compiled_graph, node_component_keys = await _build_graph_agent(
            config_dict,
            create_llm,
            tools or [],
            system_prompt,
        )

        event_ctx = AgentEventContext(
            agent_id=builtin_key,
            agent_name=config.metadata.get("display_name", builtin_key),
            agent_type=builtin_key,
        )

        if node_component_keys:
            event_ctx.node_component_keys = node_component_keys

        logger.info(f"Created builtin agent '{builtin_key}'")
        return compiled_graph, event_ctx

    except Exception as e:
        logger.error(f"Failed to build builtin agent '{builtin_key}': {e}")
        return None


def list_available_system_agents() -> list[SystemAgentInfo]:
    """
    List all available system/builtin agents.

    Returns:
        List of system agent metadata dictionaries
    """
    from app.agents.builtin import list_builtin_metadata

    result: list[SystemAgentInfo] = []

    for metadata in list_builtin_metadata():
        result.append(
            {
                "key": metadata["key"],
                "metadata": {
                    "name": metadata["display_name"],
                    "description": metadata.get("description", ""),
                    "version": metadata.get("version", "1.0.0"),
                    "capabilities": [],
                    "tags": [],
                    "author": metadata.get("author"),
                    "license": None,
                },
                "forkable": metadata.get("forkable", True),
                "components": [],  # Components are now registered globally
            }
        )

    return result
