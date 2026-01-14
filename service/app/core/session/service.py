from __future__ import annotations

from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode
from app.models.sessions import (
    SessionCreate,
    SessionRead,
    SessionReadWithTopics,
    SessionUpdate,
    builtin_agent_id_to_uuid,
)
from app.models.topic import TopicCreate, TopicRead
from app.repos import MessageRepository, SessionRepository, TopicRepository


class SessionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.session_repo = SessionRepository(db)
        self.topic_repo = TopicRepository(db)
        self.message_repo = MessageRepository(db)

    async def create_session_with_default_topic(self, session_data: SessionCreate, user_id: str) -> SessionRead:
        agent_uuid = await self._resolve_agent_uuid_for_create(session_data.agent_id)

        validated = SessionCreate(
            name=session_data.name,
            description=session_data.description,
            is_active=session_data.is_active,
            agent_id=agent_uuid,
            provider_id=session_data.provider_id,
            model=session_data.model,
            google_search_enabled=session_data.google_search_enabled,
        )

        session = await self.session_repo.create_session(validated, user_id)
        await self.topic_repo.create_topic(TopicCreate(name="新的聊天", session_id=session.id))

        await self.db.commit()
        return SessionRead(**session.model_dump())

    async def get_session_by_agent(self, user_id: str, agent_id: str) -> SessionRead:
        agent_uuid = await self._resolve_agent_uuid_for_lookup(agent_id)
        session = await self.session_repo.get_session_by_user_and_agent(user_id, agent_uuid)
        if not session:
            raise ErrCode.SESSION_NOT_FOUND.with_messages("No session found for this user-agent combination")
        return SessionRead(**session.model_dump())

    async def get_sessions_with_topics(self, user_id: str) -> list[SessionReadWithTopics]:
        sessions = await self.session_repo.get_sessions_by_user_ordered_by_activity(user_id)

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
