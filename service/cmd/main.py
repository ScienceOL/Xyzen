from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastmcp.server.http import create_streamable_http_app
from starlette.routing import Mount
from starlette.types import Receive, Scope, Send

from handler.api import api_router
from handler.mcp import lab_mcp, other_mcp
from internal import configs
from middleware.auth.casdoor import casdoor_mcp_auth
from middleware.logger import LOGGING_CONFIG


# TODO: 自动化 MCP Server 发现并自动挂载到 FastAPI 主路由
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Laboratory MCP Application
    lab_app = create_streamable_http_app(
        server=lab_mcp,  # FastMCP Instance, don't need to pass auth
        streamable_http_path="/",  # Relative path for the MCP server
        debug=configs.Debug,
        auth=casdoor_mcp_auth,
    )

    other_app = create_streamable_http_app(
        server=other_mcp,
        streamable_http_path="/",
        debug=configs.Debug,
    )

    # 将 FastMCP 应用的生命周期管理器集成到 FastAPI 中
    async with lab_app.router.lifespan_context(lab_app), other_app.router.lifespan_context(other_app):
        # 将应用存储在 FastAPI 的状态中，以便在路由中使用
        app.state.lab_app = lab_app
        app.state.other_app = other_app
        yield


app = FastAPI(
    title="Xyzen FastAPI Service",
    description="Xyzen is AI-powered service with FastAPI and MCP",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(
    api_router,
)


# Router Handlers
async def lab_handler(scope: Scope, receive: Receive, send: Send) -> None:
    await app.state.lab_app(scope, receive, send)


async def other_handler(scope: Scope, receive: Receive, send: Send) -> None:
    await app.state.other_app(scope, receive, send)


# Use Mount to register the MCP applications
app.router.routes.extend(
    [
        Mount("/mcp/lab", lab_handler),
        Mount("/mcp/other", other_handler),
    ]
)


if __name__ == "__main__":
    uvicorn.run(
        "cmd.main:app",
        host=configs.Host,
        port=configs.Port,
        log_config=LOGGING_CONFIG,
        log_level=configs.Logger.Level,
        reload=configs.Debug,
    )
