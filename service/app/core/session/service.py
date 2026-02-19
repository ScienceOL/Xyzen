from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode
from app.models.sessions import (
    Session as SessionModel,
    SessionCreate,
    SessionRead,
    SessionReadWithTopics,
    SessionUpdate,
    builtin_agent_id_to_uuid,
)
from app.models.topic import TopicCreate, TopicRead
from app.repos import MessageRepository, SessionRepository, TopicRepository
from app.schemas.model_tier import ModelTier

logger = logging.getLogger(__name__)

TIER_ORDER = [ModelTier.LITE, ModelTier.STANDARD, ModelTier.PRO, ModelTier.ULTRA]


class SessionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.session_repo = SessionRepository(db)
        self.topic_repo = TopicRepository(db)
        self.message_repo = MessageRepository(db)

    async def _clamp_session_model_tier(self, session: SessionModel, user_id: str) -> bool:
        """Clamp session.model_tier to subscription limit. Persists to DB if changed.

        If model_tier is NULL, sets it to the user's max allowed tier.
        Returns True if the tier was changed.
        """
        try:
            from app.core.subscription import SubscriptionService

            role = await SubscriptionService(self.db).get_user_role(user_id)
            max_tier_str = role.max_model_tier if role else "lite"
            max_tier_enum = ModelTier(max_tier_str)

            if not session.model_tier:
                # NULL tier: initialize to the user's max allowed tier
                logger.info(f"Session {session.id}: setting NULL model_tier to {max_tier_enum.value}")
                session.model_tier = max_tier_enum
                session.model = None
                self.db.add(session)
                await self.db.flush()
                return True

            if TIER_ORDER.index(session.model_tier) > TIER_ORDER.index(max_tier_enum):
                logger.info(
                    f"Session {session.id}: clamping model_tier from {session.model_tier.value} "
                    f"to {max_tier_enum.value} (subscription limit)"
                )
                session.model_tier = max_tier_enum
                # Clear cached model so next message triggers re-selection
                session.model = None
                self.db.add(session)
                await self.db.flush()
                return True
        except Exception as e:
            logger.warning(f"Failed to clamp session model tier: {e}")

        return False

    async def create_session_with_default_topic(self, session_data: SessionCreate, user_id: str) -> SessionRead:
        agent_uuid = await self._resolve_agent_uuid_for_create(session_data.agent_id)

        validated = SessionCreate(
            name=session_data.name,
            description=session_data.description,
            is_active=session_data.is_active,
            agent_id=agent_uuid,
            provider_id=session_data.provider_id,
            model=session_data.model,
            spatial_layout=session_data.spatial_layout,
        )

        try:
            session = await self.session_repo.create_session(validated, user_id)
            await self.topic_repo.create_topic(TopicCreate(name="新的聊天", session_id=session.id))
            await self.db.commit()
        except IntegrityError:
            # Unique constraint violation: a session for this (user_id, agent_id) already exists.
            # This can happen due to a race condition. Return the existing session instead.
            await self.db.rollback()
            existing = await self.session_repo.get_session_by_user_and_agent(user_id, agent_uuid)
            if existing:
                logger.info(f"Session already exists for user={user_id} agent={agent_uuid}, returning existing")
                # Ensure the existing session has at least one topic (it may not if a previous
                # creation was partially committed or topics were cleared).
                topics = await self.topic_repo.get_topics_by_session(existing.id)
                if not topics:
                    await self.topic_repo.create_topic(TopicCreate(name="新的聊天", session_id=existing.id))
                    await self.db.commit()
                return SessionRead(**existing.model_dump())
            raise

        # Write FGA owner tuple (best-effort)
        try:
            from app.core.fga.client import get_fga_client

            fga = await get_fga_client()
            await fga.write_tuple(user_id, "owner", "session", str(session.id))
        except Exception:
            pass

        return SessionRead(**session.model_dump())

    async def get_session_by_agent(self, user_id: str, agent_id: str) -> SessionRead:
        agent_uuid = await self._resolve_agent_uuid_for_lookup(agent_id)
        session = await self.session_repo.get_session_by_user_and_agent(user_id, agent_uuid)
        if not session:
            raise ErrCode.SESSION_NOT_FOUND.with_messages("No session found for this user-agent combination")
        return SessionRead(**session.model_dump())

    async def get_session_by_agent_with_topics(self, user_id: str, agent_id: str) -> SessionReadWithTopics:
        agent_uuid = await self._resolve_agent_uuid_for_lookup(agent_id)
        session = await self.session_repo.get_session_by_user_and_agent(user_id, agent_uuid)
        if not session:
            raise ErrCode.SESSION_NOT_FOUND.with_messages("No session found for this user-agent combination")

        # Clamp tier if it exceeds subscription limit
        if await self._clamp_session_model_tier(session, user_id):
            await self.db.commit()

        # Fetch topics ordered by updated_at descending (most recent first)
        topics = await self.topic_repo.get_topics_by_session(session.id, order_by_updated=True)
        topic_reads = [TopicRead(**topic.model_dump()) for topic in topics]

        session_dict = session.model_dump()
        session_dict["topics"] = topic_reads
        return SessionReadWithTopics(**session_dict)

    async def get_sessions_with_topics(self, user_id: str) -> list[SessionReadWithTopics]:
        sessions = await self.session_repo.get_sessions_by_user_ordered_by_activity(user_id)

        # Clamp all sessions in one pass, commit once if any changed
        any_clamped = False
        for session in sessions:
            if await self._clamp_session_model_tier(session, user_id):
                any_clamped = True
        if any_clamped:
            await self.db.commit()

        sessions_with_topics: list[SessionReadWithTopics] = []
        for session in sessions:
            topics = await self.topic_repo.get_topics_by_session(session.id, order_by_updated=True)
            topic_reads = [TopicRead(**topic.model_dump()) for topic in topics]

            session_dict = session.model_dump()
            session_dict["topics"] = topic_reads
            sessions_with_topics.append(SessionReadWithTopics(**session_dict))

        return sessions_with_topics

    async def clear_session_topics(self, session_id: UUID, user_id: str) -> None:
        session = await self.session_repo.get_session_by_id(session_id)
        if not session:
            raise ErrCode.SESSION_NOT_FOUND.with_messages("Session not found")
        if session.user_id != user_id:
            raise ErrCode.SESSION_ACCESS_DENIED.with_messages(
                "Access denied: You don't have permission to clear this session"
            )

        # Use a savepoint so partial failures roll back the entire clear operation
        # instead of leaving the session in an inconsistent state.
        async with self.db.begin_nested():
            topics = await self.topic_repo.get_topics_by_session(session_id)
            for topic in topics:
                await self.message_repo.delete_messages_by_topic(topic.id)
                await self.topic_repo.delete_topic(topic.id)

            await self.topic_repo.create_topic(TopicCreate(name="新的聊天", session_id=session_id))

        await self.db.commit()

    async def update_session(self, session_id: UUID, session_data: SessionUpdate, user_id: str) -> SessionRead:
        session = await self.session_repo.get_session_by_id(session_id)
        if not session:
            raise ErrCode.SESSION_NOT_FOUND.with_messages("Session not found")
        if session.user_id != user_id:
            raise ErrCode.SESSION_ACCESS_DENIED.with_messages("Access denied")

        updated_session = await self.session_repo.update_session(session_id, session_data)
        if not updated_session:
            raise ErrCode.SESSION_CREATION_FAILED.with_messages("Failed to update session")

        await self.db.commit()
        return SessionRead(**updated_session.model_dump())

    async def _resolve_agent_uuid_for_lookup(self, agent_id: str) -> UUID | None:
        if agent_id == "default":
            return None

        if agent_id.startswith("builtin_"):
            return builtin_agent_id_to_uuid(agent_id)

        try:
            agent_uuid = UUID(agent_id)
        except ValueError:
            raise ErrCode.INVALID_UUID_FORMAT.with_messages(f"Invalid agent ID format: '{agent_id}'")

        # Verify agent exists (user/system)
        from app.repos.agent import AgentRepository

        agent_repo = AgentRepository(self.db)
        agent = await agent_repo.get_agent_by_id(agent_uuid)
        if agent is None:
            raise ErrCode.AGENT_NOT_FOUND.with_messages(f"Agent '{agent_id}' not found")

        return agent_uuid

    async def _resolve_agent_uuid_for_create(self, agent_id: str | UUID | None) -> UUID | None:
        if agent_id is None:
            return None

        if isinstance(agent_id, UUID):
            return agent_id

        if agent_id == "default":
            return None

        if agent_id.startswith("builtin_"):
            return builtin_agent_id_to_uuid(agent_id)

        try:
            agent_uuid = UUID(agent_id)
        except ValueError:
            raise ErrCode.INVALID_UUID_FORMAT.with_messages(f"Invalid agent ID format: {agent_id}")

        from app.repos.agent import AgentRepository

        agent_repo = AgentRepository(self.db)
        agent = await agent_repo.get_agent_by_id(agent_uuid)
        if agent is None:
            # Keep create-session semantics: treat unknown agent as bad payload
            raise ErrCode.INVALID_FIELD_VALUE.with_messages(f"Agent not found: {agent_id}")

        return agent_uuid
