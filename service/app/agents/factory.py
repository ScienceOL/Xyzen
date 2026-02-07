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
1. agent_config.graph_config exists → use it as the source of truth
   (builtin provenance metadata is ONLY used for analytics/UI, not to replace the config)
2. No config → fall back to "react" builtin

IMPORTANT: The graph_config is always the single source of truth. This ensures
forked agents retain their customizations (custom prompts, tools, etc.) rather
than being replaced with the generic builtin config.

The default agent is the "react" builtin agent.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langgraph.graph.state import CompiledStateGraph
from sqlmodel.ext.asyncio.session import AsyncSession

from app.agents.types import DynamicCompiledGraph, LLMFactory
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
    1. agent_config has graph_config → use it (graph_config is the source of truth)
    2. agent_config is None or has no graph_config → use default builtin (react)

    Builtin provenance metadata is ONLY used for analytics/UI purposes, NOT to replace the
    agent's actual graph_config. This ensures forked agents retain their customizations.

    Args:
        agent_config: Agent configuration from database (may be None)
        system_prompt: System prompt to inject into the config

    Returns:
        Tuple of (raw_config_dict, agent_type_key)
        - raw_config_dict: GraphConfig as dict
        - agent_type_key: Agent type for events (e.g., "react", "deep_research", "graph")
    """
    from app.agents.builtin import get_builtin_config, list_builtin_keys

    if agent_config and agent_config.graph_config:
        # Agent has a graph_config - use it as the source of truth
        raw_config = agent_config.graph_config
        builtin_keys = set(list_builtin_keys())
        ui = raw_config.get("ui")

        # Extract agent type key for analytics/UI, but DON'T replace the config.
        # Prefer canonical key, then explicit UI builtin provenance.
        candidate_keys: list[str] = []
        raw_key = raw_config.get("key")
        if isinstance(raw_key, str) and raw_key.strip():
            candidate_keys.append(raw_key.strip())
        if isinstance(ui, dict):
            ui_value = ui.get("builtin_key")
            if isinstance(ui_value, str) and ui_value.strip():
                candidate_keys.append(ui_value.strip())

        agent_type_key = "graph"
        for candidate in candidate_keys:
            if candidate in builtin_keys:
                agent_type_key = candidate
                break

        # Inject system_prompt into the agent's actual config (not a builtin replacement)
        if system_prompt:
            raw_config = _inject_system_prompt(raw_config, system_prompt)

        return raw_config, agent_type_key

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

    Handles ALL nodes that support system_prompt:
    1. Component nodes - updates config_overrides.system_prompt
    2. LLM nodes - merges into llm_config.prompt_template

    This injects into ALL matching nodes (not just the first), ensuring
    forked agents with multiple components all receive the custom prompt.

    Args:
        config_dict: GraphConfig as dict
        system_prompt: System prompt to inject

    Returns:
        Modified config dict with system_prompt injected
    """
    import copy

    def merge_layered_prompt(base_prompt: str, node_prompt: Any) -> str:
        base = base_prompt.strip()
        node = node_prompt.strip() if isinstance(node_prompt, str) else ""
        if base and node:
            return f"{base}\n\n<NODE_PROMPT>\n{node}\n</NODE_PROMPT>"
        if base:
            return base
        return node

    config = copy.deepcopy(config_dict)
    merged_llm_nodes = 0
    merged_component_nodes = 0
    llm_nodes_with_node_prompt = 0
    component_nodes_with_node_prompt = 0

    node_list = config.get("nodes")
    if not isinstance(node_list, list):
        graph = config.get("graph")
        if isinstance(graph, dict):
            candidate_nodes = graph.get("nodes")
            if isinstance(candidate_nodes, list):
                node_list = candidate_nodes

    for node in node_list or []:
        if not isinstance(node, dict):
            continue

        # v2 shape
        if node.get("type") == "component":
            comp_config = node.setdefault("component_config", {})
            if isinstance(comp_config, dict):
                overrides = comp_config.setdefault("config_overrides", {})
                if isinstance(overrides, dict):
                    existing_component_prompt = overrides.get("system_prompt")
                    if isinstance(existing_component_prompt, str) and existing_component_prompt.strip():
                        component_nodes_with_node_prompt += 1
                    overrides["system_prompt"] = merge_layered_prompt(system_prompt, existing_component_prompt)
                    merged_component_nodes += 1
            continue
        if node.get("type") == "llm":
            llm_config = node.setdefault("llm_config", {})
            if isinstance(llm_config, dict):
                existing_prompt = llm_config.get("prompt_template")
                if isinstance(existing_prompt, str) and existing_prompt.strip():
                    llm_nodes_with_node_prompt += 1
                llm_config["prompt_template"] = merge_layered_prompt(system_prompt, existing_prompt)
                merged_llm_nodes += 1
            continue

        # canonical shape
        if node.get("kind") == "component":
            comp_config = node.setdefault("config", {})
            if isinstance(comp_config, dict):
                overrides = comp_config.setdefault("config_overrides", {})
                if isinstance(overrides, dict):
                    existing_component_prompt = overrides.get("system_prompt")
                    if isinstance(existing_component_prompt, str) and existing_component_prompt.strip():
                        component_nodes_with_node_prompt += 1
                    overrides["system_prompt"] = merge_layered_prompt(system_prompt, existing_component_prompt)
                    merged_component_nodes += 1
            continue
        if node.get("kind") == "llm":
            llm_config = node.setdefault("config", {})
            if isinstance(llm_config, dict):
                existing_prompt = llm_config.get("prompt_template")
                if isinstance(existing_prompt, str) and existing_prompt.strip():
                    llm_nodes_with_node_prompt += 1
                llm_config["prompt_template"] = merge_layered_prompt(system_prompt, existing_prompt)
                merged_llm_nodes += 1
            continue

    logger.info(
        "Prompt layering injected: llm_nodes=%d (with_node_prompt=%d), component_nodes=%d (with_node_prompt=%d)",
        merged_llm_nodes,
        llm_nodes_with_node_prompt,
        merged_component_nodes,
        component_nodes_with_node_prompt,
    )

    return config


async def _build_graph_agent(
    raw_config: dict[str, Any],
    llm_factory: LLMFactory,
    tools: list["BaseTool"],
    system_prompt: str,
) -> tuple[DynamicCompiledGraph, dict[str, str]]:
    """
    Build a graph agent from a canonical configuration.

    Args:
        raw_config: GraphConfig as dict
        llm_factory: Factory function to create LLM instances
        tools: List of tools available to the agent
        system_prompt: System prompt (already injected into config)

    Returns:
        Tuple of (CompiledStateGraph, node_component_keys)
    """
    from app.agents.components import ensure_components_registered
    from app.agents.graph.canonicalizer import parse_and_canonicalize_graph_config
    from app.agents.graph.compiler import GraphCompiler
    from app.agents.graph.validator import ensure_valid_graph_config

    # Ensure components are registered before building
    ensure_components_registered()

    # Build tool registry
    tool_registry = {t.name: t for t in tools}

    graph_config = parse_and_canonicalize_graph_config(raw_config)
    ensure_valid_graph_config(graph_config)

    compiler = GraphCompiler(
        config=graph_config,
        llm_factory=llm_factory,
        tool_registry=tool_registry,
    )
    compiled_graph = await compiler.build()
    node_component_keys = compiler.get_node_component_keys()
    logger.info(
        "Built graph agent (schema=%s, key=%s) with %d nodes",
        graph_config.schema_version,
        graph_config.key,
        len(graph_config.graph.nodes),
    )
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
            agent_name=(config.metadata.display_name if config.metadata else None) or builtin_key,
            agent_type=builtin_key,
        )

        if node_component_keys:
            event_ctx.node_component_keys = node_component_keys

        logger.info(f"Created builtin agent '{builtin_key}'")
        return compiled_graph, event_ctx

    except Exception as e:
        logger.error(f"Failed to build builtin agent '{builtin_key}': {e}")
        return None
