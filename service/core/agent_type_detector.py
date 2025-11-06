"""
Agent Type Detection Service

Provides utilities to detect whether an agent is regular or graph-based,
and retrieve agents with their type information.
"""

import logging
from typing import Literal, Union
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from handler.builtin_agents import registry as builtin_registry
from handler.builtin_agents.base_graph_agent import BaseBuiltinGraphAgent
from models.agent import Agent
from models.graph import GraphAgent
from repo import AgentRepository
from repo.graph import GraphRepository

logger = logging.getLogger(__name__)

AgentType = Literal["regular", "graph", "official"]


class AgentTypeDetector:
    """Service for detecting agent types and retrieving agent instances."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.agent_repo = AgentRepository(db)
        self.graph_repo = GraphRepository(db)

    async def detect_agent_type(self, agent_id: str | UUID) -> AgentType | None:
        """
        Detect whether an agent is regular, graph-based, or official.

        Args:
            agent_id: The agent ID (UUID)

        Returns:
            "regular", "graph", "official", or None if agent not found
        """
        try:
            # Convert string to UUID
            if isinstance(agent_id, str):
                try:
                    agent_uuid = UUID(agent_id)
                except ValueError:
                    return None  # Invalid UUID format
            else:
                agent_uuid = agent_id

            # Check regular agents first (likely more common)
            logger.debug(f"Checking if agent {agent_uuid} is a regular agent")
            regular_agent = await self.agent_repo.get_agent_by_id(agent_uuid)
            if regular_agent:
                return "regular"

            # Check graph agents
            logger.debug(f"Checking if agent {agent_uuid} is a graph agent")
            graph_agent = await self.graph_repo.get_graph_agent_by_id(agent_uuid)
            if graph_agent:
                # Check if it's an official graph agent
                if graph_agent.is_official:
                    return "official"
                return "graph"

            return None
        except Exception as e:
            logger.error(f"Failed to detect agent type for {agent_id}: {e}")
            return None

    async def get_agent_with_type(
        self, agent_id: str | UUID, user_id: str
    ) -> tuple[Union[Agent, GraphAgent, BaseBuiltinGraphAgent], AgentType] | None:
        """
        Get an agent instance along with its type, with user authorization.

        Note: Official agents are available to all users, so user_id is ignored for them.

        Args:
            agent_id: The agent ID (UUID)
            user_id: User ID for authorization (ignored for official agents)

        Returns:
            Tuple of (agent_instance, agent_type) or None if not found/unauthorized
        """
        try:
            # Convert string to UUID
            if isinstance(agent_id, str):
                try:
                    agent_uuid = UUID(agent_id)
                except ValueError:
                    return None  # Invalid UUID format
            else:
                agent_uuid = agent_id

            # Check regular agents
            regular_agent = await self.agent_repo.get_agent_by_id(agent_uuid)
            if regular_agent:
                # System agents are accessible to all users
                from core.system_agent import SYSTEM_CHAT_AGENT_ID, SYSTEM_WORKSHOP_AGENT_ID

                if agent_uuid in [SYSTEM_CHAT_AGENT_ID, SYSTEM_WORKSHOP_AGENT_ID]:
                    return regular_agent, "regular"
                # Regular agents require user ownership
                elif regular_agent.user_id == user_id:
                    return regular_agent, "regular"

            # Check graph agents
            graph_agent = await self.graph_repo.get_graph_agent_by_id(agent_uuid)
            if graph_agent:
                # Official agents are accessible to all users
                if graph_agent.is_official:
                    # Load the Python instance from registry for execution
                    agent_instance = builtin_registry.get_agent(graph_agent.name)
                    if agent_instance:
                        return agent_instance, "official"
                    # Fallback: return DB record if Python instance not found
                    logger.warning(f"Official agent {graph_agent.name} not found in registry")
                    return graph_agent, "official"
                # Regular graph agents require user ownership
                elif graph_agent.user_id == user_id:
                    return graph_agent, "graph"

            return None
        except Exception as e:
            logger.error(f"Failed to get agent with type for {agent_id}: {e}")
            return None

    async def is_graph_agent(self, agent_id: str | UUID) -> bool:
        """
        Quick check if an agent is a graph agent.

        Args:
            agent_id: The agent ID to check

        Returns:
            True if it's a graph agent, False otherwise
        """
        agent_type = await self.detect_agent_type(agent_id)
        return agent_type == "graph"

    async def is_regular_agent(self, agent_id: str | UUID) -> bool:
        """
        Quick check if an agent is a regular agent.

        Args:
            agent_id: The agent ID to check

        Returns:
            True if it's a regular agent, False otherwise
        """
        agent_type = await self.detect_agent_type(agent_id)
        return agent_type == "regular"

    async def is_official_agent(self, agent_id: str | UUID) -> bool:
        """
        Quick check if an agent is an official agent.

        Args:
            agent_id: The agent ID to check

        Returns:
            True if it's an official agent, False otherwise
        """
        agent_type = await self.detect_agent_type(agent_id)
        return agent_type == "official"
