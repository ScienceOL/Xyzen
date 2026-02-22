"""Integration tests for SessionStatsRepository."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.consume import ConsumeRecord
from app.models.message import Message
from app.models.sessions import Session
from app.models.topic import Topic
from app.repos.session_stats import SessionStatsRepository


@pytest.mark.integration
class TestSessionStatsRepository:
    """Integration tests for SessionStatsRepository."""

    @pytest.fixture
    def stats_repo(self, db_session: AsyncSession) -> SessionStatsRepository:
        return SessionStatsRepository(db_session)

    # ------------------------------------------------------------------
    # Helpers to seed data
    # ------------------------------------------------------------------

    async def _create_session(self, db: AsyncSession, user_id: str, agent_id=None) -> Session:
        session = Session(
            name="Test Session",
            user_id=user_id,
            agent_id=agent_id,
            is_active=True,
        )
        db.add(session)
        await db.flush()
        await db.refresh(session)
        return session

    async def _create_topic(self, db: AsyncSession, session_id) -> Topic:
        topic = Topic(
            name="Test Topic",
            session_id=session_id,
        )
        db.add(topic)
        await db.flush()
        await db.refresh(topic)
        return topic

    async def _create_message(
        self, db: AsyncSession, topic_id, role: str = "user", content: str = "hello", created_at=None
    ) -> Message:
        msg = Message(
            topic_id=topic_id,
            role=role,
            content=content,
        )
        db.add(msg)
        await db.flush()
        await db.refresh(msg)
        if created_at is not None:
            # Force a specific timestamp for date-based tests
            msg.created_at = created_at
            db.add(msg)
            await db.flush()
        return msg

    async def _create_consume_record(
        self,
        db: AsyncSession,
        session_id,
        user_id: str = "test-user",
        input_tokens: int | None = 100,
        output_tokens: int | None = 50,
        total_tokens: int | None = None,
        consume_state: str = "success",
        topic_id=None,
        derive_total: bool = True,
    ) -> ConsumeRecord:
        resolved_total = total_tokens
        if derive_total and resolved_total is None and input_tokens is not None and output_tokens is not None:
            resolved_total = input_tokens + output_tokens

        record = ConsumeRecord(
            user_id=user_id,
            amount=10,
            auth_provider="test",
            session_id=session_id,
            topic_id=topic_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=resolved_total,
            consume_state=consume_state,
        )
        db.add(record)
        await db.flush()
        await db.refresh(record)
        return record

    # ------------------------------------------------------------------
    # get_session_stats
    # ------------------------------------------------------------------

    async def test_get_session_stats_returns_none_for_missing(self, stats_repo: SessionStatsRepository) -> None:
        result = await stats_repo.get_session_stats(uuid4())
        assert result is None

    async def test_get_session_stats_empty_session(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        session = await self._create_session(db_session, "user-empty-stats")
        result = await stats_repo.get_session_stats(session.id)

        assert result is not None
        assert result.session_id == session.id
        assert result.topic_count == 0
        assert result.message_count == 0
        assert result.input_tokens == 0
        assert result.output_tokens == 0

    async def test_get_session_stats_with_data(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        agent_id = uuid4()
        session = await self._create_session(db_session, "user-stats-data", agent_id=agent_id)

        topic1 = await self._create_topic(db_session, session.id)
        topic2 = await self._create_topic(db_session, session.id)

        await self._create_message(db_session, topic1.id)
        await self._create_message(db_session, topic1.id)
        await self._create_message(db_session, topic2.id)

        await self._create_consume_record(db_session, session.id, "user-stats-data", input_tokens=100, output_tokens=50)
        await self._create_consume_record(
            db_session, session.id, "user-stats-data", input_tokens=200, output_tokens=100
        )
        # Failed record should not be counted in tokens
        await self._create_consume_record(
            db_session, session.id, "user-stats-data", input_tokens=999, output_tokens=999, consume_state="failed"
        )

        result = await stats_repo.get_session_stats(session.id)

        assert result is not None
        assert result.topic_count == 2
        assert result.message_count == 3
        assert result.input_tokens == 300  # 100 + 200 (failed excluded)
        assert result.output_tokens == 150  # 50 + 100

    # ------------------------------------------------------------------
    # get_agent_stats
    # ------------------------------------------------------------------

    async def test_get_agent_stats_empty(self, stats_repo: SessionStatsRepository, db_session: AsyncSession) -> None:
        agent_id = uuid4()
        result = await stats_repo.get_agent_stats(agent_id, "user-no-agent-stats")

        assert result.session_count == 0
        assert result.topic_count == 0
        assert result.message_count == 0

    async def test_get_agent_stats_with_data(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        user_id = "user-agent-stats"
        agent_id = uuid4()

        # Session 1: 1 topic, 2 messages
        s1 = await self._create_session(db_session, user_id, agent_id=agent_id)
        t1 = await self._create_topic(db_session, s1.id)
        await self._create_message(db_session, t1.id)
        await self._create_message(db_session, t1.id)
        await self._create_consume_record(db_session, s1.id, user_id, 100, 50)

        # Session 2: 1 topic, 1 message
        s2 = await self._create_session(db_session, user_id, agent_id=agent_id)
        t2 = await self._create_topic(db_session, s2.id)
        await self._create_message(db_session, t2.id)
        await self._create_consume_record(db_session, s2.id, user_id, 50, 25)

        result = await stats_repo.get_agent_stats(agent_id, user_id)
        assert result.session_count == 2
        assert result.topic_count == 2
        assert result.message_count == 3
        assert result.input_tokens == 150
        assert result.output_tokens == 75

    # ------------------------------------------------------------------
    # get_all_agent_stats_for_user
    # ------------------------------------------------------------------

    async def test_get_all_agent_stats_for_user_empty(self, stats_repo: SessionStatsRepository) -> None:
        result = await stats_repo.get_all_agent_stats_for_user("user-no-sessions")
        assert result == {}

    async def test_get_all_agent_stats_for_user_with_data(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        user_id = "user-all-agent-stats"
        agent_a = uuid4()
        agent_b = uuid4()

        # Agent A: 1 session, 1 topic, 1 message
        sa = await self._create_session(db_session, user_id, agent_id=agent_a)
        ta = await self._create_topic(db_session, sa.id)
        await self._create_message(db_session, ta.id)

        # Agent B: 1 session, 1 topic, 2 messages
        sb = await self._create_session(db_session, user_id, agent_id=agent_b)
        tb = await self._create_topic(db_session, sb.id)
        await self._create_message(db_session, tb.id)
        await self._create_message(db_session, tb.id)

        result = await stats_repo.get_all_agent_stats_for_user(user_id)

        assert str(agent_a) in result
        assert str(agent_b) in result
        assert result[str(agent_a)].message_count == 1
        assert result[str(agent_b)].message_count == 2

    # ------------------------------------------------------------------
    # get_daily_stats_for_agent
    # ------------------------------------------------------------------

    async def test_get_daily_stats_for_agent(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        user_id = "user-daily-stats"
        agent_id = uuid4()

        session = await self._create_session(db_session, user_id, agent_id=agent_id)
        topic = await self._create_topic(db_session, session.id)

        # Create messages: 2 today, 0 yesterday
        today = datetime.now(timezone.utc)
        await self._create_message(db_session, topic.id, created_at=today)
        await self._create_message(db_session, topic.id, created_at=today)

        result = await stats_repo.get_daily_stats_for_agent(agent_id, user_id, days=3)

        assert result.agent_id == agent_id
        assert len(result.daily_counts) == 3
        # The last day (today) should have 2 messages
        assert result.daily_counts[-1].message_count == 2

    # ------------------------------------------------------------------
    # get_yesterday_summary_for_agent
    # ------------------------------------------------------------------

    async def test_get_yesterday_summary_no_messages(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        user_id = "user-yesterday-empty"
        agent_id = uuid4()
        await self._create_session(db_session, user_id, agent_id=agent_id)

        result = await stats_repo.get_yesterday_summary_for_agent(agent_id, user_id)
        assert result.message_count == 0
        assert result.last_message_content is None

    async def test_get_yesterday_summary_with_messages(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        user_id = "user-yesterday-msgs"
        agent_id = uuid4()

        session = await self._create_session(db_session, user_id, agent_id=agent_id)
        topic = await self._create_topic(db_session, session.id)

        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        yesterday_noon = yesterday.replace(hour=12, minute=0, second=0, microsecond=0)

        await self._create_message(db_session, topic.id, role="user", content="question", created_at=yesterday_noon)
        await self._create_message(
            db_session, topic.id, role="assistant", content="answer text", created_at=yesterday_noon
        )

        result = await stats_repo.get_yesterday_summary_for_agent(agent_id, user_id)
        assert result.message_count == 2
        assert result.last_message_content == "answer text"

    async def test_yesterday_summary_truncates_long_content(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        user_id = "user-yesterday-long"
        agent_id = uuid4()

        session = await self._create_session(db_session, user_id, agent_id=agent_id)
        topic = await self._create_topic(db_session, session.id)

        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        yesterday_noon = yesterday.replace(hour=12, minute=0, second=0, microsecond=0)

        long_content = "x" * 300
        await self._create_message(
            db_session, topic.id, role="assistant", content=long_content, created_at=yesterday_noon
        )

        result = await stats_repo.get_yesterday_summary_for_agent(agent_id, user_id)
        assert result.last_message_content is not None
        assert len(result.last_message_content) == 203  # 200 chars + "..."
        assert result.last_message_content.endswith("...")

    # ------------------------------------------------------------------
    # get_topic_token_stats
    # ------------------------------------------------------------------

    async def test_get_topic_token_stats_ignores_latest_tokenless_success_row(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        session = await self._create_session(db_session, "user-topic-stats-1")
        topic = await self._create_topic(db_session, session.id)

        # Tokenized settlement row (older)
        await self._create_consume_record(
            db_session,
            session.id,
            user_id="user-topic-stats-1",
            input_tokens=120,
            output_tokens=30,
            topic_id=topic.id,
        )

        # Newer pre-deduction row with no token fields
        await self._create_consume_record(
            db_session,
            session.id,
            user_id="user-topic-stats-1",
            input_tokens=None,
            output_tokens=None,
            total_tokens=None,
            topic_id=topic.id,
        )

        result = await stats_repo.get_topic_token_stats(topic.id)
        assert result.total_tokens == 150

    async def test_get_topic_token_stats_derives_total_when_total_tokens_missing(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        session = await self._create_session(db_session, "user-topic-stats-2")
        topic = await self._create_topic(db_session, session.id)

        await self._create_consume_record(
            db_session,
            session.id,
            user_id="user-topic-stats-2",
            input_tokens=200,
            output_tokens=55,
            total_tokens=None,
            derive_total=False,
            topic_id=topic.id,
        )

        result = await stats_repo.get_topic_token_stats(topic.id)
        assert result.total_tokens == 255

    async def test_get_topic_token_stats_returns_zero_when_no_tokenized_rows(
        self, stats_repo: SessionStatsRepository, db_session: AsyncSession
    ) -> None:
        session = await self._create_session(db_session, "user-topic-stats-3")
        topic = await self._create_topic(db_session, session.id)

        await self._create_consume_record(
            db_session,
            session.id,
            user_id="user-topic-stats-3",
            input_tokens=None,
            output_tokens=None,
            total_tokens=None,
            topic_id=topic.id,
        )

        await self._create_consume_record(
            db_session,
            session.id,
            user_id="user-topic-stats-3",
            input_tokens=50,
            output_tokens=20,
            consume_state="failed",
            topic_id=topic.id,
        )

        result = await stats_repo.get_topic_token_stats(topic.id)
        assert result.total_tokens == 0
