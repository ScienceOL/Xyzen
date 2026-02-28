"""
Agent management tool factory and implementation.

Creates tools that allow the CEO (root) agent to create, inspect,
update, and delete agents on behalf of the user.
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

from langchain_core.tools import BaseTool, StructuredTool

from app.tools.builtin.agent_management.schemas import (
    CreateAgentInput,
    DeleteAgentInput,
    UpdateAgentInput,
)

logger = logging.getLogger(__name__)


async def create_agent_management_tools_for_session(
    user_id: str,
    root_agent_id: UUID,
) -> list[BaseTool]:
    """
    Create agent management tools bound to the session context.

    Args:
        user_id: Current user ID.
        root_agent_id: Agent ID of the CEO agent (protected from deletion).
    """
    from app.tools.builtin.subagent.context import get_session_factory

    if not get_session_factory():
        raise RuntimeError(
            "Agent management tools require session factory context. "
            "Call set_session_factory(...) before creating agent management tools."
        )

    # ── get_agent_schema ───────────────────────────────────────────
    async def get_agent_schema_bound() -> str:
        return _get_agent_schema_impl()

    schema_tool = StructuredTool.from_function(
        func=None,
        coroutine=get_agent_schema_bound,
        name="get_agent_schema",
        description=(
            "Get the full GraphConfig v3 schema, available components, builtin templates, "
            "and tool capabilities. Use this before creating advanced graph-based agents "
            "with custom nodes, edges, and component references."
        ),
    )

    # ── create_agent ───────────────────────────────────────────────
    async def create_agent_bound(
        name: str,
        description: str = "",
        prompt: str = "",
        model: str = "",
        tags: str = "",
        graph_config: str = "",
    ) -> str:
        return await _create_agent_impl(
            name=name,
            description=description,
            prompt=prompt,
            model=model,
            tags=tags,
            graph_config=graph_config,
            user_id=user_id,
        )

    create_tool = StructuredTool(
        name="create_agent",
        description=(
            "Create a new agent for the user. For most cases, just provide a name "
            "and prompt to create a standard ReAct agent. Optionally specify model "
            "and tags. For advanced custom graphs, pass a full graph_config JSON "
            "(call get_agent_schema first to see the spec)."
        ),
        args_schema=CreateAgentInput,
        coroutine=create_agent_bound,
    )

    # ── update_agent ───────────────────────────────────────────────
    async def update_agent_bound(
        agent_id: str,
        name: str = "",
        description: str = "",
        prompt: str = "",
        model: str = "",
        tags: str = "",
        graph_config: str = "",
    ) -> str:
        return await _update_agent_impl(
            agent_id=agent_id,
            name=name,
            description=description,
            prompt=prompt,
            model=model,
            tags=tags,
            graph_config=graph_config,
            user_id=user_id,
            root_agent_id=root_agent_id,
        )

    update_tool = StructuredTool(
        name="update_agent",
        description=(
            "Update an existing agent's configuration. Only non-empty fields are updated; "
            "leave fields empty to keep their current values. Cannot modify system or root agents."
        ),
        args_schema=UpdateAgentInput,
        coroutine=update_agent_bound,
    )

    # ── delete_agent ───────────────────────────────────────────────
    async def delete_agent_bound(agent_id: str) -> str:
        return await _delete_agent_impl(
            agent_id=agent_id,
            user_id=user_id,
            root_agent_id=root_agent_id,
        )

    delete_tool = StructuredTool(
        name="delete_agent",
        description=("Permanently delete a user-created agent. Cannot delete system or root agents."),
        args_schema=DeleteAgentInput,
        coroutine=delete_agent_bound,
    )

    return [schema_tool, create_tool, update_tool, delete_tool]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Implementation helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _get_agent_schema_impl() -> str:
    """Return the GraphConfig v3 schema, available components, templates, and tool capabilities."""
    from app.agents.builtin import list_builtin_metadata
    from app.agents.components import component_registry, ensure_components_registered
    from app.tools.capabilities import ToolCapability

    ensure_components_registered()

    # Collect component metadata
    components = []
    for meta in component_registry.list_metadata():
        components.append(
            {
                "key": meta.key,
                "name": meta.name,
                "description": meta.description,
                "version": meta.version,
                "required_capabilities": meta.required_capabilities,
                "tags": meta.tags,
            }
        )

    # Collect builtin templates
    templates = list_builtin_metadata()

    # Collect tool capabilities
    capabilities = [cap.value for cap in ToolCapability]

    result = {
        "graph_config_schema": {
            "schema_version": "3.0",
            "description": "Canonical GraphConfig schema for defining agent graphs.",
            "node_kinds": {
                "llm": "LLM call node with optional tool binding. Config: prompt_template, tools_enabled, tool_filter, max_iterations, output_key, model_override, temperature_override.",
                "tool": "Tool execution node. Config: execute_all, tool_filter, output_key, timeout_seconds.",
                "transform": "Data transformation node using Jinja2 templates. Config: template, output_key, input_keys.",
                "component": "Reference to a registered ExecutableComponent. Config: component_ref (key + version), config_overrides.",
            },
            "edge_conditions": {
                "has_tool_calls": "Builtin: true when the previous LLM node produced tool calls.",
                "no_tool_calls": "Builtin: true when the previous LLM node produced no tool calls.",
                "custom_predicate": "Custom condition: {state_path, operator (eq|neq|truthy|falsy), value}.",
            },
            "state_field_types": ["string", "int", "float", "bool", "list", "dict", "any"],
            "state_reducers": ["replace", "add_messages"],
            "execution_limits": "max_time_s (1-3600), max_steps (1-100000), max_concurrency (1-256).",
            "example_react_graph": {
                "entrypoints": ["agent"],
                "nodes": [
                    {
                        "id": "agent",
                        "name": "Agent",
                        "kind": "llm",
                        "reads": ["messages"],
                        "writes": ["messages", "response"],
                        "config": {
                            "prompt_template": "You are a helpful assistant.",
                            "tools_enabled": True,
                            "output_key": "response",
                        },
                    },
                    {
                        "id": "tools",
                        "name": "Tools",
                        "kind": "tool",
                        "reads": ["messages"],
                        "writes": ["messages", "tool_results"],
                        "config": {"execute_all": True},
                    },
                ],
                "edges": [
                    {"from_node": "agent", "to_node": "tools", "when": "has_tool_calls"},
                    {"from_node": "agent", "to_node": "END", "when": "no_tool_calls"},
                    {"from_node": "tools", "to_node": "agent"},
                ],
            },
        },
        "available_components": components,
        "available_builtin_templates": templates,
        "available_tool_capabilities": capabilities,
    }

    return json.dumps(result, ensure_ascii=False)


def _parse_tags(tags: str) -> list[str] | None:
    """Parse comma-separated tags string to list, or None if empty."""
    if not tags.strip():
        return None
    return [t.strip() for t in tags.split(",") if t.strip()]


def _parse_graph_config(graph_config: str) -> dict | None:
    """Parse graph_config JSON string, or None if empty."""
    if not graph_config.strip():
        return None
    try:
        parsed = json.loads(graph_config)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid graph_config JSON: {e}") from e
    if not isinstance(parsed, dict):
        raise ValueError("graph_config must be a JSON object.")
    return parsed


async def _create_agent_impl(
    name: str,
    description: str,
    prompt: str,
    model: str,
    tags: str,
    graph_config: str,
    user_id: str,
) -> str:
    """Create a new agent for the user."""
    from app.models.agent import AgentCreate, AgentScope
    from app.repos.agent import AgentRepository
    from app.tools.builtin.subagent.context import get_session_factory

    session_factory = get_session_factory()
    if not session_factory:
        return json.dumps({"ok": False, "error": "Session factory not available."})

    try:
        parsed_tags = _parse_tags(tags)
        parsed_graph_config = _parse_graph_config(graph_config)
    except ValueError as e:
        return json.dumps({"ok": False, "error": str(e)})

    try:
        agent_data = AgentCreate(
            scope=AgentScope.USER,
            name=name,
            description=description if description else None,
            prompt=prompt if prompt else None,
            model=model if model else None,
            tags=parsed_tags,
            graph_config=parsed_graph_config,
        )

        async with session_factory() as db:
            repo = AgentRepository(db)
            agent = await repo.create_agent(agent_data, user_id)
            await db.commit()

            result = {
                "ok": True,
                "agent_id": str(agent.id),
                "name": agent.name,
                "message": f"Agent '{agent.name}' created successfully. You can test it with delegate_to_agent.",
            }

    except ValueError as e:
        result = {"ok": False, "error": str(e)}
    except Exception as e:
        logger.exception("Failed to create agent for user %s", user_id)
        result = {"ok": False, "error": f"Failed to create agent: {e}"}

    return json.dumps(result, ensure_ascii=False)


async def _update_agent_impl(
    agent_id: str,
    name: str,
    description: str,
    prompt: str,
    model: str,
    tags: str,
    graph_config: str,
    user_id: str,
    root_agent_id: UUID,
) -> str:
    """Update an existing agent."""
    from app.models.agent import AgentScope, AgentUpdate
    from app.repos.agent import AgentRepository
    from app.tools.builtin.subagent.context import get_session_factory

    session_factory = get_session_factory()
    if not session_factory:
        return json.dumps({"ok": False, "error": "Session factory not available."})

    try:
        parsed_id = UUID(agent_id)
    except ValueError:
        return json.dumps({"ok": False, "error": f"'{agent_id}' is not a valid UUID."})

    try:
        parsed_tags = _parse_tags(tags)
        parsed_graph_config = _parse_graph_config(graph_config)
    except ValueError as e:
        return json.dumps({"ok": False, "error": str(e)})

    try:
        async with session_factory() as db:
            repo = AgentRepository(db)
            agent = await repo.get_agent_by_id(parsed_id)

            if not agent:
                return json.dumps({"ok": False, "error": f"Agent '{agent_id}' not found."})
            if agent.user_id != user_id:
                return json.dumps({"ok": False, "error": f"Agent '{agent_id}' does not belong to you."})
            if agent.scope == AgentScope.SYSTEM:
                return json.dumps({"ok": False, "error": "Cannot modify system agents."})
            if agent.id == root_agent_id:
                return json.dumps({"ok": False, "error": "Cannot modify root agent configuration via this tool."})
            if parsed_graph_config and not agent.config_editable:
                return json.dumps(
                    {"ok": False, "error": "This agent's graph configuration is locked and cannot be edited."}
                )

            # Build update dict with only provided (non-empty) fields
            update_kwargs: dict = {}
            if name:
                update_kwargs["name"] = name
            if description:
                update_kwargs["description"] = description
            if prompt:
                update_kwargs["prompt"] = prompt
            if model:
                update_kwargs["model"] = model
            if parsed_tags is not None:
                update_kwargs["tags"] = parsed_tags
            if parsed_graph_config is not None:
                update_kwargs["graph_config"] = parsed_graph_config

            if not update_kwargs:
                return json.dumps({"ok": False, "error": "No fields to update. Provide at least one non-empty field."})

            agent_data = AgentUpdate(**update_kwargs)
            updated = await repo.update_agent(parsed_id, agent_data)
            await db.commit()

            if not updated:
                return json.dumps({"ok": False, "error": "Failed to update agent."})

            result = {
                "ok": True,
                "agent_id": str(updated.id),
                "name": updated.name,
                "message": f"Agent '{updated.name}' updated successfully.",
            }

    except ValueError as e:
        result = {"ok": False, "error": str(e)}
    except Exception as e:
        logger.exception("Failed to update agent %s", agent_id)
        result = {"ok": False, "error": f"Failed to update agent: {e}"}

    return json.dumps(result, ensure_ascii=False)


async def _delete_agent_impl(
    agent_id: str,
    user_id: str,
    root_agent_id: UUID,
) -> str:
    """Delete a user-created agent."""
    from app.models.agent import AgentScope
    from app.repos.agent import AgentRepository
    from app.repos.agent_marketplace import AgentMarketplaceRepository
    from app.tools.builtin.subagent.context import get_session_factory

    session_factory = get_session_factory()
    if not session_factory:
        return json.dumps({"ok": False, "error": "Session factory not available."})

    try:
        parsed_id = UUID(agent_id)
    except ValueError:
        return json.dumps({"ok": False, "error": f"'{agent_id}' is not a valid UUID."})

    try:
        async with session_factory() as db:
            repo = AgentRepository(db)
            agent = await repo.get_agent_by_id(parsed_id)

            if not agent:
                return json.dumps({"ok": False, "error": f"Agent '{agent_id}' not found."})
            if agent.user_id != user_id:
                return json.dumps({"ok": False, "error": f"Agent '{agent_id}' does not belong to you."})
            if agent.scope == AgentScope.SYSTEM:
                return json.dumps({"ok": False, "error": "Cannot delete system agents."})
            if agent.id == root_agent_id:
                return json.dumps({"ok": False, "error": "Cannot delete the root agent."})

            agent_name = agent.name

            # Cascade: clean up marketplace listing if exists
            marketplace_repo = AgentMarketplaceRepository(db)
            listing = await marketplace_repo.get_by_agent_id(agent.id)
            if listing:
                await marketplace_repo.delete_listing(listing.id)

            await repo.delete_agent(parsed_id)
            await db.commit()

            result = {
                "ok": True,
                "agent_id": agent_id,
                "message": f"Agent '{agent_name}' deleted successfully.",
            }

    except Exception as e:
        logger.exception("Failed to delete agent %s", agent_id)
        result = {"ok": False, "error": f"Failed to delete agent: {e}"}

    return json.dumps(result, ensure_ascii=False)


__all__ = ["create_agent_management_tools_for_session"]
