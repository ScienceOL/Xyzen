import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.topic import Topic
from app.repos.message import MessageRepository
from app.repos.session import SessionRepository
from app.repos.topic import TopicRepository
from tests.factories.message import MessageCreateFactory
from tests.factories.session import SessionCreateFactory
from tests.factories.topic import TopicCreateFactory


@pytest.mark.integration
class TestMessageRepository:
    """Integration tests for MessageRepository."""

    @pytest.fixture
    def message_repo(self, db_session: AsyncSession) -> MessageRepository:
        return MessageRepository(db_session)

    @pytest.fixture
    def session_repo(self, db_session: AsyncSession) -> SessionRepository:
        return SessionRepository(db_session)

    @pytest.fixture
    def topic_repo(self, db_session: AsyncSession) -> TopicRepository:
        return TopicRepository(db_session)

    @pytest.fixture
    async def test_topic(self, session_repo: SessionRepository, topic_repo: TopicRepository):
        """Create a test session and topic for message tests."""
        session = await session_repo.create_session(SessionCreateFactory.build(), "test-user-message")
        topic = await topic_repo.create_topic(TopicCreateFactory.build(session_id=session.id))
        return topic

    async def test_create_and_get_message(self, message_repo: MessageRepository, test_topic: Topic):
        """Test creating a message and retrieving it."""
        message_create = MessageCreateFactory.build(topic_id=test_topic.id, role="user", content="Hello!")

        # Create
        created_message = await message_repo.create_message(message_create)
        assert created_message.id is not None
        assert created_message.content == "Hello!"
        assert created_message.role == "user"
        assert created_message.topic_id == test_topic.id

        # Get by ID
        fetched_message = await message_repo.get_message_by_id(created_message.id)
        assert fetched_message is not None
        assert fetched_message.id == created_message.id

    async def test_get_messages_by_topic(self, message_repo: MessageRepository, test_topic: Topic):
        """Test listing messages for a topic."""
        # Create 3 messages
        await message_repo.create_message(
            MessageCreateFactory.build(topic_id=test_topic.id, role="user", content="First")
        )
        await message_repo.create_message(
            MessageCreateFactory.build(topic_id=test_topic.id, role="assistant", content="Second")
        )
        await message_repo.create_message(
            MessageCreateFactory.build(topic_id=test_topic.id, role="user", content="Third")
        )

        messages = await message_repo.get_messages_by_topic(test_topic.id)
        assert len(messages) == 3
        for msg in messages:
            assert msg.topic_id == test_topic.id

    async def test_get_messages_by_topic_ordered(self, message_repo: MessageRepository, test_topic: Topic):
        """Test messages are ordered by created_at ascending."""
        msg1 = await message_repo.create_message(MessageCreateFactory.build(topic_id=test_topic.id, content="First"))
        msg2 = await message_repo.create_message(MessageCreateFactory.build(topic_id=test_topic.id, content="Second"))

        messages = await message_repo.get_messages_by_topic(test_topic.id, order_by_created=True)
        assert len(messages) == 2
        assert messages[0].id == msg1.id
        assert messages[1].id == msg2.id

    async def test_get_messages_by_topic_with_limit(self, message_repo: MessageRepository, test_topic: Topic):
        """Test limiting number of messages returned."""
        for i in range(5):
            await message_repo.create_message(
                MessageCreateFactory.build(topic_id=test_topic.id, content=f"Message {i}")
            )

        messages = await message_repo.get_messages_by_topic(test_topic.id, limit=3)
        assert len(messages) == 3

    async def test_delete_message(self, message_repo: MessageRepository, test_topic: Topic):
        """Test deleting a single message."""
        created = await message_repo.create_message(MessageCreateFactory.build(topic_id=test_topic.id))

        # Delete without cascade (no files to delete)
        success = await message_repo.delete_message(created.id, cascade_files=False)
        assert success is True

        fetched = await message_repo.get_message_by_id(created.id)
        assert fetched is None

    async def test_delete_messages_by_topic(self, message_repo: MessageRepository, test_topic: Topic):
        """Test deleting all messages for a topic."""
        # Create 3 messages
        for _ in range(3):
            await message_repo.create_message(MessageCreateFactory.build(topic_id=test_topic.id))

        count = await message_repo.delete_messages_by_topic(test_topic.id, cascade_files=False)
        assert count == 3

        messages = await message_repo.get_messages_by_topic(test_topic.id)
        assert len(messages) == 0

    async def test_bulk_delete_messages(self, message_repo: MessageRepository, test_topic: Topic):
        """Test deleting multiple messages by ID."""
        msg1 = await message_repo.create_message(MessageCreateFactory.build(topic_id=test_topic.id))
        msg2 = await message_repo.create_message(MessageCreateFactory.build(topic_id=test_topic.id))
        msg3 = await message_repo.create_message(MessageCreateFactory.build(topic_id=test_topic.id))

        count = await message_repo.bulk_delete_messages([msg1.id, msg2.id], cascade_files=False)
        assert count == 2

        # msg3 should still exist
        assert await message_repo.get_message_by_id(msg3.id) is not None
        assert await message_repo.get_message_by_id(msg1.id) is None

    @pytest.mark.parametrize("role", ["user", "assistant", "system", "tool"])
    async def test_create_message_with_different_roles(
        self, message_repo: MessageRepository, test_topic: Topic, role: str
    ):
        """Test creating messages with different roles."""
        created = await message_repo.create_message(
            MessageCreateFactory.build(topic_id=test_topic.id, role=role, content="Test")
        )
        assert created.role == role

    async def test_create_message_with_thinking_content(self, message_repo: MessageRepository, test_topic: Topic):
        """Test creating a message with thinking content (AI reasoning)."""
        created = await message_repo.create_message(
            MessageCreateFactory.build(
                topic_id=test_topic.id,
                role="assistant",
                content="Final answer",
                thinking_content="Let me think about this...",
            )
        )
        assert created.thinking_content == "Let me think about this..."
