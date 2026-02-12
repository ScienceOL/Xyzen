"""Unit tests for session_stats Pydantic models (API response schemas only, no DB tables)."""

from datetime import date
from uuid import uuid4

from app.models.session_stats import (
    AgentStatsAggregated,
    DailyMessageCount,
    DailyStatsResponse,
    SessionStatsRead,
    UserStatsAggregated,
    YesterdaySummary,
)


class TestSessionStatsRead:
    def test_defaults(self) -> None:
        sid = uuid4()
        stats = SessionStatsRead(session_id=sid, agent_id=None)
        assert stats.topic_count == 0
        assert stats.message_count == 0
        assert stats.input_tokens == 0
        assert stats.output_tokens == 0

    def test_with_values(self) -> None:
        sid = uuid4()
        aid = uuid4()
        stats = SessionStatsRead(
            session_id=sid,
            agent_id=aid,
            topic_count=5,
            message_count=100,
            input_tokens=50000,
            output_tokens=25000,
        )
        assert stats.session_id == sid
        assert stats.agent_id == aid
        assert stats.topic_count == 5


class TestAgentStatsAggregated:
    def test_defaults(self) -> None:
        aid = uuid4()
        stats = AgentStatsAggregated(agent_id=aid)
        assert stats.session_count == 0
        assert stats.topic_count == 0
        assert stats.message_count == 0
        assert stats.input_tokens == 0
        assert stats.output_tokens == 0


class TestUserStatsAggregated:
    def test_defaults(self) -> None:
        stats = UserStatsAggregated(user_id="user-1")
        assert stats.agent_count == 0
        assert stats.session_count == 0


class TestDailyMessageCount:
    def test_fields(self) -> None:
        d = DailyMessageCount(date=date(2024, 1, 15), message_count=42)
        assert d.date == date(2024, 1, 15)
        assert d.message_count == 42


class TestDailyStatsResponse:
    def test_nested_list(self) -> None:
        aid = uuid4()
        counts = [
            DailyMessageCount(date=date(2024, 1, 1), message_count=10),
            DailyMessageCount(date=date(2024, 1, 2), message_count=20),
        ]
        resp = DailyStatsResponse(agent_id=aid, daily_counts=counts)
        assert len(resp.daily_counts) == 2
        assert resp.daily_counts[0].message_count == 10

    def test_empty_counts(self) -> None:
        aid = uuid4()
        resp = DailyStatsResponse(agent_id=aid, daily_counts=[])
        assert resp.daily_counts == []


class TestYesterdaySummary:
    def test_optional_fields(self) -> None:
        aid = uuid4()
        summary = YesterdaySummary(agent_id=aid, message_count=5)
        assert summary.last_message_content is None
        assert summary.summary is None

    def test_with_content(self) -> None:
        aid = uuid4()
        summary = YesterdaySummary(
            agent_id=aid,
            message_count=3,
            last_message_content="Latest reply",
            summary="A brief summary",
        )
        assert summary.last_message_content == "Latest reply"
        assert summary.summary == "A brief summary"
