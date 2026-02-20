"""Repository for root_agent table."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.root_agent import RootAgent

if TYPE_CHECKING:
    from app.models.agent import Agent

logger = logging.getLogger(__name__)


class RootAgentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_user_id(self, user_id: str) -> RootAgent | None:
        """Get the root agent record for a user."""
        statement = select(RootAgent).where(RootAgent.user_id == user_id)
        result = await self.db.exec(statement)
        return result.first()

    async def create(self, user_id: str, agent_id: UUID) -> RootAgent:
        """Create a root agent mapping for a user."""
        root_agent = RootAgent(user_id=user_id, agent_id=agent_id)
        self.db.add(root_agent)
        await self.db.flush()
        await self.db.refresh(root_agent)
        logger.info("Created root_agent for user=%s, agent_id=%s", user_id, agent_id)
        return root_agent

    async def get_agent_for_user(self, user_id: str) -> Agent | None:
        """Get the actual Agent record linked via root_agent for a user."""
        from app.models.agent import Agent

        root = await self.get_by_user_id(user_id)
        if not root:
            return None
        return await self.db.get(Agent, root.agent_id)

    async def is_root_agent(self, agent_id: UUID, user_id: str) -> bool:
        """Check if a given agent_id is the root agent for the user."""
        statement = select(RootAgent).where(RootAgent.agent_id == agent_id, RootAgent.user_id == user_id)
        result = await self.db.exec(statement)
        return result.first() is not None
