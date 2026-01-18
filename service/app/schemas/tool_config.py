"""
Generic tool configuration schema for agent settings.

This schema uses tool IDs from BuiltinToolRegistry, not hardcoded field names.
When a new tool is added to the registry, enable it by adding its ID to
enabled_tools - no Pydantic model changes needed.
"""

from pydantic import BaseModel, Field


class ToolConfig(BaseModel):
    """
    Generic tool configuration for agents.

    Uses tool IDs from BuiltinToolRegistry, not hardcoded field names.
    When a new tool is added to the registry, enable it by adding its ID
    to enabled_tools - no Pydantic model changes needed.

    Example:
        {
            "enabled_tools": ["web_search", "generate_image"],
            "tool_params": {
                "web_search": {"max_results": 10}
            }
        }
    """

    enabled_tools: list[str] = Field(
        default_factory=list,
        description="List of enabled tool IDs from BuiltinToolRegistry",
        examples=[["web_search", "generate_image"]],
    )

    tool_params: dict[str, dict] = Field(
        default_factory=dict,
        description="Per-tool parameter overrides, keyed by tool ID",
        examples=[{"web_search": {"max_results": 10}}],
    )

    class Config:
        extra = "allow"  # Allow future fields without model changes


def get_default_enabled_tools() -> list[str]:
    """
    Get default enabled tools for new agents.

    Returns common tools that most agents should have.
    Advanced tools (research, etc.) are opt-in via JSON.
    """
    return ["web_search"]  # Default: only web search enabled


__all__ = ["ToolConfig", "get_default_enabled_tools"]
