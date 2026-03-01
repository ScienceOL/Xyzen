"""
Memory Tools - LangGraph Store-backed cross-thread memory for agents.

Uses langmem library for production-ready memory tools:
- manage_memory: Create/update/delete memories (single tool with action param)
- search_memory: Semantic search across memories

Core Memory tools (Xyzen-native):
- read_core_memory: View the always-in-context user profile
- update_core_memory: Update a section of the user profile

Memories are namespaced per user: (NamespacePrefix, "{user_id}").
The {user_id} template is resolved from config["configurable"]["user_id"] at runtime.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from langchain_core.tools import BaseTool, StructuredTool
from langmem import create_manage_memory_tool, create_search_memory_tool
from pydantic import BaseModel, Field

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


# ---------------------------------------------------------------------------
# Core Memory tools (read/update the always-in-context user profile)
# ---------------------------------------------------------------------------


class UpdateCoreMemoryInput(BaseModel):
    """Input schema for the update_core_memory tool."""

    section: str = Field(
        ...,
        description=("Which section to update. One of: user_summary, preferences, active_context, working_rules"),
    )
    content: str = Field(
        ...,
        description="New content for the section (max 500 chars). This REPLACES the current content.",
    )


def create_core_memory_tools_for_agent(
    user_id: str,
    store: "BaseStore",
) -> list[BaseTool]:
    """Create core memory read/update tools bound to a specific user.

    Args:
        user_id: User ID for core memory namespace scoping
        store: LangGraph BaseStore instance (unused directly, service accesses it)

    Returns:
        List of core memory tools (read_core_memory, update_core_memory)
    """
    from app.core.memory.schemas import CORE_MEMORY_SECTIONS

    async def _read_core_memory() -> str:
        """Read the user's core memory profile. Returns structured JSON with all sections."""
        from app.core.memory.service import get_memory_service

        svc = get_memory_service()
        if not svc or not svc.store:
            return json.dumps({"error": "Memory service unavailable"})
        block = await svc.get_core_memory(user_id)
        return block.model_dump_json(indent=2)

    async def _update_core_memory(section: str, content: str) -> str:
        """Update a specific section of the user's core memory profile."""
        from app.core.memory.service import get_memory_service

        if section not in CORE_MEMORY_SECTIONS:
            valid = ", ".join(CORE_MEMORY_SECTIONS)
            return json.dumps({"error": f"Invalid section. Must be one of: {valid}"})
        svc = get_memory_service()
        if not svc or not svc.store:
            return json.dumps({"error": "Memory service unavailable"})
        try:
            await svc.update_core_memory_section(user_id, section, content)
            return json.dumps({"success": True, "updated_section": section})
        except Exception as e:
            logger.warning("Failed to update core memory section %s: %s", section, e)
            return json.dumps({"error": "Failed to update core memory"})

    return [
        StructuredTool.from_function(
            coroutine=_read_core_memory,
            name="read_core_memory",
            description=(
                "Read the user's core memory profile containing: user_summary, "
                "preferences, active_context, and working_rules. Use this to check "
                "what you know about the user before updating."
            ),
        ),
        StructuredTool.from_function(
            coroutine=_update_core_memory,
            name="update_core_memory",
            description=(
                "Update a specific section of the user's core memory profile. "
                "Sections: user_summary (who they are), preferences (communication style), "
                "active_context (current projects), working_rules (explicit rules). "
                "Content REPLACES the section entirely, so include all relevant info."
            ),
            args_schema=UpdateCoreMemoryInput,
        ),
    ]


__all__ = [
    "create_memory_tools",
    "create_memory_tools_for_agent",
    "create_core_memory_tools_for_agent",
]
