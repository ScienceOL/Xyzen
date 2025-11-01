"""
Agent Service Layer

Provides unified access to both regular agents and graph agents.
This service layer abstracts the differences between agent types
and provides a consistent interface for the frontend.
"""

from typing import Any, List, Literal
from uuid import UUID

from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from repo import AgentRepository
from repo.graph import GraphRepository


class UnifiedAgentRead(BaseModel):
    """
    Unified agent model that represents both regular and graph agents.

    This model provides a consistent interface for the frontend to work with
    both agent types without needing to distinguish between them at the UI level.
    """

    id: str
    name: str
    description: str | None = None
    avatar: str | None = None
    agent_type: Literal["regular", "graph"]
    tags: list[str] | None = None
    model: str | None = None
    temperature: float | None = None
    prompt: str | None = None
    require_tool_confirmation: bool = False
    provider_id: str | None = None
    is_active: bool = True
    created_at: str
    updated_at: str
    mcp_servers: list[dict[str, Any]] = []

    # Graph-specific fields (only populated for graph agents)
    state_schema: dict[str, Any] | None = None
    node_count: int = 0
    edge_count: int = 0


class AgentService:
    """
    Service layer for unified agent management.

    Provides methods to work with both regular and graph agents
    through a consistent interface.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.agent_repo = AgentRepository(db)
        self.graph_repo = GraphRepository(db)

    async def get_all_agents_for_user(self, user_id: str) -> List[UnifiedAgentRead]:
        """
        Get all agents (both regular and graph) for a user.

        Returns a unified list that includes both regular agents and graph agents,
        marked with their respective types for frontend differentiation.

        Args:
            user_id: The user ID to fetch agents for

        Returns:
            List of UnifiedAgentRead objects representing all user agents
        """
        unified_agents: List[UnifiedAgentRead] = []

        # Get regular agents
        regular_agents = await self.agent_repo.get_agents_by_user(user_id)
        for agent in regular_agents:
            # Get MCP servers for this regular agent
            mcp_servers = await self.agent_repo.get_agent_mcp_servers(agent.id)
            mcp_servers_dict = [server.model_dump() for server in mcp_servers]

            unified_agent = UnifiedAgentRead(
                id=str(agent.id),
                name=agent.name,
                description=agent.description,
                avatar=agent.avatar,
                agent_type="regular",
                tags=agent.tags,
                model=agent.model,
                temperature=agent.temperature,
                prompt=agent.prompt,
                require_tool_confirmation=agent.require_tool_confirmation,
                provider_id=str(agent.provider_id) if agent.provider_id else None,
                is_active=True,  # Regular agents don't have is_active field
                created_at=agent.created_at.isoformat(),
                updated_at=agent.updated_at.isoformat(),
                mcp_servers=mcp_servers_dict,
            )
            unified_agents.append(unified_agent)

        # Get graph agents
        graph_agents = await self.graph_repo.get_graph_agents_by_user(user_id)
        for agent in graph_agents:
            # Get node and edge counts for this graph agent
            agent_with_graph = await self.graph_repo.get_graph_agent_with_graph(agent.id)
            node_count = len(agent_with_graph.nodes) if agent_with_graph else 0
            edge_count = len(agent_with_graph.edges) if agent_with_graph else 0

            unified_agent = UnifiedAgentRead(
                id=str(agent.id),
                name=agent.name,
                description=agent.description,
                avatar=None,  # Graph agents don't have avatars yet
                agent_type="graph",
                tags=None,  # Graph agents don't have tags yet
                model=None,  # Graph agents don't have a single model
                temperature=None,  # Graph agents don't have global temperature
                prompt=None,  # Graph agents use state schema instead
                require_tool_confirmation=False,  # Graph agents handle this per node
                provider_id=None,  # Graph agents can have per-node providers
                is_active=agent.is_active,
                created_at=agent.created_at.isoformat(),
                updated_at=agent.updated_at.isoformat(),
                state_schema=agent.state_schema,
                node_count=node_count,
                edge_count=edge_count,
            )
            unified_agents.append(unified_agent)

        # Sort by updated_at descending (most recently updated first)
        unified_agents.sort(key=lambda a: a.updated_at, reverse=True)

        return unified_agents

    async def get_agent_by_id(self, agent_id: UUID, user_id: str) -> UnifiedAgentRead | None:
        """
        Get a specific agent by ID, regardless of type.

        Args:
            agent_id: The agent ID to fetch
            user_id: The user ID for authorization

        Returns:
            UnifiedAgentRead object or None if not found/unauthorized
        """
        # Try regular agent first
        regular_agent = await self.agent_repo.get_agent_by_id(agent_id)
        if regular_agent and regular_agent.user_id == user_id:
            # Get MCP servers for this regular agent
            mcp_servers = await self.agent_repo.get_agent_mcp_servers(regular_agent.id)
            mcp_servers_dict = [server.model_dump() for server in mcp_servers]

            return UnifiedAgentRead(
                id=str(regular_agent.id),
                name=regular_agent.name,
                description=regular_agent.description,
                avatar=regular_agent.avatar,
                agent_type="regular",
                tags=regular_agent.tags,
                model=regular_agent.model,
                temperature=regular_agent.temperature,
                prompt=regular_agent.prompt,
                require_tool_confirmation=regular_agent.require_tool_confirmation,
                provider_id=str(regular_agent.provider_id) if regular_agent.provider_id else None,
                is_active=True,
                created_at=regular_agent.created_at.isoformat(),
                updated_at=regular_agent.updated_at.isoformat(),
                mcp_servers=mcp_servers_dict,
            )

        # Try graph agent
        graph_agent = await self.graph_repo.get_graph_agent_by_id(agent_id)
        if graph_agent and graph_agent.user_id == user_id:
            # Get node and edge counts
            agent_with_graph = await self.graph_repo.get_graph_agent_with_graph(agent_id)
            node_count = len(agent_with_graph.nodes) if agent_with_graph else 0
            edge_count = len(agent_with_graph.edges) if agent_with_graph else 0

            return UnifiedAgentRead(
                id=str(graph_agent.id),
                name=graph_agent.name,
                description=graph_agent.description,
                avatar=None,
                agent_type="graph",
                tags=None,
                model=None,
                temperature=None,
                prompt=None,
                require_tool_confirmation=False,
                provider_id=None,
                is_active=graph_agent.is_active,
                created_at=graph_agent.created_at.isoformat(),
                updated_at=graph_agent.updated_at.isoformat(),
                state_schema=graph_agent.state_schema,
                node_count=node_count,
                edge_count=edge_count,
            )

        return None
