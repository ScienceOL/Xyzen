import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.session import SessionService
from app.models.message import MessageCreate
from app.models.sessions import SessionUpdate
from app.repos.message import MessageRepository
from app.repos.topic import TopicRepository
from tests.factories.session import SessionCreateFactory
from tests.factories.topic import TopicCreateFactory


@pytest.mark.integration
class TestSessionService:
    @pytest.fixture
    def session_service(self, db_session: AsyncSession) -> SessionService:
        return SessionService(db_session)

    async def test_default_session_roundtrip(self, session_service: SessionService):
        user_id = "test-user-session-service-default"
        created = await session_service.create_session_with_default_topic(
            SessionCreateFactory.build(name="S1"), user_id
        )

        by_default = await session_service.get_session_by_agent(user_id, "default")
        assert by_default.id == created.id

        sessions = await session_service.get_sessions_with_topics(user_id)
        assert len(sessions) == 1
        assert sessions[0].id == created.id
        assert len(sessions[0].topics) == 1
        assert sessions[0].topics[0].name == "新的聊天"

    async def test_clear_session_topics(self, db_session: AsyncSession, session_service: SessionService):
        user_id = "test-user-session-service-clear"
        created = await session_service.create_session_with_default_topic(
            SessionCreateFactory.build(name="S2"), user_id
        )

        topic_repo = TopicRepository(db_session)
        message_repo = MessageRepository(db_session)

        # Add 2 extra topics with messages
        extra_topic_1 = await topic_repo.create_topic(TopicCreateFactory.build(session_id=created.id, name="T1"))
        extra_topic_2 = await topic_repo.create_topic(TopicCreateFactory.build(session_id=created.id, name="T2"))

        await message_repo.create_message(MessageCreate(role="user", content="hi", topic_id=extra_topic_1.id))
        await message_repo.create_message(MessageCreate(role="user", content="hi", topic_id=extra_topic_2.id))
        await db_session.commit()

        await session_service.clear_session_topics(created.id, user_id)

        topics_after = await topic_repo.get_topics_by_session(created.id)
        assert len(topics_after) == 1
        assert topics_after[0].name == "新的聊天"

        # Messages for deleted topics should be gone (no-FK, so we query by old topic_id)
        assert await message_repo.get_messages_by_topic(extra_topic_1.id) == []
        assert await message_repo.get_messages_by_topic(extra_topic_2.id) == []

    async def test_update_session(self, session_service: SessionService):
        user_id = "test-user-session-service-update"
        created = await session_service.create_session_with_default_topic(
            SessionCreateFactory.build(name="S3"), user_id
        )

        updated = await session_service.update_session(
            created.id, SessionUpdate(name="S3-updated", google_search_enabled=True), user_id
        )
        assert updated.id == created.id
        assert updated.name == "S3-updated"
        assert updated.google_search_enabled is True
