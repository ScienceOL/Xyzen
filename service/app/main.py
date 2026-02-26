import logging
import warnings
from collections.abc import AsyncGenerator
from contextlib import AbstractAsyncContextManager, AsyncExitStack, asynccontextmanager
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

# Suppress websockets legacy deprecation triggered by uvicorn internals
warnings.filterwarnings("ignore", message="remove second argument of ws_handler", category=DeprecationWarning)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create database tables
    await create_db_and_tables()

    logger.info(f"Deployment region: {configs.Region}")

    # Log Enterprise Edition status
    from app.ee import edition, is_ee

    logger.info(f"Edition: {edition().upper()}")
    if is_ee():
        logger.info(f"EE API: {configs.EE.ApiUrl}")

    # Initialize cross-thread memory store
    from app.core.memory import initialize_memory_service

    await initialize_memory_service()

    # Initialize system provider from environment config
    from app.core.providers import initialize_providers_on_startup
    from app.infra.redis import run_once

    await run_once("startup:providers", initialize_providers_on_startup)

    # Register builtin tools (web_search, knowledge_*, etc.)
    from app.tools.registry import register_builtin_tools

    register_builtin_tools()

    # Initialize system agents (Chat agent)
    # Bootstrap Novu notification (auto-create admin, fetch API keys)
    from app.core.notification.bootstrap import ensure_novu_setup
    from app.core.system_agent import SystemAgentManager
    from app.infra.database import AsyncSessionLocal

    try:
        await ensure_novu_setup()
    except Exception as e:
        logger.warning(f"Novu bootstrap skipped: {e}")

    async def _ensure_system_agents() -> None:
        async with AsyncSessionLocal() as db:
            try:
                system_manager = SystemAgentManager(db)
                system_agents = await system_manager.ensure_system_agents()
                await db.commit()

                agent_names = [agent.name for agent in system_agents.values()]
                logger.info(f"System agents initialized: {', '.join(agent_names)}")

            except Exception as e:
                logger.error(f"Failed to initialize system agents: {e}")
                await db.rollback()

    await run_once("startup:system_agents", _ensure_system_agents)

    # Publish builtin agents to marketplace
    from app.core.marketplace import BuiltinMarketplacePublisher

    async def _ensure_builtin_listings() -> None:
        async with AsyncSessionLocal() as db:
            try:
                publisher = BuiltinMarketplacePublisher(db)
                listings = await publisher.ensure_builtin_listings()
                await db.commit()
                logger.info(f"Builtin marketplace listings ensured: {list(listings.keys())}")
            except Exception as e:
                logger.error(f"Failed to publish builtin agents to marketplace: {e}")
                await db.rollback()

    await run_once("startup:builtin_listings", _ensure_builtin_listings)

    # Publish builtin skills to skill marketplace
    from app.core.skill_marketplace import BuiltinSkillPublisher

    async def _ensure_builtin_skill_listings() -> None:
        async with AsyncSessionLocal() as db:
            try:
                publisher = BuiltinSkillPublisher(db)
                listings = await publisher.ensure_builtin_skill_listings()
                await db.commit()
                logger.info(f"Builtin skill marketplace listings ensured: {list(listings.keys())}")
            except Exception as e:
                logger.error(f"Failed to publish builtin skills to marketplace: {e}")
                await db.rollback()

    await run_once("startup:builtin_skill_listings", _ensure_builtin_skill_listings)

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
                logger.warning(f"Failed to create MCP app for {server_name}: {e}")

        # 启动所有 MCP 应用的生命周期
        async with AsyncExitStack() as stack:
            for context in lifespan_contexts:
                await stack.enter_async_context(context)

            yield

    except Exception as e:
        logger.error(f"Error in MCP lifespan management: {e}")
        yield  # 确保服务能够启动

    # Disconnect from the database, if needed (SQLModel manages sessions)
    from app.core.memory import shutdown_memory_service

    await shutdown_memory_service()

    # Graceful shutdown: close global Redis client and DB engines
    from app.infra.redis import close_redis_client

    await close_redis_client()

    from app.infra.database.connection import async_engine

    await async_engine.dispose()


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
    # WARNING 3.13 not allow absolute path in glob()
    # BASE_DIR = Path(__file__).resolve().parent.parent

    # MIGRATIONS_DIR = BASE_DIR / ”migrations”
    # TESTS_DIR = BASE_DIR / “tests”

    uvicorn.run(
        "app.main:app",
        host=configs.Host,
        port=configs.Port,
        log_config=LOGGING_CONFIG,
        reload=configs.Debug,
        reload_excludes=["migrations", "tests"],
    )
