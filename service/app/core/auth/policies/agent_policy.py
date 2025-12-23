from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode
from app.models.agent import Agent, AgentScope
from app.repos.agent import AgentRepository
from app.repos.agent_marketplace import AgentMarketplaceRepository

from .resource_policy import ResourcePolicyBase


class AgentPolicy(ResourcePolicyBase[Agent]):
    def __init__(self, db: AsyncSession) -> None:
        self.agent_repo = AgentRepository(db)
        self.marketplace_repo = AgentMarketplaceRepository(db)

    async def authorize_read(self, resource_id: UUID, user_id: str) -> Agent:
        agent = await self.agent_repo.get_agent_by_id(resource_id)
        if not agent:
            raise ErrCode.AGENT_NOT_FOUND.with_messages(f"Agent {resource_id} not found")

        # Owner can always read
        if agent.user_id == user_id:
            return agent

        # System agents are readable by everyone
        if agent.scope == AgentScope.SYSTEM:
            return agent

        # Check if published in marketplace
        listing = await self.marketplace_repo.get_by_agent_id(agent.id)
        if listing and listing.is_published:
            return agent

        raise ErrCode.AGENT_ACCESS_DENIED.with_messages(f"User {user_id} can not access agent {resource_id}")

    async def authorize_write(self, resource_id: UUID, user_id: str) -> Agent:
        agent = await self.agent_repo.get_agent_by_id(resource_id)
        if not agent:
            raise ErrCode.AGENT_NOT_FOUND.with_messages(f"Agent with ID {resource_id} not found")
        if agent.user_id == user_id:
            return agent

        raise ErrCode.AGENT_NOT_OWNED.with_messages(f"Agent with ID {resource_id} now owned by user")

    async def authorize_delete(self, resource_id: UUID, user_id: str) -> Agent:
        agent = await self.agent_repo.get_agent_by_id(resource_id)
        if not agent:
            raise ErrCode.AGENT_NOT_FOUND.with_messages(f"Agent with ID {resource_id} not found")
        if agent.user_id == user_id:
            return agent

        raise ErrCode.AGENT_NOT_OWNED.with_messages(f"Agent with ID {resource_id} now owned by user")
