"""
SessionStats schema for aggregated session usage statistics.

This is NOT a database table - stats are computed by aggregating data from:
- sessions: session count per agent
- messages: message count per session/agent
- consume: token usage aggregated from consumption records

The schemas here are used for API responses only.
"""

from datetime import date
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


class DailyMessageCount(BaseModel):
    """Message count for a specific day."""

    date: date
    message_count: int


class DailyStatsResponse(BaseModel):
    """Daily activity stats for a session/agent (last N days)."""

    agent_id: UUID
    daily_counts: list[DailyMessageCount]


class YesterdaySummary(BaseModel):
    """Summary of yesterday's activity for a session."""

    agent_id: UUID
    message_count: int
    last_message_content: str | None = None
    summary: str | None = None  # Optional AI-generated summary
