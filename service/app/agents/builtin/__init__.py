"""
Builtin Agent Configurations.

This module provides the registry for builtin agent configurations.
Each builtin agent is a GraphConfig that can be loaded by the agent factory
and built using GraphBuilder.

To add a new builtin agent:
1. Create a new config file (e.g., `my_agent.py`)
2. Export a GraphConfig from it
3. Register it in _load_builtin_configs() below

The builtin system eliminates the need for separate Python classes for each
system agent - agents are just JSON configs with optional ExecutableComponents.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas.graph_config import GraphConfig

logger = logging.getLogger(__name__)

# Registry of builtin agent keys to their configs
_BUILTIN_CONFIGS: dict[str, "GraphConfig"] = {}

# Track if configs have been loaded
_loaded = False


def get_builtin_config(key: str) -> "GraphConfig | None":
    """
    Get a builtin agent config by key.

    Args:
        key: The builtin agent key (e.g., "react", "deep_research")

    Returns:
        GraphConfig for the agent, or None if not found
    """
    _ensure_loaded()
    return _BUILTIN_CONFIGS.get(key)


def list_builtin_keys() -> list[str]:
    """
    List all available builtin agent keys.

    Returns:
        List of registered builtin agent keys
    """
    _ensure_loaded()
    return list(_BUILTIN_CONFIGS.keys())


def get_builtin_metadata(key: str) -> dict | None:
    """
    Get metadata for a builtin agent.

    Args:
        key: The builtin agent key

    Returns:
        Metadata dict from the config, or None if not found
    """
    config = get_builtin_config(key)
    if not config:
        return None

    return {
        "key": key,
        "display_name": config.metadata.get("display_name", key),
        "description": config.metadata.get("description", ""),
        "icon": config.metadata.get("icon"),
        "version": config.metadata.get("version", "1.0.0"),
        "author": config.metadata.get("author", "Xyzen"),
        "pattern": config.metadata.get("pattern"),
        "forkable": True,
    }


def list_builtin_metadata() -> list[dict]:
    """
    Get metadata for all builtin agents.

    Returns:
        List of metadata dictionaries
    """
    _ensure_loaded()
    result = []
    for key in _BUILTIN_CONFIGS:
        metadata = get_builtin_metadata(key)
        if metadata:
            result.append(metadata)
    return result


def _register_builtin(key: str, config: "GraphConfig") -> None:
    """Register a builtin agent config."""
    _BUILTIN_CONFIGS[key] = config
    logger.debug(f"Registered builtin agent: {key}")


def _ensure_loaded() -> None:
    """Ensure builtin configs are loaded."""
    global _loaded

    if _loaded:
        return

    _load_builtin_configs()
    _loaded = True


def _load_builtin_configs() -> None:
    """Load all builtin agent configs."""
    from app.agents.builtin.deep_research import DEEP_RESEARCH_CONFIG
    from app.agents.builtin.react import REACT_CONFIG

    _register_builtin("react", REACT_CONFIG)
    _register_builtin("deep_research", DEEP_RESEARCH_CONFIG)

    logger.info(f"Loaded {len(_BUILTIN_CONFIGS)} builtin agent configs")


# Export
__all__ = [
    "get_builtin_config",
    "list_builtin_keys",
    "get_builtin_metadata",
    "list_builtin_metadata",
]
