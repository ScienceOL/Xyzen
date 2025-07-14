# Python官方库导入
from anyio.streams.memory import MemoryObjectSendStream
from pydantic import ValidationError
from typing_extensions import Union

# FastAPI导入
from fastapi import Request, Response

# MCP官网SDK导入
from mcp.server.sse import SseServerTransport
from mcp.shared.message import SessionMessage

class FastAPILabMCPSseServerTransport(SseServerTransport):
    async def handle_fastapi_post_message(self,request: Request) -> Response:
        #TODO 实现SSE传输
        pass
        return Response(status_code=200)
    
    async def _send_message_safely(
        self,
        writer: MemoryObjectSendStream[SessionMessage],
        message: Union[SessionMessage, ValidationError]
    ) -> None:
        pass #TODO 实现SSE传输

class FastAPILabMCPHttpServerTransport():
    # TODO 实现HTTP传输
    pass