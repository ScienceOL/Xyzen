"""
Tools API - Builtin tools listing endpoint.
"""

from pydantic import BaseModel
from fastapi import APIRouter

from app.tools.registry import BuiltinToolRegistry, ToolInfo

router = APIRouter(prefix="/tools", tags=["tools"])


class AvailableToolsResponse(BaseModel):
    """Response model for available tools endpoint."""

    toggleable_tools: list[ToolInfo]
    default_enabled: list[str]


@router.get("", response_model=list[ToolInfo])
async def list_builtin_tools() -> list[ToolInfo]:
    """
    List all available builtin tools.

    Returns tools that can be enabled per-agent via the tool_ids field.
    """
    return BuiltinToolRegistry.list_all()


@router.get("/available", response_model=AvailableToolsResponse)
async def list_available_tools() -> AvailableToolsResponse:
    """
    List tools that can be enabled via tool_config.

    Returns tools that can be toggled in the agent settings UI,
    along with the default enabled tools for new agents.
    """
    return AvailableToolsResponse(
        toggleable_tools=BuiltinToolRegistry.list_ui_toggleable(),
        default_enabled=BuiltinToolRegistry.get_default_enabled_ids(),
    )


@router.get("/{tool_id}", response_model=ToolInfo | None)
async def get_tool(tool_id: str) -> ToolInfo | None:
    """
    Get details of a specific builtin tool.

    Args:
        tool_id: The tool ID (e.g., "web_search", "knowledge_read")

    Returns:
        Tool info or None if not found
    """
    return BuiltinToolRegistry.get_info(tool_id)
