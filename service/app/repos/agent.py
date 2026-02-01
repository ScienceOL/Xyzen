import logging
from typing import Sequence
from uuid import UUID

from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent import Agent, AgentCreate, AgentScope, AgentUpdate
from app.models.knowledge_set import KnowledgeSet
from app.models.links import AgentMcpServerLink
from app.models.mcp import McpServer

logger = logging.getLogger(__name__)


class AgentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_agent_by_id(self, agent_id: UUID) -> Agent | None:
        """
        Fetches an agent by its ID.

        Args:
            agent_id: The UUID of the agent to fetch.

        Returns:
            The Agent, or None if not found.
        """
        logger.debug(f"Fetching agent with id: {agent_id}")
        return await self.db.get(Agent, agent_id)

    async def get_agents_by_user(self, user_id: str) -> Sequence[Agent]:
        """
        Fetches all agents for a given user, ordered by sort_order.

        Args:
            user_id: The user ID.

        Returns:
            List of Agent instances.
        """
        logger.debug(f"Fetching agents for user_id: {user_id}")
        statement = select(Agent).where(Agent.user_id == user_id).order_by(col(Agent.sort_order))
        result = await self.db.exec(statement)
        return result.all()

    async def get_system_agents(self) -> Sequence[Agent]:
        """
        Fetches all system agents.

        Returns:
            List of Agent instances with scope=SYSTEM.
        """
        logger.debug("Fetching all system agents")
        statement = select(Agent).where(Agent.scope == AgentScope.SYSTEM)
        result = await self.db.exec(statement)
        return result.all()

    async def get_agent_by_name_and_scope(self, name: str, scope: AgentScope) -> Agent | None:
        """
        Fetches an agent by its name and scope.

        Args:
            name: The name of the agent.
            scope: The scope of the agent.

        Returns:
            The Agent, or None if not found.
        """
        logger.debug(f"Fetching agent with name: {name} and scope: {scope}")
        statement = select(Agent).where(Agent.name == name, Agent.scope == scope)
        result = await self.db.exec(statement)
        return result.first()

    async def get_agent_by_user_and_name(self, user_id: str, name: str) -> Agent | None:
        """
        Fetches an agent by its user_id and name.

        Args:
            user_id: The user ID.
            name: The name of the agent.

        Returns:
            The Agent, or None if not found.
        """
        logger.debug(f"Fetching agent with name: {name} for user: {user_id}")
        statement = select(Agent).where(Agent.user_id == user_id, Agent.name == name)
        result = await self.db.exec(statement)
        return result.first()

    async def get_agents_by_knowledge_set(self, knowledge_set_id: UUID) -> Sequence[Agent]:
        """
        Fetches all agents linked to a given knowledge set.

        Args:
            knowledge_set_id: The UUID of the knowledge set.

        Returns:
            List of Agent instances.
        """
        logger.debug(f"Fetching agents for knowledge_set_id: {knowledge_set_id}")
        statement = select(Agent).where(Agent.knowledge_set_id == knowledge_set_id)
        result = await self.db.exec(statement)
        return result.all()

    async def validate_knowledge_set_access(self, knowledge_set_id: UUID, user_id: str) -> KnowledgeSet | None:
        """
        Validates that a knowledge set exists and belongs to the user.

        Args:
            knowledge_set_id: The UUID of the knowledge set.
            user_id: The user ID.

        Returns:
            The KnowledgeSet if valid, None otherwise.
        """
        logger.debug(f"Validating knowledge set {knowledge_set_id} for user {user_id}")
        knowledge_set = await self.db.get(KnowledgeSet, knowledge_set_id)
        if not knowledge_set:
            return None
        if knowledge_set.user_id != user_id:
            return None
        if knowledge_set.is_deleted:
            return None
        return knowledge_set

    async def get_agent_with_mcp_servers(self, agent_id: UUID) -> Agent | None:
        """
        Fetches an agent by its ID with MCP servers manually loaded.
        This replaces the relationship-based eager loading.

        Args:
            agent_id: The UUID of the agent to fetch.

        Returns:
            The Agent with mcp_servers attribute populated, or None if not found.
        """
        logger.debug(f"Fetching agent with MCP servers for agent_id: {agent_id}")

        # Get the agent
        agent = await self.db.get(Agent, agent_id)
        if not agent:
            return None

        join_condition = col(McpServer.id) == col(AgentMcpServerLink.mcp_server_id)
        statement = (
            select(McpServer).join(AgentMcpServerLink, join_condition).where(AgentMcpServerLink.agent_id == agent_id)
        )
        result = await self.db.exec(statement)
        mcp_servers = result.all()

        # Manually attach MCP servers to agent
        # Note: This creates a transient attribute, not a database relationship
        setattr(agent, "mcp_servers", mcp_servers)

        return agent

    async def get_agent_mcp_servers(self, agent_id: UUID) -> Sequence[McpServer]:
        """
        Fetches all MCP servers associated with an agent.

        Args:
            agent_id: The UUID of the agent.

        Returns:
            List of McpServer instances.
        """
        logger.debug(f"Fetching MCP servers for agent_id: {agent_id}")

        join_condition = col(McpServer.id) == col(AgentMcpServerLink.mcp_server_id)
        statement = (
            select(McpServer).join(AgentMcpServerLink, join_condition).where(AgentMcpServerLink.agent_id == agent_id)
        )

        mcp_result = await self.db.exec(statement)
        return mcp_result.all()

    async def create_agent(self, agent_data: AgentCreate, user_id: str) -> Agent:
        """
        Creates a new agent with associated MCP servers.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the agent object is populated with DB-defaults before being returned.

        If graph_config is not provided, generates a default ReAct-style graph_config
        using the agent's prompt.

        Args:
            agent_data: The Pydantic model containing the data for the new agent.
            user_id: The user ID (from authentication).

        Returns:
            The newly created Agent instance.
        """
        logger.debug(f"Creating new agent for user_id: {user_id}")

        # Validate knowledge_set_id if provided
        if agent_data.knowledge_set_id:
            knowledge_set = await self.validate_knowledge_set_access(agent_data.knowledge_set_id, user_id)
            if not knowledge_set:
                raise ValueError("Knowledge set not found or access denied")

        # Extract MCP server IDs before creating agent
        mcp_server_ids = agent_data.mcp_server_ids

        # Calculate next sort_order for this user
        max_order_result = await self.db.exec(select(func.max(Agent.sort_order)).where(Agent.user_id == user_id))
        max_order = max_order_result.one_or_none() or 0
        next_sort_order = max_order + 1

        # Generate graph_config if not provided (single source of truth: builtin react config)
        graph_config = agent_data.graph_config
        if graph_config is None:
            from app.agents.builtin import get_builtin_config

            # Get the builtin react config
            builtin_config = get_builtin_config("react")
            if not builtin_config:
                raise ValueError("Default 'react' builtin agent not found")

            graph_config = builtin_config.model_dump()

            # Simplify prompt_config to only show custom_instructions
            # (hide verbose PromptConfig defaults from user)
            if graph_config.get("prompt_config"):
                logger.info(f"Simplifying prompt_config. Before: {list(graph_config['prompt_config'].keys())}")
                graph_config["prompt_config"] = {
                    "custom_instructions": graph_config["prompt_config"].get("custom_instructions", "")
                }
                logger.info(f"After simplification: {graph_config['prompt_config']}")

            # Add builtin_key to metadata so the agent uses the builtin at runtime
            # This ensures consistent behavior between custom agents and template-based agents
            if "metadata" not in graph_config:
                graph_config["metadata"] = {}
            graph_config["metadata"]["builtin_key"] = "react"

            logger.debug("Generated default ReAct graph_config for agent with builtin_key")

        # Create agent without mcp_server_ids (which isn't a model field)
        agent_dict = agent_data.model_dump(exclude={"mcp_server_ids"})
        agent_dict["user_id"] = user_id
        agent_dict["graph_config"] = graph_config  # Use generated or provided config
        agent_dict["sort_order"] = next_sort_order
        agent = Agent(**agent_dict)

        self.db.add(agent)
        await self.db.flush()
        await self.db.refresh(agent)

        # Create links to MCP servers
        if mcp_server_ids:
            for server_id in mcp_server_ids:
                link = AgentMcpServerLink(agent_id=agent.id, mcp_server_id=server_id)
                self.db.add(link)
            await self.db.flush()

        return agent

    async def update_agent(self, agent_id: UUID, agent_data: AgentUpdate) -> Agent | None:
        """
        Updates an existing agent.
        This function does NOT commit the transaction.

        Args:
            agent_id: The UUID of the agent to update.
            agent_data: The Pydantic model containing the update data.

        Returns:
            The updated Agent instance, or None if not found.
        """
        logger.debug(f"Updating agent with id: {agent_id}")
        agent = await self.db.get(Agent, agent_id)
        if not agent:
            return None

        # Validate knowledge_set_id if being updated
        if agent_data.knowledge_set_id is not None and agent.user_id:
            knowledge_set = await self.validate_knowledge_set_access(agent_data.knowledge_set_id, agent.user_id)
            if not knowledge_set:
                raise ValueError("Knowledge set not found or access denied")

        mcp_server_ids = agent_data.mcp_server_ids
        # Use safe update pattern to avoid null constraint violations
        update_data = agent_data.model_dump(exclude_unset=True, exclude_none=True, exclude={"mcp_server_ids"})
        for key, value in update_data.items():
            if hasattr(agent, key):
                setattr(agent, key, value)

        self.db.add(agent)
        await self.db.flush()
        if mcp_server_ids is not None:
            delete_statement = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent_id)
            delete_result = await self.db.exec(delete_statement)
            existing_links = delete_result.all()
            for link in existing_links:
                await self.db.delete(link)
            for server_id in mcp_server_ids:
                link = AgentMcpServerLink(agent_id=agent_id, mcp_server_id=server_id)
                self.db.add(link)
            await self.db.flush()
        await self.db.refresh(agent)
        return agent

    async def delete_agent(self, agent_id: UUID) -> bool:
        """
        Deletes an agent by its ID.
        This function does NOT commit the transaction.
        Note: Links to MCP servers should be deleted automatically via cascade or manually.

        Args:
            agent_id: The UUID of the agent to delete.

        Returns:
            True if the agent was deleted, False if not found.
        """
        logger.debug(f"Deleting agent with id: {agent_id}")
        link_statement = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent_id)
        link_result = await self.db.exec(link_statement)
        links = link_result.all()
        for link in links:
            await self.db.delete(link)
        agent = await self.db.get(Agent, agent_id)
        if not agent:
            return False
        await self.db.delete(agent)
        await self.db.flush()
        return True

    async def link_agent_to_mcp_server(self, agent_id: UUID, mcp_server_id: UUID) -> bool:
        """
        Creates a link between an agent and an MCP server.
        This function does NOT commit the transaction.

        Args:
            agent_id: The UUID of the agent.
            mcp_server_id: The UUID of the MCP server.

        Returns:
            True if the link was created, False if it already exists.
        """
        logger.debug(f"Linking agent {agent_id} to MCP server {mcp_server_id}")
        statement = select(AgentMcpServerLink).where(
            AgentMcpServerLink.agent_id == agent_id,
            AgentMcpServerLink.mcp_server_id == mcp_server_id,
        )
        result = await self.db.exec(statement)
        existing_link = result.first()
        if existing_link:
            return False
        link = AgentMcpServerLink(agent_id=agent_id, mcp_server_id=mcp_server_id)
        self.db.add(link)
        await self.db.flush()
        return True

    async def unlink_agent_from_mcp_server(self, agent_id: UUID, mcp_server_id: UUID) -> bool:
        """
        Removes a link between an agent and an MCP server.
        This function does NOT commit the transaction.

        Args:
            agent_id: The UUID of the agent.
            mcp_server_id: The UUID of the MCP server.

        Returns:
            True if the link was removed, False if it didn't exist.
        """
        logger.debug(f"Unlinking agent {agent_id} from MCP server {mcp_server_id}")
        statement = select(AgentMcpServerLink).where(
            AgentMcpServerLink.agent_id == agent_id,
            AgentMcpServerLink.mcp_server_id == mcp_server_id,
        )
        result = await self.db.exec(statement)
        link = result.first()
        if not link:
            return False
        await self.db.delete(link)
        await self.db.flush()
        return True

    async def link_agent_to_mcp_servers(self, agent_id: UUID, mcp_server_ids: Sequence[UUID]) -> None:
        """
        Links an agent to multiple MCP servers.
        Ignores existing links.
        This function does NOT commit the transaction.

        Args:
            agent_id: The UUID of the agent.
            mcp_server_ids: List of MCP server UUIDs.
        """
        logger.debug(f"Linking agent {agent_id} to {len(mcp_server_ids)} MCP servers")

        # Get existing links to avoid duplicates
        statement = select(AgentMcpServerLink.mcp_server_id).where(AgentMcpServerLink.agent_id == agent_id)
        result = await self.db.exec(statement)
        existing_ids = set(result.all())

        for server_id in mcp_server_ids:
            if server_id not in existing_ids:
                link = AgentMcpServerLink(agent_id=agent_id, mcp_server_id=server_id)
                self.db.add(link)

        await self.db.flush()

    async def update_agents_sort_order(self, user_id: str, agent_ids: list[UUID]) -> None:
        """
        Updates the sort_order of multiple agents based on their position in the list.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID (for authorization check).
            agent_ids: Ordered list of agent UUIDs. The index becomes the new sort_order.
        """
        logger.debug(f"Updating sort order for {len(agent_ids)} agents")

        for index, agent_id in enumerate(agent_ids):
            agent = await self.db.get(Agent, agent_id)
            if agent and agent.user_id == user_id:
                agent.sort_order = index
                self.db.add(agent)

        await self.db.flush()
