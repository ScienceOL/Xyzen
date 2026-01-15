"""
LangChain tool preparation for agents.

Prepares tools from:
1. Builtin tools (web_search, knowledge_* etc.) - always loaded when available
2. MCP servers (via mcp_server_ids on Agent)

Tool filtering is handled by graph_config.tool_config.tool_filter at execution time.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import TYPE_CHECKING, Any, Optional

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import Field, create_model
from sqlmodel.ext.asyncio.session import AsyncSession

if TYPE_CHECKING:
    from uuid import UUID

    from app.models.agent import Agent

logger = logging.getLogger(__name__)


async def prepare_langchain_tools(
    db: AsyncSession,
    agent: "Agent | None",
    session_id: "UUID | None" = None,
    user_id: str | None = None,
    session_knowledge_set_id: "UUID | None" = None,
) -> list[BaseTool]:
    """
    Prepare LangChain tools from builtin tools and MCP servers.

    All available tools are loaded. Filtering is done by graph_config at runtime.

    Tool loading order:
    1. Builtin tools (web_search, knowledge_* etc.) - always loaded when available
    2. MCP tools from agent.mcp_server_ids (custom user MCPs)

    Args:
        db: Database session
        agent: Agent instance (optional)
        session_id: Session UUID for session-level MCP tools (optional)
        user_id: User ID for knowledge tools context (optional)
        session_knowledge_set_id: Session-level knowledge set override (optional).
            If provided, overrides agent.knowledge_set_id for this session.

    Returns:
        List of LangChain BaseTool instances ready for agent use
    """
    langchain_tools: list[BaseTool] = []

    # 1. Load all available builtin tools
    builtin_tools = _load_all_builtin_tools(agent, user_id, session_knowledge_set_id)
    langchain_tools.extend(builtin_tools)

    # 2. Load MCP tools (custom user MCPs)
    from app.agents.mcp_tools import prepare_mcp_tools

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

    logger.info(f"Loaded {len(langchain_tools)} tools (builtin + MCP)")
    logger.debug(f"Tool names: {[t.name for t in langchain_tools]}")

    return langchain_tools


def _load_all_builtin_tools(
    agent: "Agent | None",
    user_id: str | None = None,
    session_knowledge_set_id: "UUID | None" = None,
) -> list[BaseTool]:
    """
    Load all available builtin tools.

    - Web search: loaded if SearXNG is enabled
    - Knowledge tools: loaded if effective knowledge_set_id exists and user_id is available
    - Image tools: loaded if image generation is enabled and user_id is available

    Args:
        agent: Agent instance (for knowledge_set_id fallback)
        user_id: User ID for knowledge and image tools
        session_knowledge_set_id: Session-level knowledge set override.
            If provided, takes priority over agent.knowledge_set_id.

    Returns:
        List of available builtin BaseTool instances
    """
    from app.configs import configs
    from app.tools import BuiltinToolRegistry

    tools: list[BaseTool] = []

    # Load web_search if available in registry (registered at startup if SearXNG enabled)
    web_search = BuiltinToolRegistry.get("web_search")
    if web_search:
        tools.append(web_search)

    # Determine effective knowledge_set_id
    # Priority: session override > agent config
    effective_knowledge_set_id = session_knowledge_set_id or (agent.knowledge_set_id if agent else None)

    # Load knowledge tools if we have an effective knowledge_set_id
    if effective_knowledge_set_id and user_id:
        from app.tools.knowledge import create_knowledge_tools_for_agent

        knowledge_tools = create_knowledge_tools_for_agent(
            user_id=user_id,
            knowledge_set_id=effective_knowledge_set_id,
        )
        tools.extend(knowledge_tools)

    # Load image tools if enabled and user_id is available
    if configs.Image.Enable and user_id:
        from app.tools.image import create_image_tools_for_agent

        image_tools = create_image_tools_for_agent(user_id=user_id)
        tools.extend(image_tools)

    return tools


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
    from app.agents.mcp_tools import execute_tool_call

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
