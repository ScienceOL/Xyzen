import logging
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.agent import Agent, AgentCreate, AgentUpdate
from models.links import AgentMcpServerLink
from models.mcp import McpServer

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

    async def get_agents_by_user(self, user_id: str) -> list[Agent]:
        """
        Fetches all agents for a given user.

        Args:
            user_id: The user ID.

        Returns:
            List of Agent instances.
        """
        logger.debug(f"Fetching agents for user_id: {user_id}")
        statement = select(Agent).where(Agent.user_id == user_id)
        result = await self.db.exec(statement)
        return list(result.all())

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

        # Manually query MCP servers through the link table
        link_statement = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent_id)
        link_result = await self.db.exec(link_statement)
        links = list(link_result.all())

        # Get all MCP server IDs
        mcp_server_ids = [link.mcp_server_id for link in links if link.mcp_server_id]

        # Fetch MCP servers
        mcp_servers: list[McpServer] = []
        if mcp_server_ids:
            mcp_statement = select(McpServer).where(McpServer.id.in_(mcp_server_ids))  # type: ignore
            mcp_result = await self.db.exec(mcp_statement)
            mcp_servers = list(mcp_result.all())

        # Manually attach MCP servers to agent
        # Note: This creates a transient attribute, not a database relationship
        setattr(agent, "mcp_servers", mcp_servers)

        return agent

    async def get_agent_mcp_servers(self, agent_id: UUID) -> list[McpServer]:
        """
        Fetches all MCP servers associated with an agent.

        Args:
            agent_id: The UUID of the agent.

        Returns:
            List of McpServer instances.
        """
        logger.debug(f"Fetching MCP servers for agent_id: {agent_id}")

        # Query through the link table
        link_statement = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent_id)
        link_result = await self.db.exec(link_statement)
        links = list(link_result.all())

        # Get all MCP server IDs
        mcp_server_ids = [link.mcp_server_id for link in links if link.mcp_server_id]

        # Fetch MCP servers
        if not mcp_server_ids:
            return []

        mcp_statement = select(McpServer).where(McpServer.id.in_(mcp_server_ids))  # type: ignore
        mcp_result = await self.db.exec(mcp_statement)
        return list(mcp_result.all())

    async def create_agent(self, agent_data: AgentCreate, user_id: str) -> Agent:
        """
        Creates a new agent with associated MCP servers.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the agent object is populated with DB-defaults before being returned.

        Args:
            agent_data: The Pydantic model containing the data for the new agent.
            user_id: The user ID (from authentication).

        Returns:
            The newly created Agent instance.
        """
        logger.debug(f"Creating new agent for user_id: {user_id}")

        # Extract MCP server IDs before creating agent
        mcp_server_ids = agent_data.mcp_server_ids

        # Create agent without mcp_server_ids (which isn't a model field)
        agent_dict = agent_data.model_dump(exclude={"mcp_server_ids"})
        agent_dict["user_id"] = user_id
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

    async def create_agent_with_fixed_id(self, agent_id: UUID, agent_data: AgentCreate, user_id: str) -> Agent:
        """
        Creates a new agent with a specific UUID (for system agents).
        This function does NOT commit the transaction, but it does flush the session
        to ensure the agent object is populated with DB-defaults before being returned.

        Args:
            agent_id: The specific UUID to use for the agent.
            agent_data: The Pydantic model containing the data for the new agent.
            user_id: The user ID (from authentication).

        Returns:
            The newly created Agent instance with the specified UUID.
        """
        logger.debug(f"Creating new agent with fixed ID {agent_id} for user_id: {user_id}")

        # Check if agent with this ID already exists
        existing = await self.db.get(Agent, agent_id)
        if existing:
            raise ValueError(f"Agent with ID {agent_id} already exists")

        # Extract MCP server IDs before creating agent
        mcp_server_ids = agent_data.mcp_server_ids

        # Create agent without mcp_server_ids (which isn't a model field)
        agent_dict = agent_data.model_dump(exclude={"mcp_server_ids"})
        agent_dict["user_id"] = user_id
        agent_dict["id"] = agent_id  # Set the specific UUID
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

        logger.info(f"Created agent with fixed ID: {agent.id} - {agent.name}")
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
            existing_links = list(delete_result.all())
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
        links = list(link_result.all())
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
