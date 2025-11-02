import logging
from uuid import UUID

from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.sessions import Session as SessionModel
from models.sessions import SessionCreate, SessionUpdate
from models.topic import Topic

logger = logging.getLogger(__name__)


class SessionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_session_by_id(self, session_id: UUID) -> SessionModel | None:
        """
        Fetches a session by its ID.

        Args:
            session_id: The UUID of the session to fetch.

        Returns:
            The SessionModel, or None if not found.
        """
        logger.debug(f"Fetching session with id: {session_id}")
        session = await self.db.get(SessionModel, session_id)
        return session

    async def get_sessions_by_user(self, user_id: str) -> list[SessionModel]:
        """
        Fetches all sessions for a given user.

        Args:
            user_id: The user ID.

        Returns:
            List of SessionModel instances.
        """
        logger.debug(f"Fetching sessions for user_id: {user_id}")
        statement = select(SessionModel).where(SessionModel.user_id == user_id)
        result = await self.db.exec(statement)
        return list(result.all())

    async def get_session_by_user_and_agent(self, user_id: str, agent_id: UUID | None) -> SessionModel | None:
        """
        Fetches a session for a specific user and agent combination.

        Args:
            user_id: The user ID.
            agent_id: The agent UUID, or None for default agent.

        Returns:
            The SessionModel, or None if not found.
        """
        logger.debug(f"Fetching session for user_id: {user_id}, agent_id: {agent_id}")
        statement = select(SessionModel).where(SessionModel.user_id == user_id, SessionModel.agent_id == agent_id)
        result = await self.db.exec(statement)
        return result.first()

    async def create_session(self, session_data: SessionCreate, user_id: str) -> SessionModel:
        """
        Creates a new session.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the session object is populated with DB-defaults before being returned.

        Args:
            session_data: The Pydantic model containing the data for the new session.
            user_id: The user ID (from authentication).

        Returns:
            The newly created SessionModel instance.
        """
        logger.debug(f"Creating new session for user_id: {user_id}")
        session = SessionModel(
            name=session_data.name,
            description=session_data.description,
            is_active=session_data.is_active,
            user_id=user_id,
            agent_id=session_data.agent_id,
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def update_session(self, session_id: UUID, session_data: SessionUpdate) -> SessionModel | None:
        """
        Updates an existing session.
        This function does NOT commit the transaction.

        Args:
            session_id: The UUID of the session to update.
            session_data: The Pydantic model containing the update data.

        Returns:
            The updated SessionModel instance, or None if not found.
        """
        logger.debug(f"Updating session with id: {session_id}")
        session = await self.db.get(SessionModel, session_id)
        if not session:
            return None

        # Only update fields that are not None to avoid null constraint violations
        update_data = session_data.model_dump(exclude_unset=True, exclude_none=True)
        for field, value in update_data.items():
            if hasattr(session, field):
                setattr(session, field, value)

        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def delete_session(self, session_id: UUID) -> bool:
        """
        Deletes a session by its ID.
        This function does NOT commit the transaction.
        Note: Caller should handle cascade deletion of related topics and messages.

        Args:
            session_id: The UUID of the session to delete.

        Returns:
            True if the session was deleted, False if not found.
        """
        logger.debug(f"Deleting session with id: {session_id}")
        session = await self.db.get(SessionModel, session_id)
        if not session:
            return False
        await self.db.delete(session)
        await self.db.flush()
        return True

    async def get_sessions_by_user_ordered_by_activity(self, user_id: str) -> list[SessionModel]:
        """
        Fetches all sessions for a given user, ordered by most recent topic activity.

        Uses a single optimized query with LEFT JOIN and subquery to avoid N+1 problem.
        Sessions are sorted by the most recent topic's updated_at timestamp in descending order.
        Sessions without topics are sorted to the end (NULL values last).

        Args:
            user_id: The user ID.

        Returns:
            List of SessionModel instances ordered by recent topic activity.
        """
        logger.debug(f"Fetching sessions for user_id: {user_id} ordered by topic activity")
        max_topic_activity = (
            select(Topic.session_id, func.max(Topic.updated_at).label("latest_activity"))
            # Type UUID is not compatible with accepted types
            .group_by(Topic.session_id)  # pyright: ignore[reportArgumentType]
            .subquery()
        )
        statement = (
            select(SessionModel)
            .where(SessionModel.user_id == user_id)
            .outerjoin(
                max_topic_activity,
                # Type bool is not compatible with accepted types
                SessionModel.id == max_topic_activity.c.session_id,  # pyright: ignore[reportArgumentType]
            )
            .order_by(max_topic_activity.c.latest_activity.desc().nulls_last())
        )
        result = await self.db.exec(statement)
        return list(result.all())
