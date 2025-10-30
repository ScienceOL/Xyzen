import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.topic import Topic, TopicCreate, TopicUpdate

logger = logging.getLogger(__name__)


class TopicRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_topic_by_id(self, topic_id: UUID) -> Topic | None:
        """
        Fetches a topic by its ID.

        Args:
            topic_id: The UUID of the topic to fetch.

        Returns:
            The Topic, or None if not found.
        """
        logger.debug(f"Fetching topic with id: {topic_id}")
        return await self.db.get(Topic, topic_id)

    async def get_topic_with_details(self, topic_id: UUID) -> Topic | None:
        """
        Fetches a topic by its ID with details.
        In the no-foreign-key architecture, this is equivalent to get_topic_by_id.

        Args:
            topic_id: The UUID of the topic to fetch.

        Returns:
            The Topic, or None if not found.
        """
        logger.debug(f"Fetching topic with details for id: {topic_id}")
        return await self.get_topic_by_id(topic_id)

    async def get_topics_by_session(self, session_id: UUID, order_by_updated: bool = False) -> list[Topic]:
        """
        Fetches all topics for a given session.

        Args:
            session_id: The UUID of the session.
            order_by_updated: If True, orders by updated_at descending.

        Returns:
            list of Topic instances.
        """
        logger.debug(f"Fetching topics for session_id: {session_id}")
        statement = select(Topic).where(Topic.session_id == session_id)
        if order_by_updated:
            statement = statement.order_by(Topic.updated_at.desc())  # type: ignore
        result = await self.db.exec(statement)
        return list(result.all())

    async def create_topic(self, topic_data: TopicCreate) -> Topic:
        """
        Creates a new topic.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the topic object is populated with DB-defaults before being returned.

        Args:
            topic_data: The Pydantic model containing the data for the new topic.

        Returns:
            The newly created Topic instance.
        """
        logger.debug(f"Creating new topic for session_id: {topic_data.session_id}")

        # Convert Pydantic model to dict and create Topic instance
        topic_dict = topic_data.model_dump()
        topic = Topic(**topic_dict)

        self.db.add(topic)
        await self.db.flush()
        await self.db.refresh(topic)
        logger.info(f"Created topic: {topic.id} for session {topic.session_id}")
        return topic

    async def update_topic(self, topic_id: UUID, topic_data: TopicUpdate) -> Topic | None:
        """
        Updates an existing topic.
        This function does NOT commit the transaction.

        Args:
            topic_id: The UUID of the topic to update.
            topic_data: The Pydantic model containing the update data.

        Returns:
            The updated Topic instance, or None if not found.
        """
        logger.debug(f"Updating topic with id: {topic_id}")
        topic = await self.db.get(Topic, topic_id)
        if not topic:
            return None

        # Only update fields that are not None to avoid null constraint violations
        update_data = topic_data.model_dump(exclude_unset=True, exclude_none=True)
        for field, value in update_data.items():
            if hasattr(topic, field):
                setattr(topic, field, value)

        topic.updated_at = datetime.now(timezone.utc)
        self.db.add(topic)
        await self.db.flush()
        await self.db.refresh(topic)
        return topic

    async def delete_topic(self, topic_id: UUID) -> bool:
        """
        Deletes a topic by its ID.
        This function does NOT commit the transaction.

        Args:
            topic_id: The UUID of the topic to delete.

        Returns:
            True if the topic was deleted, False if not found.
        """
        logger.debug(f"Deleting topic with id: {topic_id}")
        topic = await self.db.get(Topic, topic_id)
        if not topic:
            return False
        await self.db.delete(topic)
        await self.db.flush()
        return True

    async def bulk_delete_topics(self, topic_ids: list[UUID]) -> int:
        """
        Deletes multiple topics by their IDs.
        This function does NOT commit the transaction.

        Args:
            topic_ids: list of topic UUIDs to delete.

        Returns:
            Number of topics deleted.
        """
        logger.debug(f"Bulk deleting {len(topic_ids)} topics")
        count = 0
        for topic_id in topic_ids:
            if await self.delete_topic(topic_id):
                count += 1
        return count

    async def update_topic_timestamp(self, topic_id: UUID) -> Topic | None:
        """
        Updates the updated_at timestamp for a given topic.
        This function does NOT commit the transaction.

        Args:
            topic_id: The UUID of the topic to update.

        Returns:
            The updated Topic instance, or None if not found.
        """
        logger.debug(f"Updating timestamp for topic_id: {topic_id}")
        topic = await self.db.get(Topic, topic_id)
        if not topic:
            return None
        topic.updated_at = datetime.now(timezone.utc)
        self.db.add(topic)
        await self.db.flush()
        return topic
