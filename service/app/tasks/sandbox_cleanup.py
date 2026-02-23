"""Periodic cleanup of orphaned sandbox Redis entries.

Scans all sandbox Redis mappings, queries the backend for each sandbox's
real state, and removes entries whose backend sandbox is destroyed or
unreachable.  This prevents stale mappings from accumulating when Daytona
auto-deletes sandboxes after the configured ``auto_delete_interval``.
"""

from __future__ import annotations

import asyncio
import logging

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _run_cleanup() -> dict[str, int]:
    """Core async cleanup logic."""
    import redis.asyncio as aioredis

    from app.configs import configs
    from app.infra.sandbox.backends import get_backend
    from app.infra.sandbox.backends.base import SandboxStatus
    from app.infra.sandbox.manager import REDIS_KEY_PREFIX

    FIELD_SANDBOX_ID = "sandbox_id"

    redis_client = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    backend = get_backend()

    removed = 0
    checked = 0
    errors = 0

    try:
        cursor: int | str = 0
        keys: list[str] = []
        while True:
            cursor, batch = await redis_client.scan(
                cursor=int(cursor),
                match=f"{REDIS_KEY_PREFIX}*",
                count=100,
            )
            keys.extend(str(k) for k in batch if not str(k).endswith(":lock"))
            if cursor == 0:
                break

        for key in keys:
            key_type = await redis_client.type(key)
            if key_type == "hash":
                sandbox_id: str | None = await redis_client.hget(key, FIELD_SANDBOX_ID)  # type: ignore[assignment]
            elif key_type == "string":
                sandbox_id = await redis_client.get(key)
            else:
                continue

            if not sandbox_id:
                await redis_client.delete(key)
                removed += 1
                continue

            checked += 1
            try:
                state = await backend.get_status(sandbox_id)
                if state.status == SandboxStatus.stopped:
                    # Stopped is fine — the sandbox still exists, keep the mapping
                    continue
                if state.status == SandboxStatus.running:
                    continue
                # unknown — keep it (better safe than sorry)
            except Exception:
                # If get_status raises, the sandbox might be gone on the backend.
                # Try a direct check: attempt to get info; if that also fails,
                # treat it as destroyed.
                try:
                    info = await backend.get_info(sandbox_id)
                    if info:
                        continue
                except Exception:
                    pass

                session_id = str(key).removeprefix(REDIS_KEY_PREFIX)
                logger.info(
                    f"Sandbox {sandbox_id} (session {session_id}) unreachable on backend — removing Redis mapping"
                )
                await redis_client.delete(key)
                removed += 1
                errors += 1

    finally:
        await redis_client.aclose()

    return {"checked": checked, "removed": removed, "errors": errors}


@celery_app.task(name="sandbox_cleanup", ignore_result=True)
def sandbox_cleanup_task() -> dict[str, int]:
    """Celery task entry-point — runs cleanup in an event loop."""
    result = asyncio.run(_run_cleanup())
    if result["removed"]:
        logger.info(f"Sandbox cleanup: checked={result['checked']}, removed={result['removed']}")
    else:
        logger.debug(f"Sandbox cleanup: checked={result['checked']}, nothing to remove")
    return result
