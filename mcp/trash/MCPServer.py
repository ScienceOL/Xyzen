from mcp.server.lowlevel.server import Server
from typing import Dict, Any, List, Union, Callable, Awaitable, Iterable
import mcp.types as types
from fastapi_mcp.types import HTTPRequestInfo
from typing_extensions import Optional
import logging

logger = logging.getLogger(__name__)

class MCPServer(Server):
    """继承自MCP低级服务器的自定义服务器，支持HTTP请求信息传递"""
    
    def call_tool(self):
        """
        处理工具调用，支持HTTP请求信息传递
        """
        def decorator(
            func: Callable[
                ...,
                Awaitable[Iterable[types.TextContent | types.ImageContent | types.EmbeddedResource]],
            ],
        ):
            logger.debug("Registering handler for CallToolRequest")

            async def handler(req: types.CallToolRequest):
                try:
                    # 简化实现，不使用可能不存在的属性
                    results = await func(req.params.name, (req.params.arguments or {}))
                    return types.ServerResult(types.CallToolResult(content=list(results), isError=False))
                except Exception as e:
                    logger.exception(f"Error in tool call handler: {str(e)}")
                    return types.ServerResult(
                        types.CallToolResult(
                            content=[types.TextContent(type="text", text=str(e))],
                            isError=True,
                        )
                    )

            self.request_handlers[types.CallToolRequest] = handler
            return func

        return decorator