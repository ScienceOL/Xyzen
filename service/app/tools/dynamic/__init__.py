"""
Dynamic Tool System - User-created tools stored in database.

.. deprecated::
    This module is deprecated and will be replaced in a future refactor.
    The MCP-based dynamic tool system will be redesigned.

Current functionality (maintained for backward compatibility):
1. Created via MCP tool management (create_tool, update_tool, etc.)
2. Stored in database (Tool, ToolVersion, ToolFunction models)
3. Executed in Docker/K8s sandbox containers
"""

import warnings

warnings.warn(
    "app.tools.dynamic is deprecated and will be refactored. Do not build new features on this module.",
    DeprecationWarning,
    stacklevel=2,
)

from app.tools.dynamic.loader import DatabaseToolLoader, tool_loader  # noqa: E402
from app.tools.dynamic.manager import register_manage_tools  # noqa: E402

__all__ = ["DatabaseToolLoader", "tool_loader", "register_manage_tools"]
