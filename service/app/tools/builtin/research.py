"""
Research-specific tools for deep research agents.

These tools are ONLY available to components that declare
ToolCapability.RESEARCH in their required_capabilities.

Regular agents CANNOT access these tools - they are internal
to the deep_research workflow and created by the component itself.

Tools:
- think_tool: Strategic reflection for research planning
- ConductResearch: Delegate research tasks using web_search
- ResearchComplete: Signal research completion
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool, tool

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool


###################
# Think Tool
###################


@tool(description="Strategic reflection tool for research planning")
def think_tool(reflection: str) -> str:
    """Tool for strategic reflection on research progress and decision-making.

    Use this tool after each search to analyze results and plan next steps systematically.
    This creates a deliberate pause in the research workflow for quality decision-making.

    When to use:
    - After receiving search results: What key information did I find?
    - Before deciding next steps: Do I have enough to answer comprehensively?
    - When assessing research gaps: What specific information am I still missing?
    - Before concluding research: Can I provide a complete answer now?

    Reflection should address:
    1. Analysis of current findings - What concrete information have I gathered?
    2. Gap assessment - What crucial information is still missing?
    3. Quality evaluation - Do I have sufficient evidence/examples for a good answer?
    4. Strategic decision - Should I continue searching or provide my answer?

    Args:
        reflection: Your detailed reflection on research progress, findings, gaps, and next steps

    Returns:
        Confirmation that reflection was recorded for decision-making
    """
    return f"Reflection recorded: {reflection}"


###################
# ConductResearch Tool
###################


def create_conduct_research_tool(search_tool: "BaseTool") -> "BaseTool":
    """Create the ConductResearch tool that delegates to web_search.

    Args:
        search_tool: The web_search tool to use (required)

    Returns:
        ConductResearch tool instance
    """
    from app.agents.components.deep_research.state import ConductResearch

    def conduct_research_sync(research_topic: str) -> str:
        """Sync wrapper - not actually used since we always call async."""
        raise NotImplementedError("Use async version")

    async def conduct_research_async(research_topic: str) -> str:
        """Conduct research on a specific topic using web search.

        Args:
            research_topic: The topic to research, described in detail

        Returns:
            Search results for the topic
        """
        try:
            result = await search_tool.ainvoke({"query": research_topic})
            return f"Research findings for '{research_topic[:100]}...':\n\n{result}"
        except Exception as e:
            return f"Research on '{research_topic[:100]}...' encountered an issue: {e}"

    return StructuredTool.from_function(
        func=conduct_research_sync,
        coroutine=conduct_research_async,
        name="ConductResearch",
        description=(
            "Delegate research tasks to specialized sub-agents. "
            "Provide a detailed research topic (at least a paragraph) describing what to investigate. "
            "The sub-agent will search for information and return findings."
        ),
        args_schema=ConductResearch,
    )


###################
# ResearchComplete Tool
###################


def create_research_complete_tool() -> "BaseTool":
    """Create ResearchComplete tool to signal completion.

    Returns:
        ResearchComplete tool instance
    """
    from app.agents.components.deep_research.state import ResearchComplete

    return tool(ResearchComplete)


###################
# Tool Assembly
###################


def _find_web_search_tool(tools: list["BaseTool"]) -> "BaseTool | None":
    """Find the web_search tool from a list of tools.

    Args:
        tools: List of tools to search

    Returns:
        The web_search tool if found, None otherwise
    """
    for t in tools:
        if t.name == "web_search":
            return t
    return None


def get_research_tools(session_tools: list["BaseTool"]) -> list["BaseTool"]:
    """
    Get all research-specific tools.

    Called by deep_research components, NOT by prepare_tools().
    These tools are component-internal.

    Args:
        session_tools: Tools from the session (MCP tools, web_search, etc.)
            Must include a web_search tool (validated by GraphBuilder).

    Returns:
        List of research-specific tools combined with session tools

    Raises:
        RuntimeError: If web_search tool is not found in session_tools
    """
    # Find the web_search tool - should be present (validated by GraphBuilder)
    web_search_tool = _find_web_search_tool(session_tools)

    if web_search_tool is None:
        # This should never happen if GraphBuilder validates properly
        raise RuntimeError(
            "web_search tool not found. Deep research requires web_search capability. "
            "Ensure SearXNG or another web search provider is configured."
        )

    # Research control tools
    research_tools: list["BaseTool"] = [
        create_conduct_research_tool(web_search_tool),  # Delegate research tasks
        create_research_complete_tool(),  # Signal research completion
        think_tool,  # Strategic reflection
    ]

    # Add all session tools (MCP tools, web_search, etc.)
    research_tools.extend(session_tools)

    return research_tools


__all__ = [
    "think_tool",
    "create_conduct_research_tool",
    "create_research_complete_tool",
    "get_research_tools",
]
