"""
Tool Capability System - Declares standard tool capabilities for filtering.

This module provides:
- ToolCapability enum for standard capabilities
- Tool name to capabilities mapping
- Functions to get and filter tools by capabilities

Components declare which capabilities they require via metadata.required_capabilities.
At build time, GraphBuilder uses this system to filter tools passed to components.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool


class ToolCapability(StrEnum):
    """Standard tool capabilities.

    Components declare required capabilities, and the graph builder
    filters tools to only those matching the declared capabilities.
    """

    # Search and retrieval
    WEB_SEARCH = "web_search"
    KNOWLEDGE_RETRIEVAL = "knowledge"
    MEMORY = "memory"

    # Content generation
    IMAGE_GENERATION = "image_gen"
    IMAGE_ANALYSIS = "image_analysis"
    CODE_EXECUTION = "code_exec"

    # File operations
    FILE_OPERATIONS = "file_ops"

    # Research-specific (component-internal, not user-facing)
    RESEARCH = "research"
    THINK = "think"


# Tool name -> capabilities mapping
# This maps known tool names to their capabilities
TOOL_CAPABILITY_MAP: dict[str, list[str]] = {
    # Web search tools
    "web_search": [ToolCapability.WEB_SEARCH],
    "searxng_search": [ToolCapability.WEB_SEARCH],
    "google_search": [ToolCapability.WEB_SEARCH],
    "bing_search": [ToolCapability.WEB_SEARCH],
    "tavily_search": [ToolCapability.WEB_SEARCH],
    "web_fetch": [ToolCapability.WEB_SEARCH],
    "literature_search": [ToolCapability.WEB_SEARCH],
    # Knowledge tools
    "knowledge_list": [ToolCapability.KNOWLEDGE_RETRIEVAL],
    "knowledge_read": [ToolCapability.KNOWLEDGE_RETRIEVAL, ToolCapability.FILE_OPERATIONS],
    "knowledge_write": [ToolCapability.KNOWLEDGE_RETRIEVAL, ToolCapability.FILE_OPERATIONS],
    "knowledge_search": [ToolCapability.KNOWLEDGE_RETRIEVAL],
    "knowledge_query": [ToolCapability.KNOWLEDGE_RETRIEVAL],
    "rag_query": [ToolCapability.KNOWLEDGE_RETRIEVAL],
    # Memory tools
    "memory_search": [ToolCapability.MEMORY],
    "memory_store": [ToolCapability.MEMORY],
    # Image tools
    "generate_image": [ToolCapability.IMAGE_GENERATION],
    "read_image": [ToolCapability.IMAGE_ANALYSIS],
    "image_generation": [ToolCapability.IMAGE_GENERATION],
    "dalle": [ToolCapability.IMAGE_GENERATION],
    # Research tools (component-internal)
    "ConductResearch": [ToolCapability.RESEARCH],
    "ResearchComplete": [ToolCapability.RESEARCH],
    # Think tool (component-internal)
    "think_tool": [ToolCapability.THINK, ToolCapability.RESEARCH],
    "think": [ToolCapability.THINK],
}


def get_tool_capabilities(tool: "BaseTool") -> list[str]:
    """
    Get capabilities for a tool.

    First checks for explicit capability metadata on the tool,
    then falls back to name-based mapping.

    Args:
        tool: The LangChain tool instance

    Returns:
        List of capability strings
    """
    # Check explicit capability metadata first (tool.metadata["capabilities"])
    if hasattr(tool, "metadata") and tool.metadata and "capabilities" in tool.metadata:
        return list(tool.metadata["capabilities"])

    # Fall back to name-based mapping
    return list(TOOL_CAPABILITY_MAP.get(tool.name, []))


def filter_tools_by_capabilities(
    tools: list["BaseTool"],
    required_capabilities: list[str],
) -> list["BaseTool"]:
    """
    Filter tools to those providing required capabilities.

    Args:
        tools: List of available tools
        required_capabilities: List of capability strings required

    Returns:
        List of tools that have at least one matching capability.
        If required_capabilities is empty, returns all tools.
    """
    if not required_capabilities:
        return tools  # No filter = all tools

    required_set = set(required_capabilities)
    result: list["BaseTool"] = []

    for tool in tools:
        tool_caps = set(get_tool_capabilities(tool))
        if tool_caps & required_set:  # Any overlap
            result.append(tool)

    return result


def register_tool_capabilities(tool_name: str, capabilities: list[str]) -> None:
    """
    Register capabilities for a tool name.

    This allows dynamically adding capability mappings for custom tools.

    Args:
        tool_name: The name of the tool
        capabilities: List of capability strings
    """
    TOOL_CAPABILITY_MAP[tool_name] = capabilities


# Export
__all__ = [
    "ToolCapability",
    "TOOL_CAPABILITY_MAP",
    "get_tool_capabilities",
    "filter_tools_by_capabilities",
    "register_tool_capabilities",
]
