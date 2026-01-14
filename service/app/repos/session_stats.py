"""
Repository for session statistics aggregation.

Computes stats by querying sessions, topics, messages, and consume tables.
No separate stats table needed - all data is aggregated on demand using
efficient database-level aggregation queries.

Performance Note: Uses JOIN + GROUP BY for efficient single-pass aggregation.
Type hints are relaxed (type: ignore) because SQLAlchemy's typing doesn't
fully support all aggregation patterns, but runtime behavior is correct.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.consume import ConsumeRecord
from app.models.message import Message
from app.models.session_stats import (
    AgentStatsAggregated,
    DailyMessageCount,
    DailyStatsResponse,
    SessionStatsRead,
    YesterdaySummary,
)
from app.models.sessions import Session
from app.models.topic import Topic

logger = logging.getLogger(__name__)


class SessionStatsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_session_stats(self, session_id: UUID) -> SessionStatsRead | None:
        """
        Get aggregated stats for a specific session.

        Uses efficient database aggregation to compute counts in a single query.
        """
        # Get session info
        session_stmt = select(Session).where(col(Session.id) == session_id)
        session_result = await self.db.exec(session_stmt)
        session = session_result.first()

        if not session:
            return None

        # Count topics in this session
        topic_count_stmt = select(func.count(Topic.id)).where(col(Topic.session_id) == session_id)  # type: ignore
        topic_result = await self.db.exec(topic_count_stmt)
        topic_count = topic_result.one_or_none() or 0

        # Count messages in all topics of this session
        message_count_stmt = (
            select(func.count(Message.id))  # type: ignore[arg-type]
            .select_from(Message)
            .join(Topic, col(Message.topic_id) == col(Topic.id))
            .where(col(Topic.session_id) == session_id)
        )
        message_result = await self.db.exec(message_count_stmt)
        message_count = message_result.one_or_none() or 0

        # Aggregate tokens from consume table
        token_stmt = select(
            func.coalesce(func.sum(ConsumeRecord.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(ConsumeRecord.output_tokens), 0).label("output_tokens"),
        ).where(
            and_(
                col(ConsumeRecord.session_id) == session_id,
                col(ConsumeRecord.consume_state) == "success",
            )
        )
        token_result = await self.db.exec(token_stmt)
        token_row = token_result.first()

        return SessionStatsRead(
            session_id=session_id,
            agent_id=session.agent_id,
            topic_count=int(topic_count),
            message_count=int(message_count),
            input_tokens=int(token_row[0]) if token_row else 0,  # type: ignore[arg-type]
            output_tokens=int(token_row[1]) if token_row else 0,  # type: ignore[arg-type]
        )

    async def get_agent_stats(self, agent_id: UUID, user_id: str) -> AgentStatsAggregated:
        """
        Get aggregated stats for an agent across all user's sessions.

        Uses efficient database aggregation with JOIN to compute all counts
        in minimal queries (2 queries: counts + tokens).
        """
        # Single query to get session_count, topic_count, message_count using JOINs
        stats_stmt = (
            select(
                func.count(func.distinct(Session.id)).label("session_count"),
                func.count(func.distinct(Topic.id)).label("topic_count"),
                func.count(Message.id).label("message_count"),  # type: ignore[arg-type]
            )
            .select_from(Session)
            .outerjoin(Topic, col(Topic.session_id) == col(Session.id))
            .outerjoin(Message, col(Message.topic_id) == col(Topic.id))
            .where(
                and_(
                    col(Session.agent_id) == agent_id,
                    col(Session.user_id) == user_id,
                    col(Session.is_active) == True,  # noqa: E712
                )
            )
        )
        stats_result = await self.db.exec(stats_stmt)
        stats_row = stats_result.first()

        # Aggregate tokens from consume table for this agent's sessions
        token_stmt = (
            select(
                func.coalesce(func.sum(ConsumeRecord.input_tokens), 0).label("input_tokens"),
                func.coalesce(func.sum(ConsumeRecord.output_tokens), 0).label("output_tokens"),
            )
            .select_from(ConsumeRecord)
            .join(Session, col(ConsumeRecord.session_id) == col(Session.id))
            .where(
                and_(
                    col(Session.agent_id) == agent_id,
                    col(Session.user_id) == user_id,
                    col(ConsumeRecord.consume_state) == "success",
                )
            )
        )
        token_result = await self.db.exec(token_stmt)
        token_row = token_result.first()

        return AgentStatsAggregated(
            agent_id=agent_id,
            session_count=int(stats_row[0]) if stats_row else 0,  # type: ignore
            topic_count=int(stats_row[1]) if stats_row else 0,  # type: ignore
            message_count=int(stats_row[2]) if stats_row else 0,  # type: ignore
            input_tokens=int(token_row[0]) if token_row else 0,  # type: ignore
            output_tokens=int(token_row[1]) if token_row else 0,  # type: ignore
        )

    async def get_all_agent_stats_for_user(self, user_id: str) -> dict[str, AgentStatsAggregated]:
        """
        Get aggregated stats for all agents a user has used.

        Uses efficient database aggregation with GROUP BY to compute all stats
        in just two queries (one for counts, one for tokens).
        This is more efficient than querying per-agent.
        """
        # Single query to get all agent stats with GROUP BY using JOINs
        stats_stmt = (
            select(
                Session.agent_id,
                func.count(func.distinct(Session.id)).label("session_count"),
                func.count(func.distinct(Topic.id)).label("topic_count"),
                func.count(Message.id).label("message_count"),  # type: ignore[arg-type]
            )
            .select_from(Session)
            .outerjoin(Topic, col(Topic.session_id) == col(Session.id))
            .outerjoin(Message, col(Message.topic_id) == col(Topic.id))
            .where(
                and_(
                    col(Session.user_id) == user_id,
                    col(Session.agent_id).isnot(None),
                    col(Session.is_active) == True,  # noqa: E712
                )
            )
            .group_by(col(Session.agent_id))
        )
        stats_result = await self.db.exec(stats_stmt)
        stats_rows = list(stats_result.all())

        if not stats_rows:
            return {}

        # Single query to get token aggregates grouped by agent
        token_stmt = (
            select(
                Session.agent_id,
                func.coalesce(func.sum(ConsumeRecord.input_tokens), 0).label("input_tokens"),
                func.coalesce(func.sum(ConsumeRecord.output_tokens), 0).label("output_tokens"),
            )
            .select_from(ConsumeRecord)
            .join(Session, col(ConsumeRecord.session_id) == col(Session.id))
            .where(
                and_(
                    col(Session.user_id) == user_id,
                    col(Session.agent_id).isnot(None),
                    col(ConsumeRecord.consume_state) == "success",
                )
            )
            .group_by(col(Session.agent_id))
        )
        token_result = await self.db.exec(token_stmt)
        token_rows = list(token_result.all())

        # Build token lookup dict
        token_by_agent: dict[UUID, tuple[int, int]] = {}
        for row in token_rows:
            agent_id = row[0]
            if agent_id:
                token_by_agent[agent_id] = (int(row[1]), int(row[2]))  # type: ignore

        # Build result dict
        result: dict[str, AgentStatsAggregated] = {}
        for row in stats_rows:  # type: ignore
            agent_id = row[0]
            if agent_id:
                input_tokens, output_tokens = token_by_agent.get(agent_id, (0, 0))
                result[str(agent_id)] = AgentStatsAggregated(
                    agent_id=agent_id,
                    session_count=int(row[1]),  # type: ignore
                    topic_count=int(row[2]),  # type: ignore
                    message_count=int(row[3]),  # type: ignore
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )

        return result

    async def get_daily_stats_for_agent(self, agent_id: UUID, user_id: str, days: int = 7) -> DailyStatsResponse:
        """
        Get daily message counts for an agent's sessions over the last N days.

        Returns a list of (date, message_count) for activity visualization.
        """
        # Calculate date range
        today = datetime.now(timezone.utc).date()
        start_date = today - timedelta(days=days - 1)
        start_datetime = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)

        # Query messages grouped by date
        daily_stmt = (
            select(
                func.date(Message.created_at).label("day"),
                func.count(Message.id).label("message_count"),  # type: ignore[arg-type]
            )
            .select_from(Message)
            .join(Topic, col(Message.topic_id) == col(Topic.id))
            .join(Session, col(Topic.session_id) == col(Session.id))
            .where(
                and_(
                    col(Session.agent_id) == agent_id,
                    col(Session.user_id) == user_id,
                    col(Message.created_at) >= start_datetime,
                )
            )
            .group_by(func.date(Message.created_at))
            .order_by(func.date(Message.created_at))
        )
        daily_result = await self.db.exec(daily_stmt)
        daily_rows = list(daily_result.all())

        # Build a map of date -> count
        count_by_date: dict[date, int] = {}
        for row in daily_rows:
            day = row[0]  # type: ignore
            count = int(row[1])  # type: ignore
            if isinstance(day, str):
                day = datetime.strptime(day, "%Y-%m-%d").date()
            count_by_date[day] = count

        # Fill in all days (including zeros)
        daily_counts: list[DailyMessageCount] = []
        for i in range(days):
            day = start_date + timedelta(days=i)
            daily_counts.append(
                DailyMessageCount(
                    date=day,
                    message_count=count_by_date.get(day, 0),
                )
            )

        return DailyStatsResponse(
            agent_id=agent_id,
            daily_counts=daily_counts,
        )

    async def get_yesterday_summary_for_agent(self, agent_id: UUID, user_id: str) -> YesterdaySummary:
        """
        Get yesterday's activity summary for an agent's sessions.

        Returns the message count and optionally the last message content.
        """
        # Calculate yesterday's date range
        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)
        yesterday_start = datetime.combine(yesterday, datetime.min.time()).replace(tzinfo=timezone.utc)
        yesterday_end = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)

        # Count messages from yesterday
        count_stmt = (
            select(func.count(Message.id))  # type: ignore[arg-type]
            .select_from(Message)
            .join(Topic, col(Message.topic_id) == col(Topic.id))
            .join(Session, col(Topic.session_id) == col(Session.id))
            .where(
                and_(
                    col(Session.agent_id) == agent_id,
                    col(Session.user_id) == user_id,
                    col(Message.created_at) >= yesterday_start,
                    col(Message.created_at) < yesterday_end,
                )
            )
        )
        count_result = await self.db.exec(count_stmt)
        message_count = count_result.one_or_none() or 0

        # Get the last assistant message from yesterday (if any)
        last_message_stmt = (
            select(Message.content)
            .select_from(Message)
            .join(Topic, col(Message.topic_id) == col(Topic.id))
            .join(Session, col(Topic.session_id) == col(Session.id))
            .where(
                and_(
                    col(Session.agent_id) == agent_id,
                    col(Session.user_id) == user_id,
                    col(Message.created_at) >= yesterday_start,
                    col(Message.created_at) < yesterday_end,
                    col(Message.role) == "assistant",
                )
            )
            .order_by(col(Message.created_at).desc())
            .limit(1)
        )
        last_result = await self.db.exec(last_message_stmt)
        last_message = last_result.one_or_none()

        # Truncate long messages for preview
        last_content = None
        if last_message:
            content = str(last_message)
            last_content = content[:200] + "..." if len(content) > 200 else content

        return YesterdaySummary(
            agent_id=agent_id,
            message_count=int(message_count),
            last_message_content=last_content,
        )
