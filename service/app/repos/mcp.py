import datetime
import logging
from typing import Any, Dict, List
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.providers import SYSTEM_USER_ID
from app.models.mcp import McpServer, McpServerCreate, McpServerUpdate

logger = logging.getLogger(__name__)


class McpRepository:
    """MCP Server data access layer"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_mcp_server(self, server_data: McpServerCreate, user_id: str) -> McpServer:
        """
        Creates a new MCP server.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the server object is populated with DB-defaults before being returned.

        Args:
            server_data: The Pydantic model containing the data for the new server.
            user_id: The user ID (from authentication).

        Returns:
            The newly created McpServer instance.
        """
        logger.debug(f"Creating new MCP server for user_id: {user_id}")

        server_dict = server_data.model_dump()
        server_dict["user_id"] = user_id
        server = McpServer(**server_dict)

        self.db.add(server)
        await self.db.flush()
        await self.db.refresh(server)

        logger.info(f"Created MCP server: {server.id} for user {user_id}")
        return server

    async def get_mcp_server_by_id(self, server_id: UUID) -> McpServer | None:
        """
        Fetches an MCP server by its ID.

        Args:
            server_id: The UUID of the server to fetch.

        Returns:
            The McpServer, or None if not found.
        """
        logger.debug(f"Fetching MCP server with id: {server_id}")
        return await self.db.get(McpServer, server_id)

    async def get_mcp_servers_by_user(self, user_id: str) -> list[McpServer]:
        """
        Get list of MCP servers for a user.

        Args:
            user_id: The user ID to fetch servers for.

        Returns:
            List of McpServer instances.
        """
        logger.debug(f"Fetching MCP servers for user_id: {user_id}")
        result = await self.db.exec(select(McpServer).where(McpServer.user_id == user_id))
        servers = list(result.all())
        logger.debug(f"Found {len(servers)} MCP servers for user {user_id}")
        return servers

    async def get_online_mcp_servers_by_user(self, user_id: str) -> list[McpServer]:
        """
        Get list of online MCP servers for a user.

        Args:
            user_id: The user ID to fetch servers for.

        Returns:
            List of online McpServer instances.
        """
        logger.debug(f"Fetching online MCP servers for user_id: {user_id}")
        result = await self.db.exec(select(McpServer).where(McpServer.user_id == user_id, McpServer.status == "online"))
        servers = list(result.all())
        logger.debug(f"Found {len(servers)} online MCP servers for user {user_id}")
        return servers

    async def update_mcp_server(self, server_id: UUID, server_data: McpServerUpdate) -> McpServer | None:
        """
        Updates an existing MCP server.
        This function does NOT commit the transaction.

        Args:
            server_id: The UUID of the server to update.
            server_data: The Pydantic model containing the update data.

        Returns:
            The updated McpServer instance, or None if not found.
        """
        logger.debug(f"Updating MCP server with id: {server_id}")
        server = await self.db.get(McpServer, server_id)
        if not server:
            return None

        # Only update fields that are not None to avoid null constraint violations
        update_data = server_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(server, key):
                setattr(server, key, value)

        self.db.add(server)
        await self.db.flush()
        await self.db.refresh(server)

        logger.info(f"Updated MCP server: {server.id}")
        return server

    async def update_mcp_server_status(
        self, server_id: UUID, status: str, tools: List[Dict[str, Any]] | None = None
    ) -> McpServer | None:
        """
        Updates MCP server status and tools.

        Args:
            server_id: The UUID of the server to update.
            status: New status (e.g., "online", "offline", "error").
            tools: Optional tools list to update.

        Returns:
            The updated McpServer instance, or None if not found.
        """
        logger.debug(f"Updating MCP server status: {server_id} -> {status}")
        server = await self.db.get(McpServer, server_id)
        if not server:
            return None

        server.status = status
        server.last_checked_at = datetime.datetime.now(datetime.timezone.utc)
        if tools is not None:
            server.tools = tools

        self.db.add(server)
        await self.db.flush()
        await self.db.refresh(server)

        logger.info(f"Updated MCP server status: {server.id} -> {status}")
        return server

    async def delete_mcp_server(self, server_id: UUID) -> bool:
        """
        Deletes an MCP server by its ID.
        This function does NOT commit the transaction.

        Args:
            server_id: The UUID of the server to delete.

        Returns:
            True if the server was deleted, False if not found.
        """
        logger.debug(f"Deleting MCP server with id: {server_id}")
        server = await self.db.get(McpServer, server_id)
        if not server:
            return False

        await self.db.delete(server)
        await self.db.flush()
        return True

    async def get_servers_with_tools(self, user_id: str) -> list[McpServer]:
        """
        Get MCP servers that have tools available.

        Args:
            user_id: The user ID to fetch servers for.

        Returns:
            List of McpServer instances that have tools.
        """
        logger.debug(f"Fetching MCP servers with tools for user_id: {user_id}")
        result = await self.db.exec(
            select(McpServer).where(
                McpServer.user_id == user_id,
                McpServer.status == "online",
                col(McpServer.tools).is_not(None),
            )
        )
        servers = list(result.all())
        logger.debug(f"Found {len(servers)} MCP servers with tools for user {user_id}")
        return servers

    async def get_system_mcp_servers(self) -> list[McpServer]:
        """
        Get list of system (global) MCP servers.
        These are servers where user_id is SYSTEM_USER_ID.

        Returns:
            List of McpServer instances.
        """
        logger.debug("Fetching system MCP servers")
        result = await self.db.exec(select(McpServer).where(McpServer.user_id == SYSTEM_USER_ID))
        servers = list(result.all())
        logger.debug(f"Found {len(servers)} system MCP servers")
        return servers
