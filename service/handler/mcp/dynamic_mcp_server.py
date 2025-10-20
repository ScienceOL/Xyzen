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

from fastmcp import FastMCP
from fastmcp.server.auth import JWTVerifier
from fastmcp.server.middleware.error_handling import ErrorHandlingMiddleware
from fastmcp.server.middleware.logging import StructuredLoggingMiddleware
from fastmcp.server.middleware.timing import DetailedTimingMiddleware

from internal import configs
from middleware.auth import AuthProvider
from middleware.dynamic_mcp_server import DynamicToolMiddleware
from utils.built_in_tools import register_built_in_tools
from utils.json_patch import apply_json_patch
from utils.manage_tools import register_manage_tools
from utils.tool_loader import tool_loader

match AuthProvider.get_provider_name():
    case "bohrium":
        dynamic_mcp_auth = JWTVerifier(
            public_key=AuthProvider.public_key,
        )
    case "casdoor":
        dynamic_mcp_auth = JWTVerifier(
            jwks_uri=AuthProvider.jwks_uri,
        )
    case _:
        raise ValueError(f"Unsupported authentication provider: {AuthProvider.get_provider_name()}")


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

# Load Local Tools
logger.info("Loading local tools...")
tools = tool_loader.scan_and_load_tools()
tool_loader.register_tools_to_mcp(mcp, tools)
logger.info(f"Loaded {len(tools)} local tools")

logger.info("Server is starting...")
