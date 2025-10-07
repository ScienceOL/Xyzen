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
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.server.middleware.error_handling import ErrorHandlingMiddleware
from fastmcp.server.middleware.logging import StructuredLoggingMiddleware
from fastmcp.server.middleware.timing import DetailedTimingMiddleware

# from mcp_claude_code.server import ClaudeCodeServer  # type: ignore
from internal import configs
from middleware.dynamic_mcp_server import DynamicToolMiddleware
from utils.built_in_tools import register_built_in_tools
from utils.json_patch import apply_json_patch
from utils.tool_loader import tool_loader
from utils.tool_management import register_tool_management_tools

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
register_tool_management_tools(mcp)


# Mirror Remote MCP Server Tools
# proxy = FastMCP.as_proxy("http://127.0.0.1:8931/mcp/")
subprocess.Popen(
    ["npx", "@playwright/mcp@latest", "--port", str(PLAYWRIGHT_PORT)],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
)
# This proxy will reuse the connected session for all requests
# TODO: Need asycn support
# connected_client = Client(f"http://{HOST}:{PLAYWRIGHT_PORT}/mcp/")
# proxy = FastMCP.as_proxy(connected_client)
# remote_tools = await proxy.get_tools()
# tool_info: ProxyTool
# for tool_name, tool_info in remote_tools.items():  # type: ignore
#     if tool_name in [
#         "browser_resize",
#         "browser_install",
#         "browser_take_screenshot",
#     ]:
#         continue
#     try:
#         # Create local copy
#         local_tool = tool_info.copy()
#         # Add to local server
#         mcp.add_tool(local_tool)
#         logger.info(f"Mirrored tool from remote server: {tool_info.name}")
#     except Exception as e:
#         logger.error(f"Failed to mirror tool {tool_info.name}: {e}")
# connected_client.close()

# Load Local Tools
logger.info("Loading local tools...")
if hasattr(tool_loader, "scan_and_load_tools"):
    tools = tool_loader.scan_and_load_tools()

tool_loader.register_tools_to_mcp(mcp, tools)
logger.info(f"Loaded {len(tools)} local tools")

logger.info("Server is starting...")

# Load Code Tools
# ClaudeCodeServer(
#     mcp_instance=mcp,
#     allowed_paths=[str(Path.cwd())],
#     enable_agent_tool=False,
#     command_timeout=300,
# )
mcp.remove_tool("multi_edit")
mcp.remove_tool("notebook_read")
mcp.remove_tool("notebook_edit")
mcp.remove_tool("batch")
mcp.remove_tool("todo_write")
mcp.remove_tool("todo_read")
