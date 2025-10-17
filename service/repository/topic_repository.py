"""
This module contains repository functions for database operations related to the Topic model.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.agent import Agent as AgentModel
from models.sessions import Session as SessionModel
from models.topic import Topic as TopicModel

logger = logging.getLogger(__name__)


class TopicRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_topic_with_details(self, topic_id: UUID) -> TopicModel | None:
        """
        Fetches a topic by its ID, eagerly loading all necessary related
        data for a chat session.

        This includes:
        - All messages within the topic.
        - The parent session.
        - The agent associated with the session.
        - The MCP servers configured for the agent.

        Args:
            db: The AsyncSession to use for the database query. The caller is
                responsible for managing the session's lifecycle (creation, commit, close).
            topic_id: The UUID of the topic to fetch.

        Returns:
            The TopicModel with all relationships loaded, or None if not found.
        """
        logger.debug(f"Fetching topic with details for topic_id: {topic_id}")
        statement = (
            select(TopicModel)
            .where(TopicModel.id == topic_id)
            .options(
                # Eagerly load the 'messages' collection for the topic
                selectinload(getattr(TopicModel, "messages")),
                # Eagerly load the parent 'session'
                selectinload(getattr(TopicModel, "session")).options(
                    # Within the session, eagerly load the 'agent'
                    selectinload(getattr(SessionModel, "agent")).options(
                        # Within the agent, eagerly load the 'mcp_servers'
                        selectinload(getattr(AgentModel, "mcp_servers"))
                    )
                ),
            )
        )
        result = await self.db.exec(statement)
        return result.one_or_none()

    async def update_topic_timestamp(self, topic: TopicModel) -> None:
        """
        Updates the updated_at timestamp for a given topic and adds it to the session.
        This function does NOT commit the transaction.

        Args:
            db: The AsyncSession to use for the database operation.
            topic: The TopicModel instance to update.
        """
        logger.debug(f"Updating timestamp for topic_id: {topic.id}")
        topic.updated_at = datetime.now(timezone.utc)
        self.db.add(topic)
        await self.db.flush()
