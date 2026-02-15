from uuid import UUID

from fastapi import Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.fga.client import FgaClient
from app.infra.database import get_session
from app.models.agent import Agent
from app.models.provider import Provider
from app.models.sessions import Session
from app.models.topic import Topic

from .policies.agent_policy import AgentPolicy
from .policies.provider_policy import ProviderPolicy
from .policies.session_policy import SessionPolicy
from .policies.topic_policy import TopicPolicy


class AuthorizationService:
    def __init__(self, db: AsyncSession, fga: FgaClient | None = None):
        self.db = db
        self.fga = fga
        self.agent_policy = AgentPolicy(self.db, fga=fga)
        self.provider_policy = ProviderPolicy(self.db)
        self.session_policy = SessionPolicy(self.db)
        self.topic_policy = TopicPolicy(self.db)

    async def authorize_agent_read(self, agent_id: UUID, user_id: str) -> Agent:
        return await self.agent_policy.authorize_read(agent_id, user_id)

    async def authorize_agent_write(self, agent_id: UUID, user_id: str) -> Agent:
        return await self.agent_policy.authorize_write(agent_id, user_id)

    async def authorize_agent_delete(self, agent_id: UUID, user_id: str) -> Agent:
        return await self.agent_policy.authorize_delete(agent_id, user_id)

    async def authorize_provider_read(self, provider_id: UUID, user_id: str) -> Provider:
        return await self.provider_policy.authorize_read(provider_id, user_id)

    async def authorize_provider_write(self, provider_id: UUID, user_id: str) -> Provider:
        return await self.provider_policy.authorize_write(provider_id, user_id)

    async def authorize_provider_delete(self, provider_id: UUID, user_id: str) -> Provider:
        return await self.provider_policy.authorize_delete(provider_id, user_id)

    async def authorize_session_read(self, session_id: UUID, user_id: str) -> Session:
        return await self.session_policy.authorize_read(session_id, user_id)

    async def authorize_session_write(self, session_id: UUID, user_id: str) -> Session:
        return await self.session_policy.authorize_write(session_id, user_id)

    async def authorize_session_delete(self, session_id: UUID, user_id: str) -> Session:
        return await self.session_policy.authorize_delete(session_id, user_id)

    async def authorize_topic_read(self, topic_id: UUID, user_id: str) -> Topic:
        return await self.topic_policy.authorize_read(topic_id, user_id)

    async def authorize_topic_write(self, topic_id: UUID, user_id: str) -> Topic:
        return await self.topic_policy.authorize_write(topic_id, user_id)

    async def authorize_topic_delete(self, topic_id: UUID, user_id: str) -> Topic:
        return await self.topic_policy.authorize_delete(topic_id, user_id)


async def get_auth_service(db: AsyncSession = Depends(get_session)) -> AuthorizationService:
    """FastAPI dependency for authorization service.

    Attempts to inject the FGA client; falls back to code-based checks
    if OpenFGA is not reachable yet.
    """
    fga: FgaClient | None = None
    try:
        from app.core.fga.client import get_fga_client

        fga = await get_fga_client()
    except Exception:
        pass
    return AuthorizationService(db, fga=fga)
