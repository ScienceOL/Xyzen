import logging
from datetime import datetime
from typing import Callable, List, Optional

from fastmcp import Client, FastMCP
from fastmcp.server.dependencies import get_access_token
from fastmcp.server.middleware import Middleware, MiddlewareContext
from fastmcp.tools.tool import ToolResult

from internal import configs
from middleware.auth import AuthProvider
from utils.tool_loader import tool_loader

dynamic_mcp_config = configs.DynamicMCP

logger = logging.getLogger(__name__)


class DynamicToolMiddleware(Middleware):
    """Dynamic tool middleware that refreshes tools on every tool call and list tools"""

    browser_mcp_client: Optional[Client] = None

    def __init__(self, mcp: FastMCP) -> None:
        self.mcp = mcp

    async def init_client(self) -> None:
        if self.browser_mcp_client is None:
            logger.info("Initializing browser MCP client")
            self.browser_mcp_client = Client(
                f"http://{dynamic_mcp_config.host}:{dynamic_mcp_config.playwright_port}/mcp"
            )
            await self.browser_mcp_client._connect()

    async def on_call_tool(self, context: MiddlewareContext, call_next: Callable) -> ToolResult:
        """Refresh current tool when calling tool, with user isolation and permission check"""
        tool_name = context.message.name
        start_time = datetime.now()

        # Check if it's a database tool (has "-" but not browser tool)
        is_db_tool = "-" in tool_name and not tool_name.startswith("browser_")

        if is_db_tool:
            # Extract user_id from JWT token
            access_token = get_access_token()

            if access_token:
                try:
                    user_info = AuthProvider.parse_user_info(access_token.claims)
                    user_id = user_info.id

                    # Verify ownership before refresh
                    if tool_name in tool_loader._tool_ownership:
                        tool_owner = tool_loader._tool_ownership[tool_name]
                        if tool_owner != user_id:
                            logger.error(
                                f"Permission denied: User {user_id} "
                                f"attempted to call tool {tool_name} owned by {tool_owner}"
                            )
                            raise PermissionError(f"You don't have permission to call tool '{tool_name}'")

                    # Refresh user's tools
                    logger.info(f"Refreshing tools for user {user_id} before calling {tool_name}")
                    result = tool_loader.refresh_tools(self.mcp, user_id=user_id)
                    logger.info(f"Tool refresh completed: {result}")

                except PermissionError:
                    raise  # Re-raise permission errors
                except Exception as e:
                    logger.error(f"Error refreshing tools: {e}")
                    # Continue anyway - tool might still be loaded
            else:
                logger.warning("No access token for database tool call")
                raise PermissionError("Authentication required to call database tools")

        # Execute tool
        logger.warning(f"🚀 Execute: {tool_name} Arguments: {getattr(context.message, 'arguments', {})}")
        if tool_name.startswith("browser_"):
            await self.init_client()
            assert self.browser_mcp_client is not None
            tool_call_result = await self.browser_mcp_client.call_tool(
                tool_name, getattr(context.message, "arguments", {})
            )
            result = ToolResult(tool_call_result.content, tool_call_result.structured_content)  # type: ignore
        else:
            result = await call_next(context)
        end_time = datetime.now()
        execution_time = (end_time - start_time).total_seconds()
        # Log successful execution
        logger.info(f"✅ Complete: {tool_name} {execution_time:.3f} seconds")
        # Log result summary
        if hasattr(result, "content") and result.content and tool_name not in ["tool_environment_current_functions"]:
            try:
                content_item = result.content[0]
                content_preview = getattr(content_item, "text", f"[{type(content_item).__name__}]")
                logger.info(f"📋 Result {type(result).__name__}({len(result.content)}): {content_preview}")
            except (IndexError, AttributeError):
                logger.info(f"📋 Result {type(result).__name__}({len(result.content)}): [content not accessible]")
        else:
            logger.info(f"📋 Result {type(result).__name__}: {vars(result)}")
        return result  # type: ignore

    async def on_list_tools(self, context: MiddlewareContext, call_next: Callable) -> List:
        """Refresh user's tools before listing"""

        # Extract user_id from JWT token
        access_token = get_access_token()

        if access_token:
            try:
                user_info = AuthProvider.parse_user_info(access_token.claims)
                user_id = user_info.id

                logger.info(f"Refreshing tools for user {user_id} before list_tools")
                result = tool_loader.refresh_tools(self.mcp, user_id=user_id)
                logger.info(f"Tool refresh result: {result}")
            except Exception as e:
                logger.error(f"Error refreshing tools: {e}")
                # Continue anyway - built-in tools still available
        else:
            logger.warning("No access token, skipping user tool refresh")

        # Continue executing list tools
        # This will return tools visible to MCP (built-in + current user's)
        return await call_next(context)  # type: ignore
