"""
Tool preparation for agents.

Single entry point for assembling tools based on:
1. Agent tool_config.enabled_tools (list of tool IDs)
2. Auto-enabled tools (knowledge when knowledge_set exists)
3. Context availability (user_id, knowledge_set_id)
"""

from __future__ import annotations

import base64
import json
import logging
from typing import TYPE_CHECKING, Any

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import Field, create_model
from sqlmodel.ext.asyncio.session import AsyncSession

if TYPE_CHECKING:
    from uuid import UUID

    from langgraph.store.base import BaseStore

    from app.models.agent import Agent

logger = logging.getLogger(__name__)


async def prepare_tools(
    db: AsyncSession,
    agent: "Agent | None",
    session_id: "UUID | None" = None,
    user_id: str | None = None,
    session_knowledge_set_id: "UUID | None" = None,
    topic_id: "UUID | None" = None,
    exclude_ask_user: bool = False,
) -> list[BaseTool]:
    """
    Prepare all tools for an agent based on configuration.

    Tool loading rules:
    1. Check tool_config.enabled_tools for explicitly enabled tool IDs
    2. Auto-enable knowledge tools if knowledge_set_id is set
    3. Check context requirements (user_id, etc.) before loading
    4. Research tools: NOT loaded here - components create them internally

    Args:
        db: Database session
        agent: Agent with tool_config JSON field (optional)
        session_id: Session UUID for session-level MCP tools (optional)
        user_id: User ID for knowledge tools context (optional)
        session_knowledge_set_id: Session-level knowledge set override (optional).
            If provided, overrides agent.knowledge_set_id for this session.
        topic_id: Current topic ID for memory tools (optional).
            Used to exclude current conversation from memory search results.

    Returns:
        List of LangChain BaseTool instances ready for agent use
    """
    langchain_tools: list[BaseTool] = []

    # 0. Resolve memory store (async-safe, handles stale Celery loops)
    memory_store: BaseStore | None = None
    if user_id:
        from app.configs import configs as app_configs

        if app_configs.Memory.Enabled:
            from app.core.memory.service import get_or_initialize_memory_service

            memory_svc = await get_or_initialize_memory_service()
            memory_store = memory_svc.store if memory_svc else None

    # 1. Load all available builtin tools
    builtin_tools = _load_all_builtin_tools(
        agent,
        user_id,
        session_knowledge_set_id,
        topic_id,
        session_id,
        memory_store,
        exclude_ask_user=exclude_ask_user,
    )
    langchain_tools.extend(builtin_tools)

    # 2. Load MCP tools (custom user MCPs)
    mcp_tools = await _load_mcp_tools(db, agent, session_id)
    langchain_tools.extend(mcp_tools)

    # 3. Load skill tools (requires DB query + session binding)
    skill_tools = await _load_skill_tools(db, agent, session_id, user_id)
    langchain_tools.extend(skill_tools)

    logger.info(f"Loaded {len(langchain_tools)} tools (builtin + MCP)")
    logger.debug(f"Tool names: {[t.name for t in langchain_tools]}")

    return langchain_tools


def _load_all_builtin_tools(
    agent: "Agent | None",
    user_id: str | None = None,
    session_knowledge_set_id: "UUID | None" = None,
    topic_id: "UUID | None" = None,
    session_id: "UUID | None" = None,
    memory_store: "BaseStore | None" = None,
    exclude_ask_user: bool = False,
) -> list[BaseTool]:
    """
    Load all available builtin tools.

    - Web search + fetch: loaded if SearXNG is enabled
    - Literature search: always loaded
    - Knowledge tools: loaded if effective knowledge_set_id exists and user_id is available
    - Image tools: loaded if image generation is enabled and user_id is available
    - Memory tools: loaded if agent and user_id are available (currently disabled)
    - Sandbox tools: loaded if sandbox is enabled and session_id is available

    Args:
        agent: Agent instance (for knowledge_set_id fallback and memory tools)
        user_id: User ID for knowledge, image, and memory tools
        session_knowledge_set_id: Session-level knowledge set override.
            If provided, takes priority over agent.knowledge_set_id.
        topic_id: Current topic ID for memory tools (optional).
            Used to exclude current conversation from memory search results.
        session_id: Session UUID for sandbox tools (optional).

    Returns:
        List of available builtin BaseTool instances
    """
    from app.tools import BuiltinToolRegistry

    tools: list[BaseTool] = []

    # Load web search tools if available in registry (registered at startup if SearXNG enabled)
    web_search = BuiltinToolRegistry.get("web_search")
    if web_search:
        tools.append(web_search)
        # Load web fetch tool (bundled with web_search)
        web_fetch = BuiltinToolRegistry.get("web_fetch")
        if web_fetch:
            tools.append(web_fetch)

    # Load literature search tool if available
    literature_search = BuiltinToolRegistry.get("literature_search")
    if literature_search:
        tools.append(literature_search)

    # Determine effective knowledge_set_id
    # Priority: session override > agent config
    effective_knowledge_set_id = session_knowledge_set_id or (agent.knowledge_set_id if agent else None)

    # Load knowledge tools if we have an effective knowledge_set_id
    if effective_knowledge_set_id and user_id:
        from app.tools.builtin.knowledge import create_knowledge_tools_for_agent

        knowledge_tools = create_knowledge_tools_for_agent(
            user_id=user_id,
            knowledge_set_id=effective_knowledge_set_id,
        )
        tools.extend(knowledge_tools)

    # Load image tools if user_id is available
    if user_id:
        from app.tools.builtin.image import create_image_tools_for_agent

        image_tools = create_image_tools_for_agent(
            user_id=user_id,
            session_id=str(session_id) if session_id else None,
        )
        tools.extend(image_tools)

    # Load file reader tools if user_id is available
    if user_id:
        from app.tools.builtin.file_reader import create_file_reader_tools_for_agent

        file_reader_tools = create_file_reader_tools_for_agent(user_id=user_id)
        tools.extend(file_reader_tools)

    # Load video tools if user_id is available
    if user_id:
        from app.tools.builtin.video import create_video_tools_for_agent

        video_tools = create_video_tools_for_agent(
            user_id=user_id,
            session_id=str(session_id) if session_id else None,
        )
        tools.extend(video_tools)

    # Load memory tools if user_id is available and memory store was pre-resolved
    if user_id and memory_store:
        from app.configs import configs as app_configs
        from app.tools.builtin.memory import create_memory_tools_for_agent

        memory_tools = create_memory_tools_for_agent(
            user_id=user_id,
            store=memory_store,
        )
        tools.extend(memory_tools)

        # Core memory tools (read/update always-in-context profile)
        if app_configs.Memory.CoreMemory.Enabled:
            from app.tools.builtin.memory import create_core_memory_tools_for_agent

            core_memory_tools = create_core_memory_tools_for_agent(
                user_id=user_id,
                store=memory_store,
            )
            tools.extend(core_memory_tools)

    # Load sandbox tools if enabled and session_id is available
    if session_id:
        from app.configs import configs as app_configs

        if app_configs.Sandbox.Enable:
            from app.tools.builtin.sandbox import create_sandbox_tools_for_session

            sandbox_tools = create_sandbox_tools_for_session(
                session_id=str(session_id),
                user_id=user_id,
            )
            tools.extend(sandbox_tools)

    # Load scheduled task tools if user_id and session_id are available
    if user_id and session_id:
        from app.tools.builtin.subagent.context import get_session_factory

        _session_factory = get_session_factory()
        if _session_factory:
            from app.tools.builtin.scheduled_task import create_scheduled_task_tools_for_session

            agent_id_for_sched = agent.id if agent else None
            if agent_id_for_sched:
                sched_tools = create_scheduled_task_tools_for_session(
                    user_id=user_id,
                    agent_id=agent_id_for_sched,
                    session_id=session_id,
                    topic_id=topic_id or session_id,  # fallback to session_id if no topic
                    session_factory=_session_factory,
                )
                tools.extend(sched_tools)

            # Load skill management tools (reuse _session_factory)
            from app.tools.builtin.skill_management import create_skill_management_tools_for_session

            skill_mgmt_tools = create_skill_management_tools_for_session(
                user_id=user_id,
                session_factory=_session_factory,
            )
            tools.extend(skill_mgmt_tools)

    # Load ask_user_question tool (skip in headless auto-explore mode)
    if not exclude_ask_user:
        from app.tools.builtin.ask_user_question import create_ask_user_question_tool

        tools.append(create_ask_user_question_tool())

    return tools


async def _load_skill_tools(
    db: AsyncSession,
    agent: "Agent | None",
    session_id: "UUID | None",
    user_id: str | None = None,
) -> list[BaseTool]:
    """
    Load skill activation tools if the agent has attached skills.

    Requires both a valid agent (to query skills) and a session_id
    (for sandbox resource deployment).

    Args:
        db: Database session
        agent: Agent instance
        session_id: Session UUID
        user_id: User ID for sandbox limit enforcement

    Returns:
        List of skill tools (activate_skill, list_skill_resources) or empty list
    """
    if not agent or not session_id:
        return []

    try:
        from app.repos.skill import SkillRepository

        repo = SkillRepository(db)
        skills = await repo.get_skills_for_agent(agent.id)
        if not skills:
            return []

        from app.tools.builtin.skills import SkillInfo, create_skill_tools_for_session

        skill_infos = [
            SkillInfo(
                name=s.name,
                description=s.description,
                resource_prefix=s.resource_prefix,
                id=str(s.id),
                root_folder_id=str(s.root_folder_id) if s.root_folder_id else None,
            )
            for s in skills
        ]

        return create_skill_tools_for_session(
            skills=skill_infos,
            session_id=str(session_id),
            user_id=user_id,
        )

    except Exception:
        logger.exception("Failed to load skill tools for agent %s", agent.id)
        return []


async def _load_mcp_tools(
    db: AsyncSession,
    agent: "Agent | None",
    session_id: "UUID | None",
) -> list[BaseTool]:
    """
    Load MCP tools from agent configuration.

    Args:
        db: Database session
        agent: Agent instance
        session_id: Session UUID

    Returns:
        List of MCP tools as LangChain BaseTool instances
    """
    from app.tools.mcp import prepare_mcp_tools

    langchain_tools: list[BaseTool] = []

    mcp_tools = await prepare_mcp_tools(db, agent, session_id)

    for tool in mcp_tools:
        tool_name = tool.get("name", "")
        tool_description = tool.get("description", "")
        tool_parameters = tool.get("parameters", {})

        structured_tool = await _create_structured_tool(
            tool_name=tool_name,
            tool_description=tool_description,
            tool_parameters=tool_parameters,
            db=db,
            agent=agent,
            session_id=session_id,
        )
        langchain_tools.append(structured_tool)

    return langchain_tools


async def _create_structured_tool(
    tool_name: str,
    tool_description: str,
    tool_parameters: dict[str, Any],
    db: AsyncSession,
    agent: "Agent | None",
    session_id: Any,
) -> StructuredTool:
    """
    Create a LangChain StructuredTool from MCP tool definition.

    Args:
        tool_name: Name of the tool
        tool_description: Tool description for the LLM
        tool_parameters: JSON schema defining tool parameters
        db: Database session
        agent: Agent instance
        session_id: Session UUID

    Returns:
        StructuredTool instance
    """
    properties = tool_parameters.get("properties", {})
    required = tool_parameters.get("required", [])

    # Build Pydantic field definitions for create_model
    field_definitions = _build_field_definitions(properties, required)

    # Create dynamic Pydantic model
    ArgsSchema = create_model(f"{tool_name}Args", **field_definitions)

    # Create tool execution function
    tool_func = await _make_tool_executor(tool_name, db, agent, session_id)

    return StructuredTool(
        name=tool_name,
        description=tool_description,
        args_schema=ArgsSchema,
        coroutine=tool_func,
    )


def _build_field_definitions(
    properties: dict[str, Any],
    required: list[str],
) -> dict[str, Any]:
    """
    Build Pydantic field definitions from JSON schema properties.

    Args:
        properties: JSON schema properties dict
        required: List of required property names

    Returns:
        Dict of field definitions for Pydantic create_model
    """
    from typing import Optional

    # Map JSON schema types to Python types
    type_mapping: dict[str, type] = {
        "integer": int,
        "number": float,
        "boolean": bool,
        "array": list,
        "object": dict,
        "string": str,
    }

    field_definitions: dict[str, Any] = {}

    for prop_name, prop_info in properties.items():
        prop_type = prop_info.get("type", "string")
        prop_desc = prop_info.get("description", "")
        is_required = prop_name in required

        python_type = type_mapping.get(prop_type, str)

        # Use create_model compatible format: (type, Field(...))
        if is_required:
            field_definitions[prop_name] = (python_type, Field(description=prop_desc))
        else:
            field_definitions[prop_name] = (
                Optional[python_type],
                Field(default=None, description=prop_desc),
            )

    return field_definitions


async def _make_tool_executor(
    tool_name: str,
    db: AsyncSession,
    agent: "Agent | None",
    session_id: Any,
) -> Any:
    """
    Create an async tool execution function with closure over tool context.

    Args:
        tool_name: Name of the tool
        db: Database session
        agent: Agent instance
        session_id: Session UUID

    Returns:
        Async function that executes the tool
    """
    from app.tools.mcp import execute_tool_call

    async def tool_func(**kwargs: Any) -> Any:
        """Execute the tool with given arguments."""
        try:
            args_json = json.dumps(kwargs)
            result = await execute_tool_call(db, tool_name, args_json, agent, session_id)

            # Format result for AI consumption
            if isinstance(result, list):
                return _format_list_result(result)

            return result

        except Exception as e:
            logger.error(f"Tool {tool_name} execution failed: {e}")
            return f"Error: {e}"

    return tool_func


def _format_list_result(result: list[Any]) -> list[Any]:
    """
    Format a list result from tool execution for AI consumption.

    Handles FastMCP Image objects and other content types.

    Args:
        result: List of result items

    Returns:
        Formatted list suitable for LLM consumption
    """
    formatted_content = []

    for item in result:
        # Check for FastMCP Image object (has data and format attributes)
        if hasattr(item, "data") and hasattr(item, "format") and item.format:
            # Convert to base64 image_url format
            b64_data = base64.b64encode(item.data).decode("utf-8")
            formatted_content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/{item.format};base64,{b64_data}",
                        "detail": "auto",
                    },
                }
            )
        elif hasattr(item, "type") and item.type == "text" and hasattr(item, "text"):
            formatted_content.append({"type": "text", "text": item.text})
        else:
            formatted_content.append(item)

    return formatted_content


# Backward compatibility alias
prepare_langchain_tools = prepare_tools


__all__ = [
    "prepare_tools",
    "prepare_langchain_tools",  # Backward compatibility
]
