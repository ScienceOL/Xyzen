"""
Sandbox infrastructure module.

Provides isolated code execution environments via pluggable backends.
"""

from __future__ import annotations

import logging

from .backends import get_backend
from .backends.base import SandboxState, SandboxStatus
from .manager import SandboxInfo, SandboxManager, scan_all_sandbox_infos

logger = logging.getLogger(__name__)


async def get_sandbox_manager(
    session_id: str,
    user_id: str | None = None,
    sandbox_backend: str | None = None,
) -> SandboxManager:
    """
    Get a SandboxManager for a given session.

    Args:
        session_id: Session UUID string
        user_id: Optional user ID for limit enforcement and Runner routing
        sandbox_backend: Per-session backend override.
            Prefixed values: "runner:{runner_id}" or "sandbox:{target_session_id}".
            None uses auto-detect logic (runner if online, else cloud).

    Returns:
        SandboxManager instance with configured backend
    """
    # "runner:{runner_id}" → Use runner backend for this user
    if sandbox_backend and sandbox_backend.startswith("runner:") and user_id:
        from .backends.runner_backend import RunnerBackend

        return SandboxManager(backend=RunnerBackend(user_id), session_id=session_id, user_id=user_id)

    # "sandbox:{target_session_id}" → Reuse sandbox from another session
    if sandbox_backend and sandbox_backend.startswith("sandbox:"):
        target_session_id = sandbox_backend[8:]
        backend = get_backend()
        return SandboxManager(backend=backend, session_id=target_session_id, user_id=user_id)

    # Auto-detect: runner-first if user has one online
    if user_id:
        try:
            import redis.asyncio as aioredis

            from app.configs import configs

            r = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
            try:
                if await r.exists(f"runner:online:{user_id}"):
                    from .backends.runner_backend import RunnerBackend

                    return SandboxManager(backend=RunnerBackend(user_id), session_id=session_id, user_id=user_id)
            finally:
                await r.aclose()
        except Exception as e:
            logger.debug(f"Runner check failed, falling back to cloud backend: {e}")

    backend = get_backend()
    return SandboxManager(backend=backend, session_id=session_id, user_id=user_id)


__all__ = [
    "SandboxInfo",
    "SandboxManager",
    "SandboxState",
    "SandboxStatus",
    "get_sandbox_manager",
    "scan_all_sandbox_infos",
]
