"""
Memory Service - Manages LangGraph's AsyncPostgresStore for cross-thread memory.

Provides a singleton MemoryService that wraps AsyncPostgresStore,
handling lifecycle (init/shutdown) and exposing the store for agent use.

The store manages its own tables (store, store_migrations) via raw SQL,
independent of Alembic migrations.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from langgraph.store.base import BaseStore

from app.configs import configs

if TYPE_CHECKING:
    from langgraph.store.postgres.base import PostgresIndexConfig

logger = logging.getLogger(__name__)

# Module-level singleton
_memory_service: MemoryService | None = None


class MemoryService:
    """Wraps AsyncPostgresStore lifecycle and access."""

    _store: BaseStore | None
    _context_manager: Any  # The async generator from from_conn_string

    def __init__(self) -> None:
        self._store = None
        self._context_manager = None

    @property
    def store(self) -> BaseStore | None:
        """Return the initialized store, or None if disabled/not initialized."""
        return self._store

    @property
    def enabled(self) -> bool:
        return configs.Memory.Enabled

    def is_store_loop_alive(self) -> bool:
        """Check if the store's internal event loop is still open.

        AsyncBatchedBaseStore captures asyncio.get_running_loop() at init time.
        In Celery workers, subsequent tasks may run on a new event loop, leaving
        the store's _loop reference stale (closed). This detects that case.
        """
        if self._store is None:
            return False
        loop = getattr(self._store, "_loop", None)
        if loop is None:
            return True  # Can't check, assume ok
        return not loop.is_closed()

    async def initialize(self) -> None:
        """Initialize the store. Creates tables idempotently."""
        if not self.enabled:
            logger.info("Memory service disabled via config")
            return

        try:
            from langgraph.store.postgres import AsyncPostgresStore

            conn_string = _build_connection_string()
            index_config = _build_index_config()

            # from_conn_string is an async context manager
            cm = AsyncPostgresStore.from_conn_string(conn_string, index=index_config)
            store = await cm.__aenter__()
            self._context_manager = cm

            # Create tables if they don't exist (also creates pgvector extension + store_vectors when indexed)
            await store.setup()
            self._store = store

            logger.info(
                "Memory service initialized (store=enabled, index=%s, loop=%s)",
                "vector" if index_config else "none",
                id(asyncio.get_running_loop()),
            )
        except Exception:
            logger.exception("Failed to initialize memory service")
            self._store = None
            self._context_manager = None

    async def shutdown(self) -> None:
        """Shutdown the store and release connections."""
        if self._context_manager is not None:
            try:
                await self._context_manager.__aexit__(None, None, None)
                logger.info("Memory service shut down")
            except Exception:
                logger.exception("Error shutting down memory service")
            finally:
                self._store = None
                self._context_manager = None


def _build_connection_string() -> str:
    """Build a plain postgresql:// connection string from config."""
    pg = configs.Database.Postgres
    return f"postgresql://{pg.User}:{pg.Password}@{pg.Host}:{pg.Port}/{pg.DBName}"


def _build_index_config() -> PostgresIndexConfig | None:
    """Build the vector index config for AsyncPostgresStore, or None to skip."""
    from langgraph.store.postgres.base import PostgresIndexConfig

    from app.core.memory.embeddings import create_embeddings

    embedding_config = configs.Memory.Embedding
    embeddings = create_embeddings(embedding_config)
    if embeddings is None:
        return None
    return PostgresIndexConfig(dims=embedding_config.Dims, embed=embeddings, fields=["$"])


def get_memory_service() -> MemoryService | None:
    """Get the singleton MemoryService if initialized."""
    return _memory_service


async def initialize_memory_service() -> MemoryService:
    """Initialize the global MemoryService singleton."""
    global _memory_service
    _memory_service = MemoryService()
    await _memory_service.initialize()
    return _memory_service


async def get_or_initialize_memory_service() -> MemoryService:
    """Get existing MemoryService or initialize if not yet created (for Celery workers).

    Also detects stale event loops: AsyncBatchedBaseStore captures the event loop
    at init time. In Celery ForkPoolWorkers, each task may run on a new loop,
    so we must re-create the store when the old loop is closed.
    """
    global _memory_service
    if _memory_service is not None:
        if _memory_service.is_store_loop_alive():
            return _memory_service
        # Store's event loop is closed — discard and re-initialize
        logger.info("Memory store event loop is closed, re-initializing for new loop")
        _memory_service = None
    return await initialize_memory_service()


async def shutdown_memory_service() -> None:
    """Shutdown the global MemoryService singleton."""
    global _memory_service
    if _memory_service is not None:
        await _memory_service.shutdown()
        _memory_service = None
