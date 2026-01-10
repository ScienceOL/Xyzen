"""Utility functions for the Deep Research agent."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from langchain_core.messages import AIMessage, BaseMessage, MessageLikeRepresentation, filter_messages
from langchain_core.tools import tool

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool

from app.agents.system.deep_research.state import ResearchComplete


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
# Tool Utilities
###################


def get_research_tools(session_tools: list["BaseTool"]) -> list["BaseTool"]:
    """Combine session tools with research-specific tools.

    Args:
        session_tools: Tools from the session (MCP tools, Google search, etc.)

    Returns:
        List of all tools available to researchers
    """
    # Research control tools
    research_tools: list["BaseTool"] = [
        tool(ResearchComplete),  # Signal research completion
        think_tool,  # Strategic reflection
    ]

    # Add all session tools (MCP tools, Google search if enabled)
    research_tools.extend(session_tools)

    return research_tools


def get_notes_from_tool_calls(messages: list[MessageLikeRepresentation]) -> list[str]:
    """Extract notes/content from tool call messages.

    Args:
        messages: List of messages containing tool calls

    Returns:
        List of tool message contents as strings
    """
    result: list[str] = []
    for tool_msg in filter_messages(messages, include_types="tool"):
        content = tool_msg.content
        if isinstance(content, str):
            result.append(content)
        else:
            result.append(str(content))
    return result


###################
# Message Utilities
###################


def remove_up_to_last_ai_message(
    messages: list[MessageLikeRepresentation],
) -> list[MessageLikeRepresentation]:
    """Truncate message history by removing up to the last AI message.

    This is useful for handling token limit exceeded errors by removing recent context.

    Args:
        messages: List of message objects to truncate

    Returns:
        Truncated message list up to (but not including) the last AI message
    """
    # Search backwards through messages to find the last AI message
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], AIMessage):
            # Return everything up to (but not including) the last AI message
            return messages[:i]

    # No AI messages found, return original list
    return messages


def get_tool_message_content(messages: list[MessageLikeRepresentation]) -> str:
    """Extract content from all tool and AI messages.

    Args:
        messages: List of messages to extract content from

    Returns:
        Concatenated content from tool and AI messages
    """
    filtered = filter_messages(messages, include_types=["tool", "ai"])
    return "\n".join(str(message.content) for message in filtered)


###################
# Date Utilities
###################


def get_today_str() -> str:
    """Get current date formatted for display in prompts and outputs.

    Returns:
        Human-readable date string in format like 'Mon Jan 15, 2024'
    """
    now = datetime.now()
    return f"{now:%a} {now:%b} {now.day}, {now:%Y}"


###################
# Buffer Utilities
###################


def get_buffer_string(messages: list[MessageLikeRepresentation]) -> str:
    """Convert messages to a string buffer for prompt formatting.

    Args:
        messages: List of messages to convert

    Returns:
        Formatted string representation of messages
    """
    buffer_parts: list[str] = []
    for msg in messages:
        # Handle actual message objects (most common case)
        if isinstance(msg, BaseMessage):
            role = msg.type
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
        # Handle string messages
        elif isinstance(msg, str):
            role = "unknown"
            content = msg
        # Handle tuple messages (role, content)
        elif isinstance(msg, tuple) and len(msg) == 2:
            role = str(msg[0])
            content = str(msg[1])
        # Handle dict messages
        elif isinstance(msg, dict):
            role = str(msg.get("type", msg.get("role", "unknown")))
            content = str(msg.get("content", msg))
        # Handle list and other types
        else:
            role = "unknown"
            content = str(msg)

        buffer_parts.append(f"{role}: {content}")

    return "\n".join(buffer_parts)


__all__ = [
    "think_tool",
    "get_research_tools",
    "get_notes_from_tool_calls",
    "remove_up_to_last_ai_message",
    "get_tool_message_content",
    "get_today_str",
    "get_buffer_string",
]
