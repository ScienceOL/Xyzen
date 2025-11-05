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
from handler.builtin_agents import registry as builtin_registry
from handler.builtin_agents.base_graph_agent import BaseBuiltinGraphAgent


logger = logging.getLogger(__name__)

AgentType = Literal["regular", "graph", "builtin"]


class AgentTypeDetector:
    """Service for detecting agent types and retrieving agent instances."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.agent_repo = AgentRepository(db)
        self.graph_repo = GraphRepository(db)

    async def detect_agent_type(self, agent_id: str | UUID) -> AgentType | None:
        """
        Detect whether an agent is regular, graph-based, or builtin.

        Args:
            agent_id: The agent ID to check (string for builtin agents, UUID for regular/graph agents)

        Returns:
            "regular", "graph", "builtin", or None if agent not found
        """
        try:
            # Check if it's a builtin agent (string ID starting with "builtin_")
            if isinstance(agent_id, str) and agent_id.startswith("builtin_"):
                logger.debug(f"Checking if agent {agent_id} is a builtin agent")
                agent_name = agent_id[8:]  # Remove "builtin_" prefix
                if builtin_registry.get_agent(agent_name):
                    return "builtin"
                return None

            # For regular and graph agents, we need a UUID
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

        Note: Builtin agents are available to all users, so user_id is ignored for them.

        Args:
            agent_id: The agent ID to retrieve (string for builtin agents, UUID for regular/graph agents)
            user_id: User ID for authorization (ignored for builtin agents)

        Returns:
            Tuple of (agent_instance, agent_type) or None if not found/unauthorized
        """
        try:
            # Check if it's a builtin agent (available to all users)
            if isinstance(agent_id, str) and agent_id.startswith("builtin_"):
                agent_name = agent_id[8:]  # Remove "builtin_" prefix
                builtin_agent = builtin_registry.get_agent(agent_name)
                if builtin_agent:
                    return builtin_agent, "builtin"

            # For regular and graph agents, we need a UUID
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
            if graph_agent and graph_agent.user_id == user_id:
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

    async def is_builtin_agent(self, agent_id: str | UUID) -> bool:
        """
        Quick check if an agent is a builtin agent.

        Args:
            agent_id: The agent ID to check

        Returns:
            True if it's a builtin agent, False otherwise
        """
        agent_type = await self.detect_agent_type(agent_id)
        return agent_type == "builtin"
