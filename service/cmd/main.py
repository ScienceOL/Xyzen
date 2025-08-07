from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastmcp.server.http import create_streamable_http_app
from starlette.routing import Mount
from starlette.types import Receive, Scope, Send

from handler import root_router
from handler.api.v1 import agents, mcps, sessions, topics
from handler.mcp import dify_mcp, lab_mcp, other_mcp
from internal import configs
from middleware.auth.casdoor import casdoor_mcp_auth
from middleware.database import create_db_and_tables
from middleware.logger import LOGGING_CONFIG


# TODO: 自动化 MCP Server 发现并自动挂载到 FastAPI 主路由
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create database tables
    await create_db_and_tables()

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

    dify_app = create_streamable_http_app(
        server=dify_mcp,
        streamable_http_path="/",
        debug=configs.Debug,
    )

    # 将 FastMCP 应用的生命周期管理器集成到 FastAPI 中
    async with (
        lab_app.router.lifespan_context(lab_app),
        other_app.router.lifespan_context(other_app),
        dify_app.router.lifespan_context(dify_app),
    ):
        # 将应用存储在 FastAPI 的状态中，以便在路由中使用
        app.state.lab_app = lab_app
        app.state.other_app = other_app
        app.state.dify_app = dify_app
        yield

    # Disconnect from the database, if needed (SQLModel manages sessions)
    pass


app = FastAPI(
    title="Xyzen FastAPI Service",
    description="Xyzen is AI-powered service with FastAPI and MCP",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


app.include_router(root_router)
app.include_router(mcps.router, prefix="/api/v1", tags=["mcps"])
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])
app.include_router(topics.router, prefix="/api/v1/topics", tags=["topics"])
app.include_router(agents.router, prefix="/api/v1/agents", tags=["agents"])


# Router Handlers
async def lab_handler(scope: Scope, receive: Receive, send: Send) -> None:
    await app.state.lab_app(scope, receive, send)


async def other_handler(scope: Scope, receive: Receive, send: Send) -> None:
    await app.state.other_app(scope, receive, send)


async def dify_handler(scope: Scope, receive: Receive, send: Send) -> None:
    await app.state.dify_app(scope, receive, send)


# Use Mount to register the MCP applications
app.router.routes.extend(
    [
        Mount("/mcp/lab", lab_handler),
        Mount("/mcp/other", other_handler),
        Mount("/mcp/dify", dify_handler),
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
