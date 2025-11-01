"""
Agent Type Detection Service

Provides utilities to detect whether an agent is regular or graph-based,
and retrieve agents with their type information.
"""

import logging
from typing import Literal, Union
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from models.agent import Agent
from models.graph import GraphAgent
from repo import AgentRepository
from repo.graph import GraphRepository

logger = logging.getLogger(__name__)

AgentType = Literal["regular", "graph"]


class AgentTypeDetector:
    """Service for detecting agent types and retrieving agent instances."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.agent_repo = AgentRepository(db)
        self.graph_repo = GraphRepository(db)

    async def detect_agent_type(self, agent_id: UUID) -> AgentType | None:
        """
        Detect whether an agent is regular or graph-based.

        Args:
            agent_id: The agent ID to check

        Returns:
            "regular", "graph", or None if agent not found
        """
        try:
            # Check regular agents first (likely more common)
            logger.debug(f"Checking if agent {agent_id} is a regular agent")
            regular_agent = await self.agent_repo.get_agent_by_id(agent_id)
            if regular_agent:
                return "regular"

            # Check graph agents
            logger.debug(f"Checking if agent {agent_id} is a graph agent")
            graph_agent = await self.graph_repo.get_graph_agent_by_id(agent_id)
            if graph_agent:
                return "graph"

            return None
        except Exception as e:
            logger.error(f"Failed to detect agent type for {agent_id}: {e}")
            return None

    async def get_agent_with_type(
        self, agent_id: UUID, user_id: str
    ) -> tuple[Union[Agent, GraphAgent], AgentType] | None:
        """
        Get an agent instance along with its type, with user authorization.

        Args:
            agent_id: The agent ID to retrieve
            user_id: User ID for authorization

        Returns:
            Tuple of (agent_instance, agent_type) or None if not found/unauthorized
        """
        try:
            # Check regular agents first
            regular_agent = await self.agent_repo.get_agent_by_id(agent_id)
            if regular_agent and regular_agent.user_id == user_id:
                return regular_agent, "regular"

            # Check graph agents
            graph_agent = await self.graph_repo.get_graph_agent_by_id(agent_id)
            if graph_agent and graph_agent.user_id == user_id:
                return graph_agent, "graph"

            return None
        except Exception as e:
            logger.error(f"Failed to get agent with type for {agent_id}: {e}")
            return None

    async def is_graph_agent(self, agent_id: UUID) -> bool:
        """
        Quick check if an agent is a graph agent.

        Args:
            agent_id: The agent ID to check

        Returns:
            True if it's a graph agent, False otherwise
        """
        agent_type = await self.detect_agent_type(agent_id)
        return agent_type == "graph"

    async def is_regular_agent(self, agent_id: UUID) -> bool:
        """
        Quick check if an agent is a regular agent.

        Args:
            agent_id: The agent ID to check

        Returns:
            True if it's a regular agent, False otherwise
        """
        agent_type = await self.detect_agent_type(agent_id)
        return agent_type == "regular"
