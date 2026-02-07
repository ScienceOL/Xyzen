"""Utility functions for the Deep Research components."""

from __future__ import annotations

from datetime import datetime

from langchain_core.messages import BaseMessage, MessageLikeRepresentation


def get_today_str() -> str:
    """Get current date formatted for display in prompts and outputs.

    Returns:
        Human-readable date string in format like 'Mon Jan 15, 2024'
    """
    now = datetime.now()
    return f"{now:%a} {now:%b} {now.day}, {now:%Y}"


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
    "get_today_str",
    "get_buffer_string",
]
