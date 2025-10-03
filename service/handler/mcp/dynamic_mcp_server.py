"""
Dynamic MCP Server - Dynamic tools folder monitoring MCP server

This server will:
- Monitor Python files in the tools folder
- Dynamically import and register non-underscore-prefixed functions as tools
- Detect tool changes and record differences
- Provide SSE interface listening on 0.0.0.0:3001
- Smart caching: Only reload the currently called tool during tool calls (not global reload)
"""

import subprocess
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.server.middleware.error_handling import ErrorHandlingMiddleware
from fastmcp.server.middleware.logging import StructuredLoggingMiddleware
from fastmcp.server.middleware.timing import DetailedTimingMiddleware
from mcp_claude_code.server import ClaudeCodeServer  # type: ignore

from middleware.dynamic_mcp_server import DynamicToolMiddleware
from utils.built_in_tools import register_built_in_tools
from utils.json_patch import apply_json_patch
from utils.logger_config import console, dynamic_logger
from utils.tool_loader import tool_loader

apply_json_patch()
logger = dynamic_logger.get_logger("dynamic-mcp-server")


mcp = FastMCP("DynamicToolsServer", version="1.0.0")
mcp.add_middleware(ErrorHandlingMiddleware(include_traceback=True))
mcp.add_middleware(DynamicToolMiddleware(mcp))
mcp.add_middleware(DetailedTimingMiddleware())
mcp.add_middleware(StructuredLoggingMiddleware(include_payloads=True))

register_built_in_tools(mcp)

# Start the dynamic MCP server
dynamic_logger.print_section(
    "Dynamic MCP Server - Dynamic Tool Server",
    ["v1.0.0 | 0.0.0.0:3001 | SSE Protocol"],
)
console.print()
dynamic_logger.print_section(
    "Server Configuration",
    [
        f"Server Name: [bold cyan]{'DynamicToolsServer'}[/bold cyan]",
        f"Version: [bold green]{'1.0.0'}[/bold green]",
        f"Listen Address: [bold yellow]{'0.0.0.0'}:{3001}[/bold yellow]",
        "Transport Protocol: [bold magenta]SSE[/bold magenta]",
        f"Tools Directory: [bold blue]{Path('tools').absolute()}[/bold blue]",
    ],
    "cyan",
)
console.print()

# Mirror Remote MCP Server Tools
# proxy = FastMCP.as_proxy("http://127.0.0.1:8931/mcp/")
subprocess.Popen(
    ["npx", "@playwright/mcp@latest", "--port", "8931"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
)
# This proxy will reuse the connected session for all requests
# TODO: Need asycn support
# connected_client = Client("http://localhost:8931/mcp/")
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
dynamic_logger.info("Loading local tools...")
if hasattr(tool_loader, "scan_and_load_tools"):
    tools = tool_loader.scan_and_load_tools()

tool_loader.register_tools_to_mcp(mcp, tools)
dynamic_logger.success(f"Loaded {len(tools)} local tools")

dynamic_logger.print_status("Startup", "Server is starting...", True)
console.print()

# Load Code Tools
ClaudeCodeServer(
    mcp_instance=mcp,
    allowed_paths=[str(Path.cwd())],
    enable_agent_tool=False,
    command_timeout=300,
)
mcp.remove_tool("multi_edit")
mcp.remove_tool("notebook_read")
mcp.remove_tool("notebook_edit")
mcp.remove_tool("batch")
mcp.remove_tool("todo_write")
mcp.remove_tool("todo_read")
