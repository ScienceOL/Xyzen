"""
Dynamic MCP Server - Dynamic tools folder monitoring MCP server

This server will:
- Monitor Python files in the tools folder
- Dynamically import and register non-underscore-prefixed functions as tools
- Detect tool changes and record differences
- Provide SSE interface listening on 0.0.0.0:3001
- Smart caching: Only reload the currently called tool during tool calls (not global reload)
"""

import logging
import subprocess
from datetime import datetime
from typing import Callable, List, Optional

from fastmcp import Client, FastMCP
from fastmcp.server.auth import JWTVerifier, TokenVerifier
from fastmcp.server.dependencies import get_access_token
from fastmcp.server.middleware import Middleware, MiddlewareContext
from fastmcp.server.middleware.error_handling import ErrorHandlingMiddleware
from fastmcp.server.middleware.logging import StructuredLoggingMiddleware
from fastmcp.server.middleware.timing import DetailedTimingMiddleware
from fastmcp.tools.tool import ToolResult

from app.configs import configs
from app.middleware.auth import AuthProvider
from app.middleware.auth import AuthProvider as InternalAuthProvider
from app.middleware.auth.token_verifier.bohr_app_token_verifier import BohrAppTokenVerifier
from app.mcp.builtin_tools import register_built_in_tools
from app.utils.json_patch import apply_json_patch
from app.tools.dynamic.manager import register_manage_tools
from app.tools.dynamic.loader import tool_loader

# 创建认证提供者 - 使用 TokenVerifier 类型但赋值给变量名 auth
# 这个变量会被 MCP 自动发现机制识别为 AuthProvider（因为 TokenVerifier 继承自 AuthProvider）
auth: TokenVerifier

match InternalAuthProvider.get_provider_name():
    case "bohrium":
        auth = JWTVerifier(
            public_key=InternalAuthProvider.public_key,
        )
    case "casdoor":
        auth = JWTVerifier(
            jwks_uri=InternalAuthProvider.jwks_uri,
        )
    case "bohr_app":
        auth = BohrAppTokenVerifier(
            api_url=InternalAuthProvider.issuer,
            x_app_key="xyzen-uuid1760783737",
        )
    case _:
        raise ValueError(f"Unsupported authentication provider: {InternalAuthProvider.get_provider_name()}")


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
                    result = await tool_loader.refresh_tools(self.mcp, user_id=user_id)
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
            try:
                await self.init_client()
                if self.browser_mcp_client is None:
                    logger.error("Browser MCP client failed to initialize")
                    raise RuntimeError("Browser MCP client failed to initialize")

                logger.info(f"Calling browser tool: {tool_name}")
                tool_call_result = await self.browser_mcp_client.call_tool(
                    tool_name, getattr(context.message, "arguments", {})
                )
                result = ToolResult(tool_call_result.content, tool_call_result.structured_content)
            except Exception as e:
                logger.error(f"Failed to execute browser tool {tool_name}: {e}", exc_info=True)
                raise
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
        return result

    async def on_list_tools(self, context: MiddlewareContext, call_next: Callable) -> List:
        """Refresh user's tools before listing"""

        # Extract user_id from JWT token
        access_token = get_access_token()

        if access_token:
            try:
                user_info = AuthProvider.parse_user_info(access_token.claims)
                user_id = user_info.id

                logger.info(f"Refreshing tools for user {user_id} before list_tools")
                result = await tool_loader.refresh_tools(self.mcp, user_id=user_id)
                logger.info(f"Tool refresh result: {result}")
            except Exception as e:
                logger.error(f"Error refreshing tools: {e}")
                # Continue anyway - built-in tools still available
        else:
            logger.warning("No access token, skipping user tool refresh")

        # Continue executing list tools
        # This will return tools visible to MCP (built-in + current user's)
        return await call_next(context)


# TODO: Need asycn support
async def proxy_playwright_server() -> None:
    from playwright.mcp import Client  # type: ignore

    # Mirror Remote MCP Server Tools
    proxy = FastMCP.as_proxy("http://127.0.0.1:8931/mcp/")
    subprocess.Popen(
        ["npx", "@playwright/mcp@latest", "--port", str(PLAYWRIGHT_PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    # This proxy will reuse the connected session for all requests
    connected_client = Client(f"http://{HOST}:{PLAYWRIGHT_PORT}/mcp/")
    proxy = FastMCP.as_proxy(connected_client)
    remote_tools = await proxy.get_tools()
    for tool_name, tool_info in remote_tools.items():
        if tool_name in [
            "browser_resize",
            "browser_install",
            "browser_take_screenshot",
        ]:
            continue
        try:
            # Create local copy
            local_tool = tool_info.copy()
            # Add to local server
            mcp.add_tool(local_tool)
            logger.info(f"Mirrored tool from remote server: {tool_info.name}")
        except Exception as e:
            logger.error(f"Failed to mirror tool {tool_info.name}: {e}")
    connected_client.close()


dynamic_mcp_config = configs.DynamicMCP
NAME = dynamic_mcp_config.name
VERSION = dynamic_mcp_config.version
HOST = dynamic_mcp_config.host
PORT = dynamic_mcp_config.port
TRANSPORT = dynamic_mcp_config.transport
ALLOWED_PATHS = dynamic_mcp_config.allowed_paths
PLAYWRIGHT_PORT = dynamic_mcp_config.playwright_port

apply_json_patch()
logger = logging.getLogger(__name__)

mcp = FastMCP(NAME, version=VERSION)
mcp.add_middleware(ErrorHandlingMiddleware(include_traceback=True))
mcp.add_middleware(DynamicToolMiddleware(mcp))
mcp.add_middleware(DetailedTimingMiddleware())
mcp.add_middleware(StructuredLoggingMiddleware(include_payloads=True))

register_built_in_tools(mcp)
register_manage_tools(mcp)

# Database tools are loaded on-demand per user request (not at startup)
logger.info("Database tool loader initialized (tools loaded on-demand per user)")

logger.info("Server is starting...")
