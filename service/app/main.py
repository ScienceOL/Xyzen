from collections.abc import AsyncGenerator
from contextlib import AbstractAsyncContextManager, AsyncExitStack, asynccontextmanager
from pathlib import Path
from typing import Any, Mapping

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastmcp.server.http import create_streamable_http_app

from app.api import root_router
from app.configs import configs
from app.core.logger import LOGGING_CONFIG

# from app.middleware.auth.casdoor import casdoor_mcp_auth
from app.infra.database import create_db_and_tables
from app.mcp import setup_mcp_routes


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create database tables
    await create_db_and_tables()

    # Initialize system provider from environment config
    from app.core.providers import initialize_providers_on_startup

    await initialize_providers_on_startup()

    # Initialize system agents (Chat agent)
    from app.core.system_agent import SystemAgentManager
    from app.infra.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            system_manager = SystemAgentManager(db)
            system_agents = await system_manager.ensure_system_agents()
            await db.commit()

            agent_names = [agent.name for agent in system_agents.values()]
            import logging

            logger = logging.getLogger(__name__)
            logger.info(f"System agents initialized: {', '.join(agent_names)}")

        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"Failed to initialize system agents: {e}")
            await db.rollback()
            # Don't fail startup if system agents can't be created
            pass

    # Seed builtin graph agents to database
    from app.agents import registry as builtin_agent_registry

    async with AsyncSessionLocal() as db:
        try:
            stats = await builtin_agent_registry.seed_to_database(db)
            await db.commit()

            import logging

            logger = logging.getLogger(__name__)
            logger.info(
                f"Builtin graph agents seeded: {stats['created']} created, "
                f"{stats['updated']} updated, {stats['failed']} failed"
            )

        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"Failed to seed builtin graph agents: {e}")
            await db.rollback()
            # Don't fail startup if builtin agents can't be seeded
            pass

    # 自动创建和管理所有 MCP 服务器
    from app.mcp import registry

    mcp_apps = {}
    lifespan_contexts: list[
        AbstractAsyncContextManager[Mapping[str, Any], bool | None] | AbstractAsyncContextManager[None, bool | None]
    ] = []

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
    BASE_DIR = Path(__file__).resolve().parent.parent

    MIGRATIONS_DIR = BASE_DIR / "migrations"
    TESTS_DIR = BASE_DIR / "tests"

    uvicorn.run(
        "app.main:app",
        host=configs.Host,
        port=configs.Port,
        log_config=LOGGING_CONFIG,
        reload=configs.Debug,
        reload_excludes=[str(MIGRATIONS_DIR), str(TESTS_DIR)],
    )
