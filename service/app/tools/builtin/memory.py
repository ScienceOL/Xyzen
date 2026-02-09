"""
Memory Tools - LangGraph Store-backed cross-thread memory for agents.

Uses langmem library for production-ready memory tools:
- manage_memory: Create/update/delete memories (single tool with action param)
- search_memory: Semantic search across memories

Memories are namespaced per user: (NamespacePrefix, "{user_id}").
The {user_id} template is resolved from config["configurable"]["user_id"] at runtime.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from langchain_core.tools import BaseTool
from langmem import create_manage_memory_tool, create_search_memory_tool

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore

logger = logging.getLogger(__name__)


def create_memory_tools() -> dict[str, BaseTool]:
    """
    Create placeholder memory tools for registry.

    These use a dummy namespace; the actual working tools are created
    via create_memory_tools_for_agent() with real store and namespace.
    """
    from app.configs import configs

    namespace = (configs.Memory.NamespacePrefix, "{user_id}")

    return {
        "manage_memory": create_manage_memory_tool(namespace),
        "search_memory": create_search_memory_tool(namespace),
    }


def create_memory_tools_for_agent(
    user_id: str,
    store: "BaseStore",
) -> list[BaseTool]:
    """
    Create memory tools bound to a specific user context and store.

    Args:
        user_id: User ID for namespace scoping (used in {user_id} template)
        store: LangGraph BaseStore instance

    Returns:
        List of context-bound memory tools (manage_memory, search_memory)
    """
    from app.configs import configs

    namespace = (configs.Memory.NamespacePrefix, "{user_id}")

    return [
        create_manage_memory_tool(namespace, store=store),
        create_search_memory_tool(namespace, store=store),
    ]


__all__ = ["create_memory_tools", "create_memory_tools_for_agent"]
