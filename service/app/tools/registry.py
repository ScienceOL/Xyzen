"""
Builtin Tool Registry

Central registry for builtin LangChain tools that can be enabled per-agent.

Tools have metadata for UI display:
- ui_toggleable: Whether to show as a toggle in the agent settings UI
- default_enabled: Whether to enable by default for new agents
- requires_context: What runtime context is needed (e.g., ["user_id", "knowledge_set_id"])
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)


class ToolInfo(BaseModel):
    """Metadata about a builtin tool for API responses."""

    id: str
    name: str
    description: str
    category: str
    # UI display settings
    ui_toggleable: bool = Field(
        default=True,
        description="Whether to show as a toggle in the agent settings UI",
    )
    default_enabled: bool = Field(
        default=False,
        description="Whether to enable by default for new agents",
    )
    requires_context: list[str] = Field(
        default_factory=list,
        description="Runtime context requirements (e.g., ['user_id', 'knowledge_set_id'])",
    )


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
        ui_toggleable: bool = True,
        default_enabled: bool = False,
        requires_context: list[str] | None = None,
    ) -> None:
        """
        Register a builtin tool.

        Args:
            tool_id: Stable identifier for the tool (e.g., "web_search")
            tool: LangChain BaseTool instance
            category: Category for grouping (e.g., "search", "knowledge")
            display_name: Human-readable name (defaults to tool.name)
            ui_toggleable: Whether to show as toggle in UI (default: True)
            default_enabled: Whether enabled by default for new agents (default: False)
            requires_context: List of required context keys (e.g., ["user_id"])
        """
        cls._tools[tool_id] = tool
        cls._metadata[tool_id] = ToolInfo(
            id=tool_id,
            name=display_name or tool.name,
            description=tool.description or "",
            category=category,
            ui_toggleable=ui_toggleable,
            default_enabled=default_enabled,
            requires_context=requires_context or [],
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
    def list_ui_toggleable(cls) -> list[ToolInfo]:
        """List tools that can be toggled in the UI (for frontend)."""
        return [info for info in cls._metadata.values() if info.ui_toggleable]

    @classmethod
    def get_default_enabled_ids(cls) -> list[str]:
        """Get tool IDs that are enabled by default."""
        return [info.id for info in cls._metadata.values() if info.default_enabled]

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

    @classmethod
    def count(cls) -> int:
        """Return the number of registered tools."""
        return len(cls._tools)


def register_builtin_tools() -> None:
    """
    Register all builtin tools.

    Called at app startup to populate the registry.
    """
    from app.tools.builtin.fetch import create_web_fetch_tool
    from app.tools.builtin.knowledge import create_knowledge_tools
    from app.tools.builtin.literature import create_literature_search_tool
    from app.tools.builtin.search import create_web_search_tool

    # Register web search tool
    search_tool = create_web_search_tool()
    if search_tool:
        BuiltinToolRegistry.register(
            tool_id="web_search",
            tool=search_tool,
            category="search",
            display_name="Web Search",
            ui_toggleable=True,
            default_enabled=True,  # Web search enabled by default
            requires_context=[],
        )

    # Register web fetch tool (bundled with web_search, not separate toggle)
    fetch_tool = create_web_fetch_tool()
    BuiltinToolRegistry.register(
        tool_id="web_fetch",
        tool=fetch_tool,
        category="search",
        display_name="Web Fetch",
        ui_toggleable=False,  # Bundled with web_search
        default_enabled=True,
        requires_context=[],
    )

    # Register literature search tool
    literature_tool = create_literature_search_tool()
    BuiltinToolRegistry.register(
        tool_id="literature_search",
        tool=literature_tool,
        category="search",
        display_name="Literature Search",
        ui_toggleable=True,
        default_enabled=False,
        requires_context=[],
    )

    # Register knowledge tools (auto-enabled when knowledge_set exists, not UI toggleable)
    knowledge_tools = create_knowledge_tools()
    for tool_id, tool in knowledge_tools.items():
        BuiltinToolRegistry.register(
            tool_id=tool_id,
            tool=tool,
            category="knowledge",
            ui_toggleable=False,  # Auto-enabled based on context
            default_enabled=False,
            requires_context=["user_id", "knowledge_set_id"],
        )

    # Register memory tools (langmem-backed)
    from app.tools.builtin.memory import create_memory_tools

    memory_tools = create_memory_tools()
    for tool_id, tool in memory_tools.items():
        BuiltinToolRegistry.register(
            tool_id=tool_id,
            tool=tool,
            category="memory",
            display_name="Manage Memory" if tool_id == "manage_memory" else "Search Memory",
            ui_toggleable=True,
            default_enabled=True,
            requires_context=["user_id", "store"],
        )

    # Register image tools
    from app.tools.builtin.image import create_image_tools

    image_tools = create_image_tools()
    for tool_id, tool in image_tools.items():
        BuiltinToolRegistry.register(
            tool_id=tool_id,
            tool=tool,
            category="image",
            display_name=tool.name.replace("_", " ").title(),
            ui_toggleable=True,
            default_enabled=False,
            requires_context=["user_id"],
        )

    # Register video tools
    from app.tools.builtin.video import create_video_tools

    video_tools = create_video_tools()
    for tool_id, tool in video_tools.items():
        BuiltinToolRegistry.register(
            tool_id=tool_id,
            tool=tool,
            category="video",
            display_name=tool.name.replace("_", " ").title(),
            ui_toggleable=True,
            default_enabled=False,
            requires_context=["user_id"],
        )

    # Register sandbox tools (guarded by config flag)
    from app.configs import configs as app_configs

    if app_configs.Sandbox.Enable:
        from app.tools.builtin.sandbox import create_sandbox_tools

        sandbox_tools = create_sandbox_tools()
        for tool_id, tool in sandbox_tools.items():
            BuiltinToolRegistry.register(
                tool_id=tool_id,
                tool=tool,
                category="sandbox",
                display_name=tool.name.replace("_", " ").title(),
                ui_toggleable=True,
                default_enabled=False,
                requires_context=["session_id"],
            )

        # Register skill tools (require sandbox for resource deployment)
        from app.tools.builtin.skills import create_skill_tools

        skill_tools = create_skill_tools()
        for tool_id, tool in skill_tools.items():
            BuiltinToolRegistry.register(
                tool_id=tool_id,
                tool=tool,
                category="skills",
                display_name=tool.name.replace("_", " ").title(),
                ui_toggleable=False,  # Auto-enabled when agent has skills
                default_enabled=False,
                requires_context=["session_id"],
            )

    # Register subagent tool placeholder (actual tool is context-bound in factory)
    from langchain_core.tools import Tool

    subagent_placeholder = Tool(
        name="spawn_subagent",
        description="Spawn a subagent to handle a specific task autonomously",
        func=lambda _: None,
    )
    BuiltinToolRegistry.register(
        tool_id="spawn_subagent",
        tool=subagent_placeholder,
        category="subagent",
        display_name="Subagent",
        ui_toggleable=True,
        default_enabled=False,
        requires_context=[],
    )

    logger.info(f"Registered {BuiltinToolRegistry.count()} builtin tools")

    from app.core.consume.pricing import validate_pricing_coverage

    validate_pricing_coverage()


__all__ = ["BuiltinToolRegistry", "ToolInfo", "register_builtin_tools"]
