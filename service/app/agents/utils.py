"""
Agent Utilities - Shared utilities for agent implementations.

This module provides common utilities used across agent components,
graph builders, and other agent-related code.
"""

from __future__ import annotations

from typing import Any


def extract_text_from_content(content: str | list | Any) -> str:
    """
    Extract text from LLM response content.

    LLMs may return content as either a plain string or a list of content blocks
    (e.g., [{'type': 'text', 'text': '...'}]). This function handles both cases.

    Args:
        content: The content field from an LLM response. Can be:
            - Plain string
            - List of content blocks: [{"type": "text", "text": "..."}]
            - List of strings
            - Any other type (converted to string)

    Returns:
        Plain text string extracted from the content

    Examples:
        >>> extract_text_from_content("Hello")
        'Hello'
        >>> extract_text_from_content([{"type": "text", "text": "Hello"}])
        'Hello'
        >>> extract_text_from_content([{"type": "text", "text": "Hello "}, {"type": "text", "text": "World"}])
        'Hello World'
    """
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        texts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                texts.append(item.get("text", ""))
            elif isinstance(item, str):
                texts.append(item)
        return "".join(texts)

    return str(content)


# Export
__all__ = [
    "extract_text_from_content",
]
