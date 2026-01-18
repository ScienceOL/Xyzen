"""Utility functions for the Deep Research agent.

Tool definitions (think_tool, get_research_tools) have been moved to
app.tools.builtin.research and are re-exported here for backward compatibility.
"""

from __future__ import annotations

from datetime import datetime

from langchain_core.messages import AIMessage, BaseMessage, MessageLikeRepresentation, filter_messages

# Re-export research tools from new location
from app.tools.builtin.research import get_research_tools, think_tool

###################
# Message Utilities
###################


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
