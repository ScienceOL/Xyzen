"""
Memory Search Tool

LangChain tool for searching historical chat messages (agent memory).
Allows agents to search their own conversation history across all topics/sessions.

Each agent can only access messages from sessions where it was the assigned agent,
scoped by user_id for security.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from app.infra.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


# --- Input Schema ---


class MemorySearchInput(BaseModel):
    """Input schema for memory_search tool."""

    query: str = Field(
        description=(
            "Search query to find in message history. "
            "The search will match against message content using case-insensitive partial matching."
        )
    )
    max_results: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Maximum number of results to return (1-50, default 10).",
    )


# --- Result Formatting ---


def _format_memory_result(
    content: str,
    role: str,
    topic_name: str,
    created_at: datetime,
    max_snippet_length: int = 500,
) -> dict[str, Any]:
    """Format a single memory search result."""
    # Truncate content if too long
    snippet = content[:max_snippet_length] + "..." if len(content) > max_snippet_length else content

    return {
        "role": role,
        "content_snippet": snippet,
        "topic": topic_name,
        "timestamp": created_at.isoformat(),
    }


# --- Tool Implementation ---


async def _search_memory(
    user_id: str,
    agent_id: UUID,
    current_topic_id: UUID | None,
    query: str,
    max_results: int,
) -> dict[str, Any]:
    """
    Search historical messages for an agent.

    Searches across all sessions where this agent was assigned,
    filtered by user_id for security. Excludes current topic to avoid redundancy.

    Args:
        user_id: User ID for access control
        agent_id: Agent ID to scope the search
        current_topic_id: Current topic ID to exclude from results
        query: Search query string
        max_results: Maximum number of results

    Returns:
        Dict with success status and matching messages
    """
    try:
        async with AsyncSessionLocal() as db:
            from app.repos.message import MessageRepository

            message_repo = MessageRepository(db)

            results: list[dict[str, Any]] = await message_repo.search_messages_by_agent(
                user_id=user_id,
                agent_id=agent_id,
                query=query,
                limit=max_results,
                exclude_topic_id=current_topic_id,
            )

            if not results:
                return {
                    "success": True,
                    "message": f"No messages found matching '{query}'",
                    "results": [],
                    "count": 0,
                }

            formatted_results = [
                _format_memory_result(
                    content=str(msg["content"]),
                    role=str(msg["role"]),
                    topic_name=str(msg["topic_name"]),
                    created_at=msg["created_at"],
                )
                for msg in results
            ]

            return {
                "success": True,
                "query": query,
                "results": formatted_results,
                "count": len(formatted_results),
            }

    except Exception as e:
        logger.error(f"Error searching memory: {e}")
        return {
            "success": False,
            "error": f"Failed to search memory: {e!s}",
            "results": [],
        }


# --- Tool Factory Functions ---


def create_memory_tools() -> dict[str, BaseTool]:
    """
    Create placeholder memory tools for registry.

    These tools require runtime context (user_id, agent_id) to function.
    The actual working tools are created via create_memory_tools_for_agent().

    Returns:
        Dict mapping tool_id to BaseTool placeholder
    """

    async def memory_search_placeholder(query: str, max_results: int = 10) -> dict[str, Any]:
        return {
            "error": "Memory tools require agent context binding. This tool is a placeholder.",
            "success": False,
        }

    tools: dict[str, BaseTool] = {}

    tools["memory_search"] = StructuredTool(
        name="memory_search",
        description=(
            "Search your conversation history for relevant past messages. "
            "Use this to recall previous discussions, find information mentioned before, "
            "or understand context from past conversations. "
            "Returns matching messages with their role (user/assistant), content snippet, "
            "topic name, and timestamp."
        ),
        args_schema=MemorySearchInput,
        coroutine=memory_search_placeholder,
    )

    return tools


def create_memory_tools_for_agent(
    user_id: str,
    agent_id: UUID,
    current_topic_id: UUID | None = None,
) -> list[BaseTool]:
    """
    Create memory tools bound to a specific agent context.

    Args:
        user_id: User ID for access control
        agent_id: Agent ID to scope memory search
        current_topic_id: Current topic ID to exclude from results (optional)

    Returns:
        List of context-bound memory tools
    """
    tools: list[BaseTool] = []

    async def search_memory_bound(query: str, max_results: int = 10) -> dict[str, Any]:
        """Search conversation history with bound context."""
        return await _search_memory(
            user_id=user_id,
            agent_id=agent_id,
            current_topic_id=current_topic_id,
            query=query,
            max_results=max_results,
        )

    tools.append(
        StructuredTool(
            name="memory_search",
            description=(
                "Search your conversation history for relevant past messages. "
                "Use this to recall previous discussions, find information mentioned before, "
                "or understand context from past conversations. "
                "Returns matching messages with their role (user/assistant), content snippet, "
                "topic name, and timestamp."
            ),
            args_schema=MemorySearchInput,
            coroutine=search_memory_bound,
        )
    )

    return tools


__all__ = ["create_memory_tools", "create_memory_tools_for_agent", "MemorySearchInput"]
