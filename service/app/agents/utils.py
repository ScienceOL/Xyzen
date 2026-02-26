"""
Agent Utilities - Shared utilities for agent implementations.

This module provides common utilities used across agent components,
graph builders, and other agent-related code.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


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


def dedup_tool_calls(tool_calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Detect and split tool calls that were incorrectly concatenated by streaming chunk merging.

    Some OpenAI-compatible providers (e.g., GPUGeek) return the same `index` for
    different tool calls in streaming mode. LangChain merges chunks by index,
    causing two distinct tool calls to be concatenated into one:
      - id: "toolu_01AAAtoolu_01BBB"
      - name: "knowledge_readknowledge_read"

    This function detects the concatenation pattern and splits them back into
    individual tool calls.
    """
    # Split concatenated ids at known tool call id prefix boundaries
    _ID_PREFIXES = ("toolu_", "call_", "chatcmpl-")
    _SPLIT_PATTERN = re.compile(r"(?=" + "|".join(re.escape(p) for p in _ID_PREFIXES) + r")")

    result: list[dict[str, Any]] = []
    for tc in tool_calls:
        tc_id = tc.get("id", "") or ""

        # Split the id at prefix boundaries
        id_parts = [p for p in _SPLIT_PATTERN.split(tc_id) if p]
        if len(id_parts) <= 1:
            result.append(tc)
            continue

        # Concatenation detected — attempt to split
        tc_name = tc.get("name", "") or ""
        logger.warning(
            "[ToolCallDedup] Detected concatenated tool call: id=%s, name=%s — splitting into %d calls",
            tc_id,
            tc_name,
            len(id_parts),
        )

        # Try to split args (concatenated JSON objects)
        args_raw = tc.get("args")
        if isinstance(args_raw, dict):
            # Already parsed as first JSON object (second was discarded by parser)
            args_list: list[Any] = [args_raw] + [{}] * (len(id_parts) - 1)
        elif isinstance(args_raw, str):
            args_list = _split_json_objects(args_raw, len(id_parts))
        else:
            args_list = [{}] * len(id_parts)

        # Split name — if names are concatenated, try to find repeating pattern
        names = _split_repeated_name(tc_name, len(id_parts))

        for i, part_id in enumerate(id_parts):
            part_args = args_list[i] if i < len(args_list) else {}
            part_name = names[i] if i < len(names) else tc_name
            result.append(
                {
                    "name": part_name,
                    "args": part_args,
                    "id": part_id,
                    "type": "tool_call",
                }
            )

    return result


def _split_json_objects(raw: str, expected: int) -> list[Any]:
    """Try to split concatenated JSON objects like '{"a":1}{"b":2}'."""
    objects: list[Any] = []
    decoder = json.JSONDecoder()
    idx = 0
    raw = raw.strip()
    while idx < len(raw) and len(objects) < expected:
        try:
            obj, end = decoder.raw_decode(raw, idx)
            objects.append(obj)
            idx = end
            # Skip whitespace between objects
            while idx < len(raw) and raw[idx] in " \t\n\r":
                idx += 1
        except json.JSONDecodeError:
            break
    # Pad with empty dicts if we couldn't parse enough
    while len(objects) < expected:
        objects.append({})
    return objects


def _split_repeated_name(name: str, expected: int) -> list[str]:
    """Split a repeated name like 'knowledge_readknowledge_read' into parts."""
    if expected <= 1:
        return [name]
    # Try splitting into N equal parts
    if len(name) % expected == 0:
        part_len = len(name) // expected
        candidate = name[:part_len]
        if candidate * expected == name:
            return [candidate] * expected
    # Fallback: return the full name for all parts
    return [name] * expected


# Export
__all__ = [
    "extract_text_from_content",
    "dedup_tool_calls",
]
