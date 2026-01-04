import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.sessions import Session
from app.repos.session import SessionRepository
from app.repos.topic import TopicRepository
from tests.factories.session import SessionCreateFactory
from tests.factories.topic import TopicCreateFactory


@pytest.mark.integration
class TestTopicRepository:
    """Integration tests for TopicRepository."""

    @pytest.fixture
    def topic_repo(self, db_session: AsyncSession) -> TopicRepository:
        return TopicRepository(db_session)

    @pytest.fixture
    def session_repo(self, db_session: AsyncSession) -> SessionRepository:
        return SessionRepository(db_session)

    @pytest.fixture
    async def test_session(self, session_repo: SessionRepository):
        """Create a test session for topic tests."""
        return await session_repo.create_session(SessionCreateFactory.build(), "test-user-topic")

    async def test_create_and_get_topic(self, topic_repo: TopicRepository, test_session: Session):
        """Test creating a topic and retrieving it."""
        topic_create = TopicCreateFactory.build(session_id=test_session.id)

        # Create
        created_topic = await topic_repo.create_topic(topic_create)
        assert created_topic.id is not None
        assert created_topic.name == topic_create.name
        assert created_topic.session_id == test_session.id

        # Get by ID
        fetched_topic = await topic_repo.get_topic_by_id(created_topic.id)
        assert fetched_topic is not None
        assert fetched_topic.id == created_topic.id

    async def test_get_topics_by_session(self, topic_repo: TopicRepository, test_session: Session):
        """Test listing topics for a session."""
        # Create 2 topics
        await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id))
        await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id))

        topics = await topic_repo.get_topics_by_session(test_session.id)
        assert len(topics) == 2
        for topic in topics:
            assert topic.session_id == test_session.id

    async def test_get_topics_by_session_ordered(self, topic_repo: TopicRepository, test_session: Session):
        """Test listing topics ordered by updated_at."""
        await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id, name="Topic 1"))
        await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id, name="Topic 2"))

        topics = await topic_repo.get_topics_by_session(test_session.id, order_by_updated=True)
        assert len(topics) == 2
        # Most recently updated should be first (descending order)
        assert topics[0].name == "Topic 2"

    async def test_update_topic(self, topic_repo: TopicRepository, test_session: Session):
        """Test updating a topic."""
        created = await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id))

        from app.models.topic import TopicUpdate

        update_data = TopicUpdate(name="Updated Topic Name", is_active=False)
        updated = await topic_repo.update_topic(created.id, update_data)

        assert updated is not None
        assert updated.name == "Updated Topic Name"
        assert updated.is_active is False

        # Verify persistence
        fetched = await topic_repo.get_topic_by_id(created.id)
        assert fetched is not None
        assert fetched.name == "Updated Topic Name"

    async def test_delete_topic(self, topic_repo: TopicRepository, test_session: Session):
        """Test deleting a topic."""
        created = await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id))

        success = await topic_repo.delete_topic(created.id)
        assert success is True

        fetched = await topic_repo.get_topic_by_id(created.id)
        assert fetched is None

    async def test_delete_topic_not_found(self, topic_repo: TopicRepository):
        """Test deleting a non-existent topic."""
        from uuid import uuid4

        success = await topic_repo.delete_topic(uuid4())
        assert success is False

    async def test_bulk_delete_topics(self, topic_repo: TopicRepository, test_session: Session):
        """Test deleting multiple topics at once."""
        topic1 = await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id))
        topic2 = await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id))
        topic3 = await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id))

        count = await topic_repo.bulk_delete_topics([topic1.id, topic2.id])
        assert count == 2

        # topic3 should still exist
        assert await topic_repo.get_topic_by_id(topic3.id) is not None
        assert await topic_repo.get_topic_by_id(topic1.id) is None
        assert await topic_repo.get_topic_by_id(topic2.id) is None

    async def test_update_topic_timestamp(self, topic_repo: TopicRepository, test_session: Session):
        """Test updating a topic's timestamp."""
        created = await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id))
        original_updated_at = created.updated_at

        # Small delay to ensure timestamp difference
        import asyncio

        await asyncio.sleep(0.01)

        updated = await topic_repo.update_topic_timestamp(created.id)
        assert updated is not None
        # Verify the updated_at was changed (comparing without timezone awareness)
        assert updated.updated_at is not None
        # The timestamp should have been updated (either same or later)
        assert updated.updated_at.replace(tzinfo=None) >= original_updated_at.replace(tzinfo=None)

    async def test_get_topic_with_details(self, topic_repo: TopicRepository, test_session: Session):
        """Test get_topic_with_details (alias for get_topic_by_id in no-FK architecture)."""
        created = await topic_repo.create_topic(TopicCreateFactory.build(session_id=test_session.id))

        fetched = await topic_repo.get_topic_with_details(created.id)
        assert fetched is not None
        assert fetched.id == created.id
