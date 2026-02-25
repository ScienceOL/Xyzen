"""
Sandbox lifecycle manager.

Manages session-scoped sandbox instances with Redis-backed mapping.
Handles lazy creation, caching, and cleanup.

Redis storage format (hash):
    sandbox:session:{session_id} → {
        sandbox_id: str,
        created_at: ISO-8601 timestamp,
        backend: provider name,
    }
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis

from app.infra.sandbox.backends.base import (
    ExecResult,
    FileInfo,
    PreviewUrl,
    SandboxBackend,
    SandboxState,
    SandboxStatus,
    SearchMatch,
)

logger = logging.getLogger(__name__)

# Redis key format and TTL
REDIS_KEY_PREFIX = "sandbox:session:"

# Hash fields
_F_SANDBOX_ID = "sandbox_id"
_F_CREATED_AT = "created_at"
_F_BACKEND = "backend"
_F_LAST_KEEP_ALIVE = "last_keep_alive"

# Debounce window for backend keep-alive calls (seconds)
_KEEP_ALIVE_DEBOUNCE_SECONDS = 300  # 5 minutes

# Extra buffer added to Redis TTL beyond the sandbox's own delete timer
_REDIS_TTL_BUFFER_SECONDS = 3600  # 1 hour


def _compute_redis_ttl() -> int:
    """Redis TTL must outlive the sandbox on the backend.

    The key must stay in Redis as long as the sandbox could still exist
    on the provider side so we can map ``session_id → sandbox_id``.

    * **Daytona**: auto_stop + auto_delete + 1 h buffer
    * **E2B (auto_pause)**: timeout + pause_duration_days + 1 h buffer
    * **E2B (no auto_pause)**: timeout + 1 h buffer

    Falls back to 7 days if config is unavailable.
    """
    try:
        from app.configs import configs

        sc = configs.Sandbox
        backend = sc.Backend.lower()

        if backend == "e2b":
            timeout_s = sc.E2B.TimeoutSeconds
            if sc.E2B.AutoPause:
                pause_s = sc.E2B.PauseDurationDays * 86400
                return timeout_s + pause_s + _REDIS_TTL_BUFFER_SECONDS
            return timeout_s + _REDIS_TTL_BUFFER_SECONDS

        # Daytona (default)
        auto_stop_s = sc.Daytona.AutoStopMinutes * 60
        auto_delete_minutes = sc.Daytona.AutoDeleteMinutes
        auto_delete_s = auto_delete_minutes * 60 if auto_delete_minutes > 0 else 86400
        return auto_stop_s + auto_delete_s + _REDIS_TTL_BUFFER_SECONDS
    except Exception:
        return 604800  # 7 days


@dataclass(frozen=True)
class SandboxInfo:
    """Metadata about an active sandbox stored in Redis."""

    sandbox_id: str
    session_id: str
    created_at: datetime
    backend: str


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

    # --- Properties ---

    @property
    def backend(self) -> SandboxBackend:
        """Expose the backend (read-only) for layers that need it."""
        return self._backend

    @property
    def session_id(self) -> str:
        return self._session_id

    @property
    def redis_key(self) -> str:
        return f"{REDIS_KEY_PREFIX}{self._session_id}"

    # --- Sandbox ID resolution ---

    async def get_sandbox_id(self) -> str | None:
        """Return existing sandbox ID without creating one."""
        if self._sandbox_id:
            return self._sandbox_id
        redis_client = await self._create_redis_client()
        try:
            return await _read_sandbox_id(redis_client, self.redis_key)
        finally:
            await redis_client.aclose()

    async def get_sandbox_info(self) -> SandboxInfo | None:
        """Return full sandbox metadata without creating one."""
        redis_client = await self._create_redis_client()
        try:
            return await _read_sandbox_info(redis_client, self.redis_key, self._session_id)
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

        Checks Redis cache first, verifies backend liveness, creates if needed.
        Uses Redis SET NX for race condition protection.

        Returns:
            Backend sandbox ID
        """
        if self._sandbox_id:
            return self._sandbox_id

        redis_client = await self._create_redis_client()
        try:
            # Check Redis for existing mapping
            existing_id = await _read_sandbox_id(redis_client, self.redis_key)
            if existing_id:
                # Verify the sandbox is actually alive on the backend
                if await self._verify_or_recover(redis_client, existing_id):
                    self._sandbox_id = existing_id
                    await self._touch_redis_ttl(redis_client)
                    logger.debug(f"Reusing sandbox {existing_id} for session {self._session_id}")
                    return existing_id
                # Recovery failed — fall through to create a new one
                logger.warning(f"Sandbox {existing_id} is dead, recreating for session {self._session_id}")
                await redis_client.delete(self.redis_key)

            # Create new sandbox — use SET NX to prevent concurrent creation
            lock_key = f"{self.redis_key}:lock"
            lock_acquired = await redis_client.set(lock_key, "1", ex=60, nx=True)

            if not lock_acquired:
                # Another process is creating — wait and retry
                import asyncio

                for _ in range(10):
                    await asyncio.sleep(1)
                    existing_id = await _read_sandbox_id(redis_client, self.redis_key)
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

                # Resolve per-user sandbox configuration
                from app.infra.sandbox.config_resolver import SandboxConfigResolver

                resolved_config = await SandboxConfigResolver.resolve_for_user(self._user_id)
                sandbox_id = await self._backend.create_sandbox(name=sandbox_name, config=resolved_config)

                # Store mapping as hash with metadata
                from app.configs import configs

                now = datetime.now(timezone.utc).isoformat()
                await redis_client.hset(  # type: ignore[misc]
                    self.redis_key,
                    mapping={
                        _F_SANDBOX_ID: sandbox_id,
                        _F_CREATED_AT: now,
                        _F_BACKEND: configs.Sandbox.Backend,
                    },
                )
                await redis_client.expire(self.redis_key, _compute_redis_ttl())

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
            sandbox_id = await _read_sandbox_id(redis_client, self.redis_key)
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

    # --- Lifecycle helpers (internal) ---

    async def _touch_redis_ttl(self, redis_client: aioredis.Redis | None = None) -> None:
        """Refresh the Redis key TTL. Cheap — safe to call on every operation."""
        own_client = redis_client is None
        if own_client:
            redis_client = await self._create_redis_client()
        assert redis_client is not None
        try:
            await redis_client.expire(self.redis_key, _compute_redis_ttl())
        finally:
            if own_client:
                await redis_client.aclose()

    async def _maybe_keep_alive_backend(self, redis_client: aioredis.Redis | None = None) -> None:
        """Debounced backend keep-alive. Only calls backend if >5 min since last call."""
        own_client = redis_client is None
        if own_client:
            redis_client = await self._create_redis_client()
        assert redis_client is not None
        try:
            last_ts: str | None = await redis_client.hget(self.redis_key, _F_LAST_KEEP_ALIVE)  # type: ignore[assignment]
            now = time.time()
            if last_ts:
                try:
                    if now - float(last_ts) < _KEEP_ALIVE_DEBOUNCE_SECONDS:
                        return
                except (ValueError, TypeError):
                    pass
            sandbox_id = await _read_sandbox_id(redis_client, self.redis_key)
            if not sandbox_id:
                return
            try:
                await self._backend.keep_alive(sandbox_id)
                await redis_client.hset(self.redis_key, _F_LAST_KEEP_ALIVE, str(now))  # type: ignore[misc]
            except Exception as e:
                logger.debug(f"Backend keep_alive failed for {sandbox_id}: {e}")
        finally:
            if own_client:
                await redis_client.aclose()

    async def _on_operation(self) -> None:
        """Called after each delegated operation to refresh TTLs."""
        redis_client = await self._create_redis_client()
        try:
            await self._touch_redis_ttl(redis_client)
            await self._maybe_keep_alive_backend(redis_client)
        except Exception as e:
            logger.debug(f"_on_operation housekeeping failed: {e}")
        finally:
            await redis_client.aclose()

    async def _verify_or_recover(self, redis_client: aioredis.Redis, sandbox_id: str) -> bool:
        """Check if a sandbox is alive; try to restart if stopped.

        Returns True if the sandbox is usable, False if it should be recreated.
        """
        try:
            state = await self._backend.get_status(sandbox_id)
        except Exception as e:
            # get_status threw — the sandbox may have been destroyed on the
            # backend (e.g. Daytona returns 404).  Fall back to get_info as a
            # second probe; if that also fails the sandbox is truly gone.
            logger.warning(f"get_status failed for {sandbox_id}: {e}")
            try:
                info = await self._backend.get_info(sandbox_id)
                if info:
                    logger.debug(f"get_info succeeded for {sandbox_id}, assuming alive")
                    return True
            except Exception:
                pass
            logger.info(f"Sandbox {sandbox_id} unreachable on backend, will recreate")
            return False

        if state.status == SandboxStatus.running:
            return True

        if state.status == SandboxStatus.stopped:
            try:
                await self._backend.start(sandbox_id)
                logger.info(f"Restarted stopped sandbox {sandbox_id}")
                return True
            except NotImplementedError:
                logger.info(f"Backend cannot restart {sandbox_id}, will recreate")
                return False
            except Exception as e:
                logger.warning(f"Failed to restart sandbox {sandbox_id}: {e}")
                return False

        # unknown — assume alive
        return True

    # --- Public lifecycle methods ---

    async def get_status(self) -> SandboxState:
        """Get the backend-reported status of this session's sandbox."""
        sandbox_id = await self.get_sandbox_id()
        if not sandbox_id:
            return SandboxState(status=SandboxStatus.unknown)
        try:
            return await self._backend.get_status(sandbox_id)
        except Exception as e:
            logger.warning(f"get_status failed for sandbox {sandbox_id}: {e}")
            return SandboxState(status=SandboxStatus.unknown)

    async def keep_alive(self) -> bool:
        """Refresh both Redis TTL and backend idle timer.

        Returns True if successful, False otherwise.
        """
        sandbox_id = await self.get_sandbox_id()
        if not sandbox_id:
            return False
        try:
            await self._backend.keep_alive(sandbox_id)
            redis_client = await self._create_redis_client()
            try:
                await self._touch_redis_ttl(redis_client)
                await redis_client.hset(self.redis_key, _F_LAST_KEEP_ALIVE, str(time.time()))  # type: ignore[misc]
            finally:
                await redis_client.aclose()
            return True
        except Exception as e:
            logger.warning(f"keep_alive failed for sandbox {sandbox_id}: {e}")
            return False

    async def start_sandbox(self) -> bool:
        """Attempt to start a stopped sandbox.

        Returns True if started successfully, False otherwise.
        """
        sandbox_id = await self.get_sandbox_id()
        if not sandbox_id:
            return False
        try:
            await self._backend.start(sandbox_id)
            return True
        except Exception as e:
            logger.warning(f"start_sandbox failed for {sandbox_id}: {e}")
            return False

    async def get_backend_info(self) -> dict[str, Any]:
        """Return backend-specific diagnostic information."""
        sandbox_id = await self.get_sandbox_id()
        if not sandbox_id:
            return {}
        try:
            return await self._backend.get_info(sandbox_id)
        except Exception as e:
            logger.warning(f"get_info failed for sandbox {sandbox_id}: {e}")
            return {}

    # --- Delegated operations (mutating — auto-provisions) ---

    async def exec(self, command: str, cwd: str | None = None, timeout: int | None = None) -> ExecResult:
        sandbox_id = await self.ensure_sandbox()
        result = await self._backend.exec(sandbox_id, command, cwd=cwd, timeout=timeout)
        await self._on_operation()
        return result

    async def read_file(self, path: str) -> str:
        sandbox_id = await self.ensure_sandbox()
        result = await self._backend.read_file(sandbox_id, path)
        await self._on_operation()
        return result

    async def read_file_bytes(self, path: str) -> bytes:
        sandbox_id = await self.ensure_sandbox()
        result = await self._backend.read_file_bytes(sandbox_id, path)
        await self._on_operation()
        return result

    async def write_file(self, path: str, content: str) -> None:
        sandbox_id = await self.ensure_sandbox()
        await self._backend.write_file(sandbox_id, path, content)
        await self._on_operation()

    async def list_files(self, path: str) -> list[FileInfo]:
        sandbox_id = await self.ensure_sandbox()
        result = await self._backend.list_files(sandbox_id, path)
        await self._on_operation()
        return result

    async def find_files(self, root: str, pattern: str) -> list[str]:
        sandbox_id = await self.ensure_sandbox()
        result = await self._backend.find_files(sandbox_id, root, pattern)
        await self._on_operation()
        return result

    async def search_in_files(
        self,
        root: str,
        pattern: str,
        include: str | None = None,
    ) -> list[SearchMatch]:
        sandbox_id = await self.ensure_sandbox()
        result = await self._backend.search_in_files(sandbox_id, root, pattern, include=include)
        await self._on_operation()
        return result

    async def write_file_bytes(self, path: str, data: bytes) -> None:
        sandbox_id = await self.ensure_sandbox()
        await self._backend.write_file_bytes(sandbox_id, path, data)
        await self._on_operation()

    async def get_preview_url(self, port: int) -> PreviewUrl:
        sandbox_id = await self.ensure_sandbox()
        result = await self._backend.get_preview_url(sandbox_id, port)
        await self._on_operation()
        return result

    # --- Read-only operations (for API layer — require existing sandbox) ---

    async def list_files_readonly(self, sandbox_id: str, path: str) -> list[FileInfo]:
        """List files in an existing sandbox without provisioning."""
        return await self._backend.list_files(sandbox_id, path)

    async def read_file_bytes_readonly(self, sandbox_id: str, path: str) -> bytes:
        """Read file bytes from an existing sandbox without provisioning."""
        return await self._backend.read_file_bytes(sandbox_id, path)

    async def get_preview_url_readonly(self, sandbox_id: str, port: int) -> PreviewUrl:
        """Get preview URL for an existing sandbox without provisioning."""
        return await self._backend.get_preview_url(sandbox_id, port)


# --- Redis helpers (backward compat: old keys are plain strings, new keys are hashes) ---


async def _read_sandbox_id(redis_client: aioredis.Redis, key: str) -> str | None:
    """Read sandbox_id from Redis, handling both hash and legacy string format."""
    key_type = await redis_client.type(key)

    if key_type == "hash":
        return await redis_client.hget(key, _F_SANDBOX_ID)  # type: ignore[return-value]
    if key_type == "string":
        # Legacy format — plain sandbox_id string
        return await redis_client.get(key)
    return None


async def _read_sandbox_info(redis_client: aioredis.Redis, key: str, session_id: str) -> SandboxInfo | None:
    """Read full sandbox info from Redis hash. Returns None for legacy string keys."""
    key_type = await redis_client.type(key)

    if key_type == "hash":
        data: dict[str, str] = await redis_client.hgetall(key)  # type: ignore[assignment]
        sandbox_id = data.get(_F_SANDBOX_ID)
        if not sandbox_id:
            return None
        created_at_str = data.get(_F_CREATED_AT, "")
        try:
            created_at = datetime.fromisoformat(created_at_str)
        except (ValueError, TypeError):
            created_at = datetime.now(timezone.utc)
        return SandboxInfo(
            sandbox_id=sandbox_id,
            session_id=session_id,
            created_at=created_at,
            backend=data.get(_F_BACKEND, "unknown"),
        )

    if key_type == "string":
        # Legacy format — synthesize minimal info
        sandbox_id = await redis_client.get(key)
        if not sandbox_id:
            return None
        return SandboxInfo(
            sandbox_id=sandbox_id,
            session_id=session_id,
            created_at=datetime.now(timezone.utc),
            backend="unknown",
        )

    return None


async def scan_all_sandbox_infos(redis_url: str) -> list[SandboxInfo]:
    """Scan Redis for all active sandbox entries. Used by list API."""
    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    try:
        results: list[SandboxInfo] = []
        cursor: int | str = 0
        while True:
            cursor, keys = await redis_client.scan(
                cursor=int(cursor),
                match=f"{REDIS_KEY_PREFIX}*",
                count=100,
            )
            for key in keys:
                # Skip lock keys
                key_str = str(key)
                if key_str.endswith(":lock"):
                    continue
                session_id = key_str.removeprefix(REDIS_KEY_PREFIX)
                info = await _read_sandbox_info(redis_client, key_str, session_id)
                if info:
                    results.append(info)
            if cursor == 0:
                break
        return results
    finally:
        await redis_client.aclose()


__all__ = [
    "REDIS_KEY_PREFIX",
    "SandboxInfo",
    "SandboxManager",
    "SandboxState",
    "SandboxStatus",
    "scan_all_sandbox_infos",
]
