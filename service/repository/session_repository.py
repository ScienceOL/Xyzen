"""
This module contains repository functions for database operations related to the Session model.
"""

import logging
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from models.sessions import Session as SessionModel

logger = logging.getLogger(__name__)


class SessionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_session_by_id(self, session_id: UUID) -> SessionModel | None:
        """
        Fetches a session by its ID.

        Args:
            db: The AsyncSession to use for the database query.
            session_id: The UUID of the session to fetch.

        Returns:
            The SessionModel, or None if not found.
        """
        logger.debug(f"Fetching session with id: {session_id}")
        session = await self.db.get(SessionModel, session_id)
        return session
