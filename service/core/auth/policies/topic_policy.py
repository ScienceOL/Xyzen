from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from common.code import ErrCode
from models.topic import Topic
from repo.session import SessionRepository
from repo.topic import TopicRepository

from .resource_policy import ResourcePolicyBase


class TopicPolicy(ResourcePolicyBase[Topic]):
    def __init__(self, db: AsyncSession) -> None:
        self.topic_repo = TopicRepository(db)
        self.session_repo = SessionRepository(db)

    async def authorize_read(self, resource_id: UUID, user_id: str) -> Topic:
        topic = await self.topic_repo.get_topic_by_id(resource_id)
        if not topic:
            raise ErrCode.TOPIC_NOT_FOUND.with_messages(f"Topic {resource_id} not found")

        session = await self.session_repo.get_session_by_id(topic.session_id)
        if not session:
            raise ErrCode.SESSION_NOT_FOUND.with_messages(f"Session not found for topic {topic.id}")

        if session.user_id == user_id:
            return topic

        raise ErrCode.TOPIC_ACCESS_DENIED.with_messages(f"User {user_id} does not have access to topic {topic.id}")

    async def authorize_write(self, resource_id: UUID, user_id: str) -> Topic:
        return await self.authorize_read(resource_id, user_id)

    async def authorize_delete(self, resource_id: UUID, user_id: str) -> Topic:
        return await self.authorize_read(resource_id, user_id)
