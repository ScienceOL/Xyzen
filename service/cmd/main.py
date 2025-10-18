from collections.abc import AsyncGenerator
from contextlib import AsyncExitStack, asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastmcp.server.http import create_streamable_http_app

from handler import root_router
from handler.mcp import setup_mcp_routes
from internal import configs

# from middleware.auth.casdoor import casdoor_mcp_auth
from middleware.database import create_db_and_tables
from middleware.logger import LOGGING_CONFIG


# TODO: 自动化 MCP Server 发现并自动挂载到 FastAPI 主路由
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create database tables
    await create_db_and_tables()

    # Initialize system provider from environment config
    from core.providers import initialize_system_provider
    from middleware.database.connection import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            await initialize_system_provider(db)
        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"Failed to initialize system provider: {e}")

    # Initialize LLM providers
    from core.providers import initialize_providers

    await initialize_providers()

    # 自动创建和管理所有 MCP 服务器
    from handler.mcp import registry

    mcp_apps = {}
    lifespan_contexts = []

    try:
        # 为每个注册的 MCP 服务器创建应用
        for server_name, server_config in registry.get_all_servers().items():
            try:
                mcp_app = create_streamable_http_app(
                    server=server_config["server"],
                    streamable_http_path="/",
                    debug=configs.Debug,
                    auth=server_config.get("auth"),
                )
                mcp_apps[server_name] = mcp_app
                lifespan_contexts.append(mcp_app.router.lifespan_context(mcp_app))

                # 存储到 FastAPI 状态中
                setattr(app.state, f"{server_name}_app", mcp_app)

            except Exception as e:
                import logging

                from middleware.logger import LOGGING_CONFIG

                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to create MCP app for {server_name}: {e}")

        # 启动所有 MCP 应用的生命周期
        async with AsyncExitStack() as stack:
            for context in lifespan_contexts:
                await stack.enter_async_context(context)

            yield

    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.error(f"Error in MCP lifespan management: {e}")
        yield  # 确保服务能够启动

    # Disconnect from the database, if needed (SQLModel manages sessions)
    pass


app = FastAPI(
    title="Xyzen FastAPI Service",
    description="Xyzen is AI-powered service with FastAPI and MCP",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/xyzen/api/docs",
    redoc_url="/xyzen/api/redoc",
    openapi_url="/xyzen/api/openapi.json",
    # 🔥 修复：禁用 FastAPI 默认的尾部斜杠重定向
    redirect_slashes=False,
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

# 自动注册所有 MCP 路由
mcp_routes = setup_mcp_routes(app.state)
app.router.routes.extend(mcp_routes)


if __name__ == "__main__":
    uvicorn.run(
        "cmd.main:app",
        host=configs.Host,
        port=configs.Port,
        log_config=LOGGING_CONFIG,
        # log_level=configs.Logger.Level,  # log_level will cover LOGGING_CONFIG settings
        reload=configs.Debug,
    )
