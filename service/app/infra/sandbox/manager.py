"""
Sandbox lifecycle manager.

Manages session-scoped sandbox instances with Redis-backed mapping.
Handles lazy creation, caching, and cleanup.
"""

from __future__ import annotations

import logging
import uuid

import redis.asyncio as aioredis

from app.infra.sandbox.backends.base import ExecResult, FileInfo, PreviewUrl, SandboxBackend, SearchMatch

logger = logging.getLogger(__name__)

# Redis key format and TTL
_REDIS_KEY_PREFIX = "sandbox:session:"
_REDIS_TTL_SECONDS = 3600  # 1 hour


class SandboxManager:
    """
    Session-scoped sandbox manager.

    Lazily creates sandboxes on first tool call and caches the mapping
    in Redis. All operations delegate to the configured backend after
    ensuring a sandbox exists.
    """

    def __init__(self, backend: SandboxBackend, session_id: str, user_id: str | None = None) -> None:
        self._backend = backend
        self._session_id = session_id
        self._user_id = user_id
        self._sandbox_id: str | None = None

    @property
    def redis_key(self) -> str:
        return f"{_REDIS_KEY_PREFIX}{self._session_id}"

    async def get_sandbox_id(self) -> str | None:
        """Return existing sandbox ID without creating one."""
        if self._sandbox_id:
            return self._sandbox_id
        redis_client = await self._create_redis_client()
        try:
            return await redis_client.get(self.redis_key)
        finally:
            await redis_client.aclose()

    async def _create_redis_client(self) -> aioredis.Redis:
        """Create a dedicated Redis client for this manager.

        Uses a fresh connection instead of the global singleton to avoid
        event-loop cross-contamination in Celery workers.
        """
        from app.configs import configs

        return aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)

    async def ensure_sandbox(self) -> str:
        """
        Ensure a sandbox exists for this session.

        Checks Redis cache first, verifies liveness, creates if needed.
        Uses Redis SET NX for race condition protection.

        Returns:
            Backend sandbox ID
        """
        if self._sandbox_id:
            return self._sandbox_id

        redis_client = await self._create_redis_client()
        try:
            # Check Redis for existing mapping
            existing_id = await redis_client.get(self.redis_key)
            if existing_id:
                self._sandbox_id = existing_id
                logger.debug(f"Reusing sandbox {existing_id} for session {self._session_id}")
                return existing_id

            # Create new sandbox — use SET NX to prevent concurrent creation
            lock_key = f"{self.redis_key}:lock"
            lock_acquired = await redis_client.set(lock_key, "1", ex=60, nx=True)

            if not lock_acquired:
                # Another process is creating — wait and retry
                import asyncio

                for _ in range(10):
                    await asyncio.sleep(1)
                    existing_id = await redis_client.get(self.redis_key)
                    if existing_id:
                        self._sandbox_id = existing_id
                        return existing_id
                raise RuntimeError(f"Timed out waiting for sandbox creation for session {self._session_id}")

            try:
                # Check sandbox limit before creating
                if self._user_id:
                    try:
                        from app.core.limits import LimitsEnforcer
                        from app.infra.database import AsyncSessionLocal

                        async with AsyncSessionLocal() as db:
                            enforcer = await LimitsEnforcer.create(db, self._user_id)
                            await enforcer.check_sandbox_creation(db)
                    except ImportError:
                        logger.warning("LimitsEnforcer not available, skipping sandbox limit check")

                sandbox_name = f"xyzen-{self._session_id[:8]}-{uuid.uuid4().hex[:6]}"
                sandbox_id = await self._backend.create_sandbox(name=sandbox_name)

                # Store mapping in Redis with TTL
                await redis_client.set(self.redis_key, sandbox_id, ex=_REDIS_TTL_SECONDS)
                self._sandbox_id = sandbox_id
                logger.info(f"Created sandbox {sandbox_id} for session {self._session_id}")
                return sandbox_id
            finally:
                await redis_client.delete(lock_key)
        finally:
            await redis_client.aclose()

    async def cleanup(self) -> None:
        """Delete sandbox and remove Redis mapping."""
        redis_client = await self._create_redis_client()
        try:
            sandbox_id = await redis_client.get(self.redis_key)
            if sandbox_id:
                try:
                    await self._backend.delete_sandbox(sandbox_id)
                except Exception as e:
                    logger.warning(f"Failed to delete sandbox {sandbox_id}: {e}")
                await redis_client.delete(self.redis_key)
                self._sandbox_id = None
                logger.info(f"Cleaned up sandbox {sandbox_id} for session {self._session_id}")
        finally:
            await redis_client.aclose()

    # --- Delegated operations ---

    async def exec(self, command: str, cwd: str | None = None, timeout: int | None = None) -> ExecResult:
        sandbox_id = await self.ensure_sandbox()
        return await self._backend.exec(sandbox_id, command, cwd=cwd, timeout=timeout)

    async def read_file(self, path: str) -> str:
        sandbox_id = await self.ensure_sandbox()
        return await self._backend.read_file(sandbox_id, path)

    async def read_file_bytes(self, path: str) -> bytes:
        sandbox_id = await self.ensure_sandbox()
        return await self._backend.read_file_bytes(sandbox_id, path)

    async def write_file(self, path: str, content: str) -> None:
        sandbox_id = await self.ensure_sandbox()
        await self._backend.write_file(sandbox_id, path, content)

    async def list_files(self, path: str) -> list[FileInfo]:
        sandbox_id = await self.ensure_sandbox()
        return await self._backend.list_files(sandbox_id, path)

    async def find_files(self, root: str, pattern: str) -> list[str]:
        sandbox_id = await self.ensure_sandbox()
        return await self._backend.find_files(sandbox_id, root, pattern)

    async def search_in_files(
        self,
        root: str,
        pattern: str,
        include: str | None = None,
    ) -> list[SearchMatch]:
        sandbox_id = await self.ensure_sandbox()
        return await self._backend.search_in_files(sandbox_id, root, pattern, include=include)

    async def write_file_bytes(self, path: str, data: bytes) -> None:
        sandbox_id = await self.ensure_sandbox()
        await self._backend.write_file_bytes(sandbox_id, path, data)

    async def get_preview_url(self, port: int) -> PreviewUrl:
        sandbox_id = await self.ensure_sandbox()
        return await self._backend.get_preview_url(sandbox_id, port)


__all__ = ["SandboxManager"]
