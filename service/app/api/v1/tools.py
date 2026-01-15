"""
Tools API - Builtin tools listing endpoint.
"""

from fastapi import APIRouter

from app.tools.registry import BuiltinToolRegistry, ToolInfo

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[ToolInfo])
async def list_builtin_tools() -> list[ToolInfo]:
    """
    List all available builtin tools.

    Returns tools that can be enabled per-agent via the tool_ids field.
    """
    return BuiltinToolRegistry.list_all()


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
