"""Tool cost calculation utilities."""

from __future__ import annotations

import logging
from typing import Any

from app.tools.registry import BuiltinToolRegistry

logger = logging.getLogger(__name__)


def calculate_tool_cost(
    tool_name: str,
    tool_args: dict[str, Any] | None = None,
    tool_result: dict[str, Any] | None = None,
) -> int:
    """
    Calculate cost for a tool execution.

    Args:
        tool_name: Name of the tool
        tool_args: Tool input arguments
        tool_result: Tool execution result

    Returns:
        Cost in points
    """
    # Get tool cost config from registry
    tool_info = BuiltinToolRegistry.get_info(tool_name)
    if not tool_info or not tool_info.cost:
        return 0

    config = tool_info.cost
    cost = config.base_cost

    # Add input image cost (for generate_image with reference images)
    if config.input_image_cost and tool_args:
        image_ids = tool_args.get("image_ids")
        if image_ids:
            cost += config.input_image_cost * len(image_ids)

    # Add output file cost (for knowledge_write creating new files)
    if config.output_file_cost and tool_result:
        if isinstance(tool_result, dict):
            # Check if tool created a new file (not updated)
            # knowledge_write returns message like "Created file: filename"
            message = tool_result.get("message", "")
            if tool_result.get("success") and "Created" in message:
                cost += config.output_file_cost

    if cost > 0:
        logger.debug(f"Tool {tool_name} cost: {cost} (base={config.base_cost})")

    return cost


__all__ = ["calculate_tool_cost"]
