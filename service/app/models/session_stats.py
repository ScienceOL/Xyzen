"""
SessionStats schema for aggregated session usage statistics.

This is NOT a database table - stats are computed by aggregating data from:
- sessions: session count per agent
- messages: message count per session/agent
- consume: token usage aggregated from consumption records

The schemas here are used for API responses only.
"""

from uuid import UUID

from pydantic import BaseModel


class SessionStatsRead(BaseModel):
    """Read schema for session statistics (aggregated, not stored)."""

    session_id: UUID
    agent_id: UUID | None
    topic_count: int = 0
    message_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


class AgentStatsAggregated(BaseModel):
    """Aggregated stats for an agent across all sessions."""

    agent_id: UUID
    session_count: int = 0
    topic_count: int = 0
    message_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


class UserStatsAggregated(BaseModel):
    """Aggregated stats for a user across all agents."""

    user_id: str
    agent_count: int = 0
    session_count: int = 0
    topic_count: int = 0
    message_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
