from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from common.code import ErrCode
from models.sessions import Session
from repo.session import SessionRepository

from .resource_policy import ResourcePolicyBase


class SessionPolicy(ResourcePolicyBase[Session]):
    def __init__(self, db: AsyncSession) -> None:
        self.session_repo = SessionRepository(db)

    async def authorize_read(self, resource_id: UUID, user_id: str) -> Session:
        session = await self.session_repo.get_session_by_id(resource_id)
        if not session:
            raise ErrCode.SESSION_NOT_FOUND.with_messages(f"Session {resource_id} not found")

        if session.user_id == user_id:
            return session

        raise ErrCode.SESSION_ACCESS_DENIED.with_messages(f"User {user_id} cannot access session {resource_id}")

    async def authorize_write(self, resource_id: UUID, user_id: str) -> Session:
        return await self.authorize_read(resource_id, user_id)  # Same logic

    async def authorize_delete(self, resource_id: UUID, user_id: str) -> Session:
        return await self.authorize_read(resource_id, user_id)  # Same logic
