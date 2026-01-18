"""
Agent System - Unified agent creation and management.

Public API:
- create_chat_agent: Main factory function
- list_builtin_keys: Get available builtin agent keys
- get_builtin_config: Get a builtin agent's GraphConfig
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def __getattr__(name: str) -> Any:
    """Lazy import to avoid circular imports."""
    if name == "create_chat_agent":
        from .factory import create_chat_agent

        return create_chat_agent
    if name == "list_builtin_keys":
        from .builtin import list_builtin_keys

        return list_builtin_keys
    if name == "get_builtin_config":
        from .builtin import get_builtin_config

        return get_builtin_config
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "create_chat_agent",
    "list_builtin_keys",
    "get_builtin_config",
]
