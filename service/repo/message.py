import logging
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from middleware.database.connection import AsyncSessionLocal
from models.message import Message as MessageModel
from models.message import MessageCreate

logger = logging.getLogger(__name__)


class MessageRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_message_by_id(self, message_id: UUID) -> MessageModel | None:
        """
        Fetches a message by its ID.

        Args:
            message_id: The UUID of the message to fetch.

        Returns:
            The MessageModel, or None if not found.
        """
        logger.debug(f"Fetching message with id: {message_id}")
        return await self.db.get(MessageModel, message_id)

    async def get_messages_by_topic(self, topic_id: UUID, order_by_created: bool = True) -> list[MessageModel]:
        """
        Fetches all messages for a given topic.

        Args:
            topic_id: The UUID of the topic.
            order_by_created: If True, orders by created_at ascending.

        Returns:
            List of MessageModel instances.
        """
        logger.debug(f"Fetching messages for topic_id: {topic_id}")
        statement = select(MessageModel).where(MessageModel.topic_id == topic_id)
        if order_by_created:
            statement = statement.order_by(MessageModel.created_at)  # type: ignore
        result = await self.db.exec(statement)
        return list(result.all())

    async def create_message(self, message_data: MessageCreate) -> MessageModel:
        """
        Creates a new message within the given session.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the message object is populated with DB-defaults before being returned.

        Args:
            message_data: The Pydantic model containing the data for the new message.

        Returns:
            The newly created MessageModel instance.
        """
        logger.debug(f"Creating new message for topic_id: {message_data.topic_id}")
        message = MessageModel.model_validate(message_data)
        self.db.add(message)
        await self.db.flush()
        await self.db.refresh(message)
        return message

    async def delete_message(self, message_id: UUID) -> bool:
        """
        Deletes a message by its ID.
        This function does NOT commit the transaction.

        Args:
            message_id: The UUID of the message to delete.

        Returns:
            True if the message was deleted, False if not found.
        """
        logger.debug(f"Deleting message with id: {message_id}")
        message = await self.db.get(MessageModel, message_id)
        if not message:
            return False

        await self.db.delete(message)
        await self.db.flush()
        return True

    async def delete_messages_by_topic(self, topic_id: UUID) -> int:
        """
        Deletes all messages for a given topic.
        This function does NOT commit the transaction.

        Args:
            topic_id: The UUID of the topic.

        Returns:
            Number of messages deleted.
        """
        logger.debug(f"Deleting all messages for topic_id: {topic_id}")
        statement = select(MessageModel).where(MessageModel.topic_id == topic_id)
        result = await self.db.exec(statement)
        messages = list(result.all())

        count = 0
        for message in messages:
            await self.db.delete(message)
            count += 1

        if count > 0:
            await self.db.flush()

        return count

    async def bulk_delete_messages(self, message_ids: list[UUID]) -> int:
        """
        Deletes multiple messages by their IDs.
        This function does NOT commit the transaction.

        Args:
            message_ids: List of message UUIDs to delete.

        Returns:
            Number of messages deleted.
        """
        logger.debug(f"Bulk deleting {len(message_ids)} messages")
        count = 0
        for message_id in message_ids:
            if await self.delete_message(message_id):
                count += 1
        return count

    async def create_message_in_isolated_transaction(self, message_data: MessageCreate) -> None:
        """
        Creates and commits a tool event message in a separate, short-lived session.

        This is used to persist tool call/response events immediately without
        interfering with the main chat session's transaction state.

        Args:
            message_data: The Pydantic model containing the data for the new message.
        """
        logger.debug(f"Creating isolated tool event message for topic_id: {message_data.topic_id}")
        async with AsyncSessionLocal() as db:
            isolated_repo = MessageRepository(db)
            await isolated_repo.create_message(message_data=message_data)
            await db.commit()
