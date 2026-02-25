"""Terminal session manager using Redis for session persistence.

Manages terminal session lifecycle across browser disconnects/reconnects.
Sessions survive browser WS drops for a configurable TTL (default 5 minutes),
during which output is buffered in Redis and replayed on reattach.
"""

from __future__ import annotations

import json
import logging
import time

import redis.asyncio as aioredis

from app.configs import configs

logger = logging.getLogger(__name__)

# Redis key prefixes
SESSION_KEY_PREFIX = "terminal:session:"
BUFFER_KEY_PREFIX = "terminal:buffer:"

# Defaults
SESSION_TTL = 300  # 5 minutes
BUFFER_MAX_BYTES = 100 * 1024  # 100KB cap on buffered output
BUFFER_MAX_ITEMS = 2000  # Max number of buffered messages


class TerminalSessionManager:
    """Redis-backed terminal session lifecycle manager."""

    def __init__(self, redis_url: str | None = None) -> None:
        self._redis_url = redis_url or configs.Redis.REDIS_URL

    def _get_session_key(self, session_id: str) -> str:
        return f"{SESSION_KEY_PREFIX}{session_id}"

    def _get_buffer_key(self, session_id: str) -> str:
        return f"{BUFFER_KEY_PREFIX}{session_id}"

    async def _redis(self) -> aioredis.Redis:
        return aioredis.from_url(self._redis_url, decode_responses=True)

    async def create_session(self, session_id: str, user_id: str) -> None:
        """Register a new terminal session in Redis."""
        r = await self._redis()
        try:
            data = json.dumps(
                {
                    "user_id": user_id,
                    "state": "attached",
                    "created_at": time.time(),
                }
            )
            await r.setex(self._get_session_key(session_id), SESSION_TTL, data)
        finally:
            await r.aclose()

    async def get_session(self, session_id: str) -> dict | None:
        """Get session metadata. Returns None if session expired or not found."""
        r = await self._redis()
        try:
            data = await r.get(self._get_session_key(session_id))
            if data is None:
                return None
            return json.loads(data)
        finally:
            await r.aclose()

    async def set_detached(self, session_id: str) -> None:
        """Mark session as detached (browser disconnected). Starts TTL countdown."""
        r = await self._redis()
        try:
            session_key = self._get_session_key(session_id)
            data = await r.get(session_key)
            if data is None:
                return
            session = json.loads(data)
            session["state"] = "detached"
            session["detached_at"] = time.time()
            await r.setex(session_key, SESSION_TTL, json.dumps(session))
            # Also set TTL on buffer
            buffer_key = self._get_buffer_key(session_id)
            await r.expire(buffer_key, SESSION_TTL)
            logger.info(f"Terminal session {session_id} detached, TTL={SESSION_TTL}s")
        finally:
            await r.aclose()

    async def set_attached(self, session_id: str) -> None:
        """Mark session as attached (browser reconnected). Resets TTL."""
        r = await self._redis()
        try:
            session_key = self._get_session_key(session_id)
            data = await r.get(session_key)
            if data is None:
                return
            session = json.loads(data)
            session["state"] = "attached"
            session.pop("detached_at", None)
            await r.setex(session_key, SESSION_TTL, json.dumps(session))
            logger.info(f"Terminal session {session_id} reattached")
        finally:
            await r.aclose()

    async def refresh_ttl(self, session_id: str) -> None:
        """Refresh TTL on an attached session (call periodically)."""
        r = await self._redis()
        try:
            session_key = self._get_session_key(session_id)
            await r.expire(session_key, SESSION_TTL)
        finally:
            await r.aclose()

    async def buffer_output(self, session_id: str, data: str) -> None:
        """Buffer output message for a detached session. Caps at BUFFER_MAX_ITEMS."""
        r = await self._redis()
        try:
            buffer_key = self._get_buffer_key(session_id)
            await r.rpush(buffer_key, data)  # type: ignore[misc]
            await r.ltrim(buffer_key, -BUFFER_MAX_ITEMS, -1)  # type: ignore[misc]
            await r.expire(buffer_key, SESSION_TTL)
        finally:
            await r.aclose()

    async def flush_buffer(self, session_id: str) -> list[str]:
        """Get and clear all buffered output for a session."""
        r = await self._redis()
        try:
            buffer_key = self._get_buffer_key(session_id)
            # Get all, then delete
            items: list[str] = await r.lrange(buffer_key, 0, -1)  # type: ignore[misc]
            if items:
                await r.delete(buffer_key)
            return items
        finally:
            await r.aclose()

    async def delete_session(self, session_id: str) -> None:
        """Remove session and buffer from Redis."""
        r = await self._redis()
        try:
            await r.delete(
                self._get_session_key(session_id),
                self._get_buffer_key(session_id),
            )
            logger.info(f"Terminal session {session_id} deleted")
        finally:
            await r.aclose()

    async def is_session_alive(self, session_id: str) -> bool:
        """Check if a session still exists in Redis (not expired)."""
        r = await self._redis()
        try:
            return bool(await r.exists(self._get_session_key(session_id)))
        finally:
            await r.aclose()


# Singleton instance
session_manager = TerminalSessionManager()
