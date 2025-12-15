import asyncio
import datetime
import logging
from uuid import UUID

import httpx
from fastmcp import Client
from fastmcp.client.auth import BearerAuth

from core.websocket import mcp_websocket_manager
from infra.database import get_session
from models.mcp import McpServer

logger = logging.getLogger(__name__)


async def async_check_mcp_server_status(server_id: UUID | None) -> None:
    """
    Asynchronously checks the status of an MCP server using fastmcp.Client.
    """
    if server_id is None:
        return

    async for session in get_session():
        server = await session.get(McpServer, server_id)
        if not server:
            logger.warning(f"MCP server with ID {server_id} not found in database.")
            return

        try:
            # Use BearerAuth if a token is provided, otherwise no auth
            auth = BearerAuth(server.token) if server.token else None

            # Initialize the client with the server URL, auth helper, and a 10-second timeout
            client = Client(server.url, auth=auth, timeout=30.0)

            async with client:
                # list_tools() will implicitly check the connection and list tools
                tools_response = await client.list_tools()
                server.status = "online"
                server.tools = [tool.model_dump() for tool in tools_response]
                logger.info(f"MCP server '{server.name}' ({server.id}) is online with {len(server.tools)} tools.")
        except httpx.TimeoutException:
            server.status = "offline"
            server.tools = []
            logger.warning(f"Timeout while checking MCP server '{server.name}' ({server.id}) at {server.url}.")
        except Exception as e:
            server.status = "offline"
            server.tools = []
            logger.error(
                f"An unexpected error occurred while checking MCP server '{server.name}' ({server.id}): {e}",
                exc_info=True,
            )
        finally:
            server.last_checked_at = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
            session.add(server)
            await session.commit()
            await session.refresh(server)
            # Broadcast the update to all connected clients
            await mcp_websocket_manager.broadcast(server.model_dump())


def check_mcp_server_status(server_id: UUID) -> None:
    """
    Checks the status of an MCP server, updates its tools list, and records the check time.
    This is a sync wrapper for the async check function.
    It ensures that the async task is run on the main event loop.
    """
    try:
        loop = asyncio.get_running_loop()
        # If a loop is running, create a task on it.
        # This is the standard case when called from within an async app like FastAPI.
        loop.create_task(async_check_mcp_server_status(server_id))
    except RuntimeError:
        # This case should ideally not be hit in the FastAPI context,
        # but is a fallback for running this function in a purely sync context.
        logger.warning("No running event loop found. Running async_check_mcp_server_status in a new loop.")
        asyncio.run(async_check_mcp_server_status(server_id))
