import asyncio
import logging
from datetime import datetime
from typing import Callable, List, Optional

from fastmcp import Client, FastMCP
from fastmcp.server.middleware import Middleware, MiddlewareContext
from fastmcp.tools.tool import ToolResult

from internal import configs
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
        """Refresh current tool when calling tool"""
        tool_name = context.message.name
        start_time = datetime.now()

        if "-" in tool_name:
            logger.info(f"Refreshing specific tool before calling: {tool_name}")
            # Only reload the currently called tool
            if hasattr(tool_loader, "scan_and_load_tools") and asyncio.iscoroutinefunction(
                tool_loader.scan_and_load_tools
            ):
                reloaded_tools = await tool_loader.scan_and_load_tools(tool_name)
            else:
                reloaded_tools = tool_loader.scan_and_load_tools(tool_name)
            if reloaded_tools:
                # Re-register the tool to MCP
                tool_loader.register_tools_to_mcp(self.mcp, reloaded_tools, tool_name)
            else:
                logger.warning(f"No tools were reloaded for {tool_name}")

        # Execute tool
        logger.warning(f"🚀 Execute: {tool_name} Arguments: {getattr(context.message, 'arguments', {})}")
        if tool_name.startswith("browser_"):
            await self.init_client()
            assert self.browser_mcp_client is not None
            result = await self.browser_mcp_client.call_tool(tool_name, getattr(context.message, "arguments", {}))
            result = ToolResult(result.content, result.structured_content)  # type: ignore
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
        """Refresh tools directory when listing tools"""
        logger.info("Refreshing all tools before listing tools")
        # Re-scan and load tools
        if hasattr(tool_loader, "scan_and_load_tools") and asyncio.iscoroutinefunction(
            tool_loader.scan_and_load_tools
        ):
            tools = await tool_loader.scan_and_load_tools()
        else:
            tools = tool_loader.scan_and_load_tools()
        tool_loader.register_tools_to_mcp(self.mcp, tools)
        # Continue executing list tools
        return await call_next(context)  # type: ignore
