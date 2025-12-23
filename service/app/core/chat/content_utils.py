"""
Content extraction utilities for chat messages and tool results.

This module provides robust functions to extract and format content from various sources,
particularly handling the TextContent object representations that come from MCP tools.
"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


def extract_text_content(content: Any) -> str:
    """
    Safely extract text from TextContent objects, strings, or other content types.

    This function handles multiple formats:
    1. Direct text content (str)
    2. TextContent object string representations
    3. Nested JSON content
    4. Complex object structures

    Args:
        content (Any): Content to extract text from

    Returns:
        str: Extracted and formatted text content
    """
    if content is None:
        return ""

    # Handle direct objects with text attribute
    if hasattr(content, "text"):
        return str(content.text)

    # Handle string content
    if isinstance(content, str):
        return _extract_from_string_content(content)

    # Handle dict content
    if isinstance(content, dict):
        return _extract_from_dict_content(content)

    # Handle list content
    if isinstance(content, list):
        return _extract_from_list_content(content)

    # Fallback to string conversion
    return str(content)


def _extract_from_string_content(content: str) -> str:
    """Extract content from string representations."""
    content = content.strip()

    # Check if it's a TextContent string representation
    if content.startswith("[TextContent") and "text=" in content:
        return _parse_textcontent_string(content)

    # Try to parse as JSON first
    try:
        parsed = json.loads(content)
        return _extract_from_parsed_json(parsed)
    except json.JSONDecodeError:
        pass

    # Return as-is if it's plain text
    return content


def _parse_textcontent_string(textcontent_str: str) -> str:
    """
    Parse TextContent string representation to extract the actual text content.

    Handles formats like:
    - [TextContent(type='text', text='{"status": "success", ...}')]
    - [TextContent(type='text', text='plain text')]
    """
    try:
        # More robust regex patterns to handle various quote styles and escaping
        patterns = [
            r"text='([^']*)'",  # Single quotes
            r'text="([^"]*)"',  # Double quotes
            r"text=([^,\]]+)",  # Unquoted text until comma or bracket
        ]

        for pattern in patterns:
            match = re.search(pattern, textcontent_str)
            if match:
                extracted_text = match.group(1)

                # Try to parse the extracted text as JSON
                try:
                    parsed = json.loads(extracted_text)
                    return _format_parsed_json(parsed)
                except json.JSONDecodeError:
                    # Return the extracted text as-is if it's not JSON
                    return extracted_text

        # If regex fails, try a more aggressive approach
        logger.warning(f"Could not parse TextContent string with regex: {textcontent_str[:100]}...")
        return _fallback_textcontent_parse(textcontent_str)

    except Exception as e:
        logger.error(f"Error parsing TextContent string: {e}")
        return textcontent_str


def _fallback_textcontent_parse(textcontent_str: str) -> str:
    """Fallback parsing for complex TextContent strings."""
    # Remove the TextContent wrapper and try to extract content
    content = textcontent_str
    if content.startswith("[TextContent("):
        content = content[len("[TextContent(") :]  # noqa: E203
    if content.endswith(")]"):
        content = content[:-2]

    # Look for text= pattern and extract everything after it
    text_start = content.find("text=")
    if text_start != -1:
        text_content = content[text_start + 5 :]  # noqa: E203
        # Remove leading/trailing quotes if present
        text_content = text_content.strip("'\"")
        return text_content

    return textcontent_str


def _extract_from_dict_content(content: dict[str, Any]) -> str:
    """Extract meaningful content from dictionary structures."""
    # Check for common content fields
    if "text" in content:
        return extract_text_content(content["text"])

    if "content" in content:
        return extract_text_content(content["content"])

    if "message" in content:
        return extract_text_content(content["message"])

    if "result" in content:
        return extract_text_content(content["result"])

    # If it looks like a structured response, format it nicely
    return _format_parsed_json(content)


def _extract_from_list_content(content: Any) -> str:
    """Extract content from list structures."""
    if not content:
        return ""

    # If it's a list of objects, try to extract from the first one
    first_item = content[0]
    if hasattr(first_item, "text"):
        return str(first_item.text)

    # If it's a list of dictionaries, format them
    if isinstance(first_item, dict):
        if len(content) == 1:
            return _extract_from_dict_content(first_item)
        else:
            # Multiple items, format as a list
            return json.dumps(content, indent=2, ensure_ascii=False)

    # Join string items
    return "\n".join(str(item) for item in content)


def _extract_from_parsed_json(parsed: Any) -> str:
    """Extract meaningful content from already-parsed JSON."""
    if isinstance(parsed, dict):
        return _extract_from_dict_content(parsed)
    elif isinstance(parsed, list):
        return _extract_from_list_content(parsed)
    else:
        return str(parsed)


def _format_parsed_json(data: Any) -> str:
    """Format parsed JSON data for display."""
    try:
        return json.dumps(data, indent=2, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(data)


def format_tool_result_for_ai(result: Any) -> str:
    """
    Format tool result specifically for AI consumption.

    This creates a clean, structured format that the AI can easily parse and use.
    """
    extracted = extract_text_content(result)

    # If the extracted content is JSON, try to create a summary
    try:
        data = json.loads(extracted)
        if isinstance(data, dict):
            # Create a structured summary for the AI
            if "status" in data and "message" in data:
                # Standard response format
                return f"Status: {data['status']}\nMessage: {data['message']}"
            elif len(data) < 10:  # Small dict, show key-value pairs
                return "\n".join(f"{k}: {v}" for k, v in data.items())
    except (json.JSONDecodeError, TypeError):
        pass

    return extracted


def format_tool_result_for_display(result: Any) -> dict[str, Any]:
    """
    Format tool result for frontend display.

    Returns a structured object that the frontend can render properly.
    """
    extracted = extract_text_content(result)

    # Try to parse as JSON for structured display
    try:
        parsed_data = json.loads(extracted)
        return {"type": "json", "content": parsed_data, "raw": extracted}
    except (json.JSONDecodeError, TypeError):
        pass

    # Return as plain text
    return {"type": "text", "content": extracted, "raw": str(result)}
