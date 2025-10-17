"""
This module contains repository functions for database operations related to the Message model.
"""

import logging

from sqlmodel.ext.asyncio.session import AsyncSession

from middleware.database.connection import AsyncSessionLocal
from models.message import Message as MessageModel
from models.message import MessageCreate

logger = logging.getLogger(__name__)


class MessageRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_message(self, message_data: MessageCreate) -> MessageModel:
        """
        Creates a new message within the given session.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the message object is populated with DB-defaults before being returned.

        Args:
            db: The AsyncSession to use for the database operation.
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

    async def create_message_in_isolated_transaction(self, message_data: MessageCreate) -> None:
        """
        Creates and commits a tool event message in a separate, short-lived session.

        This is used to persist tool call/response events immediately without
        interfering with the main chat session's transaction state.

        Args:
            topic_id: The UUID of the topic this tool event belongs to.
            payload: The dictionary content of the tool event.
        """
        logger.debug(f"Creating isolated tool event message for topic_id: {message_data.topic_id}")
        async with AsyncSessionLocal() as db:
            isolated_repo = MessageRepository(db)
            await isolated_repo.create_message(message_data=message_data)
            await db.commit()
