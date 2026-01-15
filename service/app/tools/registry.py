"""
Builtin Tool Registry

Central registry for builtin LangChain tools that can be enabled per-agent.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)


class ToolInfo(BaseModel):
    """Metadata about a builtin tool for API responses."""

    id: str
    name: str
    description: str
    category: str


class BuiltinToolRegistry:
    """
    Registry for builtin LangChain tools.

    Tools are registered at app startup and can be retrieved by ID.
    Each tool has a stable ID (e.g., "web_search", "knowledge_read").
    """

    _tools: dict[str, "BaseTool"] = {}
    _metadata: dict[str, ToolInfo] = {}

    @classmethod
    def register(
        cls,
        tool_id: str,
        tool: "BaseTool",
        category: str,
        display_name: str | None = None,
    ) -> None:
        """
        Register a builtin tool.

        Args:
            tool_id: Stable identifier for the tool (e.g., "web_search")
            tool: LangChain BaseTool instance
            category: Category for grouping (e.g., "search", "knowledge")
            display_name: Human-readable name (defaults to tool.name)
        """
        cls._tools[tool_id] = tool
        cls._metadata[tool_id] = ToolInfo(
            id=tool_id,
            name=display_name or tool.name,
            description=tool.description or "",
            category=category,
        )
        logger.debug(f"Registered builtin tool: {tool_id} ({category})")

    @classmethod
    def get(cls, tool_id: str) -> "BaseTool | None":
        """Get a tool by its ID."""
        return cls._tools.get(tool_id)

    @classmethod
    def get_info(cls, tool_id: str) -> ToolInfo | None:
        """Get tool metadata by ID."""
        return cls._metadata.get(tool_id)

    @classmethod
    def list_all(cls) -> list[ToolInfo]:
        """List all registered tools with metadata."""
        return list(cls._metadata.values())

    @classmethod
    def list_by_category(cls, category: str) -> list[ToolInfo]:
        """List tools filtered by category."""
        return [info for info in cls._metadata.values() if info.category == category]

    @classmethod
    def get_tools_by_ids(cls, tool_ids: list[str]) -> list["BaseTool"]:
        """
        Get multiple tools by their IDs.

        Args:
            tool_ids: List of tool IDs to retrieve

        Returns:
            List of BaseTool instances (skips unknown IDs)
        """
        tools: list["BaseTool"] = []
        for tool_id in tool_ids:
            tool = cls.get(tool_id)
            if tool:
                tools.append(tool)
            else:
                logger.warning(f"Unknown builtin tool ID: {tool_id}")
        return tools

    @classmethod
    def clear(cls) -> None:
        """Clear all registered tools (for testing)."""
        cls._tools.clear()
        cls._metadata.clear()


def register_builtin_tools() -> None:
    """
    Register all builtin tools.

    Called at app startup to populate the registry.
    """
    from app.configs import configs
    from app.tools.knowledge import create_knowledge_tools
    from app.tools.search import create_web_search_tool

    # Register web search tool
    search_tool = create_web_search_tool()
    if search_tool:
        BuiltinToolRegistry.register(
            tool_id="web_search",
            tool=search_tool,
            category="search",
            display_name="Web Search",
        )

    # Register knowledge tools
    knowledge_tools = create_knowledge_tools()
    for tool_id, tool in knowledge_tools.items():
        BuiltinToolRegistry.register(
            tool_id=tool_id,
            tool=tool,
            category="knowledge",
        )

    # Register image tools (if enabled)
    if configs.Image.Enable:
        from app.tools.image import create_image_tools

        image_tools = create_image_tools()
        for tool_id, tool in image_tools.items():
            BuiltinToolRegistry.register(
                tool_id=tool_id,
                tool=tool,
                category="image",
                display_name=tool.name.replace("_", " ").title(),
            )

    logger.info(f"Registered {len(BuiltinToolRegistry._tools)} builtin tools")


__all__ = ["BuiltinToolRegistry", "ToolInfo", "register_builtin_tools"]
