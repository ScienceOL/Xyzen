from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode
from app.core.fga.client import FgaClient
from app.models.agent import Agent, AgentScope
from app.repos.agent import AgentRepository

from .resource_policy import ResourcePolicyBase


class AgentPolicy(ResourcePolicyBase[Agent]):
    def __init__(self, db: AsyncSession, fga: FgaClient | None = None) -> None:
        self.agent_repo = AgentRepository(db)
        self.fga = fga

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

        # Check FGA if available
        if self.fga:
            if await self.fga.check(user_id, "viewer", "agent", str(resource_id)):
                return agent

        raise ErrCode.AGENT_ACCESS_DENIED.with_messages(f"User {user_id} can not access agent {resource_id}")

    async def authorize_write(self, resource_id: UUID, user_id: str) -> Agent:
        agent = await self.agent_repo.get_agent_by_id(resource_id)
        if not agent:
            raise ErrCode.AGENT_NOT_FOUND.with_messages(f"Agent with ID {resource_id} not found")

        # Owner can always write
        if agent.user_id == user_id:
            return agent

        # Check FGA editor permission
        if self.fga:
            if await self.fga.check(user_id, "editor", "agent", str(resource_id)):
                return agent

        raise ErrCode.AGENT_NOT_OWNED.with_messages(f"Agent with ID {resource_id} now owned by user")

    async def authorize_delete(self, resource_id: UUID, user_id: str) -> Agent:
        # Delete should still work for malformed/legacy rows so users can clean up.
        agent = await self.agent_repo.get_agent_by_id_raw(resource_id)
        if not agent:
            raise ErrCode.AGENT_NOT_FOUND.with_messages(f"Agent with ID {resource_id} not found")

        # Owner can always delete
        if agent.user_id == user_id:
            return agent

        # Check FGA owner permission for delete
        if self.fga:
            if await self.fga.check(user_id, "owner", "agent", str(resource_id)):
                return agent

        raise ErrCode.AGENT_NOT_OWNED.with_messages(f"Agent with ID {resource_id} now owned by user")
