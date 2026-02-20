"""
Redis client infrastructure for distributed caching.

This module provides an async Redis client singleton that can be used
throughout the application for caching and pub/sub operations.
"""

import logging
from collections.abc import AsyncGenerator, Callable, Coroutine
from enum import Enum

import redis.asyncio as redis

from app.configs import configs

logger = logging.getLogger(__name__)


class CacheBackend(str, Enum):
    """Cache backend options."""

    LOCAL = "local"
    REDIS = "redis"


# Global Redis client instance
_redis_client: redis.Redis | None = None


async def get_redis_client() -> redis.Redis:
    """
    Get the global async Redis client instance.

    Creates a new connection on first call, reuses existing connection
    on subsequent calls.

    Returns:
        redis.Redis: Async Redis client instance
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            configs.Redis.REDIS_URL,
            decode_responses=True,
        )
        logger.info(f"Redis client initialized: {configs.Redis.HOST}:{configs.Redis.PORT}")
    return _redis_client


async def get_redis_dependency() -> AsyncGenerator[redis.Redis, None]:
    """
    FastAPI dependency for Redis client.

    Yields:
        redis.Redis: Async Redis client instance
    """
    client = await get_redis_client()
    yield client


async def close_redis_client() -> None:
    """Close the global Redis client connection."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis client connection closed")


async def health_check() -> bool:
    """
    Check Redis connectivity.

    Returns:
        bool: True if Redis is reachable, False otherwise
    """
    try:
        client = await get_redis_client()
        await client.ping()
        return True
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return False


async def run_once(key: str, coro_fn: Callable[[], Coroutine[None, None, None]], *, ttl: int = 300) -> bool:
    """Run an async function at most once across all replicas using a Redis lock.

    Acquires a Redis SET NX lock keyed by ``key``.  If the lock is obtained the
    coroutine is executed; otherwise it is skipped.  The lock auto-expires after
    ``ttl`` seconds so a crashed pod won't block future deployments.

    Args:
        key: Unique lock name (e.g. ``"startup:system_agents"``).
        coro_fn: An async callable (no arguments) to execute.
        ttl: Lock expiry in seconds (default 5 min).

    Returns:
        True if this pod executed the function, False if another pod already did.
    """
    client = await get_redis_client()
    acquired = await client.set(f"lock:{key}", "1", nx=True, ex=ttl)
    if not acquired:
        logger.info(f"Startup lock '{key}' held by another replica, skipping")
        return False

    logger.info(f"Startup lock '{key}' acquired, executing")
    await coro_fn()
    return True


__all__ = [
    "CacheBackend",
    "get_redis_client",
    "get_redis_dependency",
    "close_redis_client",
    "health_check",
    "run_once",
]
