"""Centralized subscription limit enforcement.

Provides a LimitsEnforcer that checks parallel chat and sandbox quotas
using Redis for real-time tracking and SubscriptionService for limits.
Storage quota enforcement is handled separately via StorageQuotaService.
"""

import logging

from typing import Any

from fastapi import HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.subscription import SubscriptionService, UserLimits
from app.infra.redis import get_redis_client

logger = logging.getLogger(__name__)

# Redis key prefix for active chat connections per user
_ACTIVE_CHATS_KEY = "active_chats:user:"
# Redis key prefix for sandbox session mapping (defined in sandbox/manager.py)
_SANDBOX_KEY_PREFIX = "sandbox:session:"


class LimitsEnforcer:
    """Centralized subscription limit enforcement.

    Usage:
        enforcer = await LimitsEnforcer.create(db, user_id)
        await enforcer.check_parallel_chat()
        await enforcer.check_sandbox_creation(db)
    """

    # Free-tier fallback defaults (used when no subscription role is resolved)
    _FREE_MAX_PARALLEL_CHATS = 1
    _FREE_MAX_SANDBOXES = 0

    def __init__(self, limits: UserLimits | None, user_id: str) -> None:
        self._limits = limits
        self._user_id = user_id

    @staticmethod
    async def create(db: AsyncSession, user_id: str) -> "LimitsEnforcer":
        limits = await SubscriptionService(db).get_user_limits(user_id)
        return LimitsEnforcer(limits, user_id)

    # --- Chat ---

    async def check_parallel_chat(self, connection_id: str | None = None) -> None:
        """Raise HTTPException(429) if user has max active WS connections.

        If *connection_id* is provided, it is removed from the active set
        **before** counting.  This avoids a race condition when the same
        client disconnects and immediately reconnects: the old connection
        may still be tracked in Redis when the new one is being checked.
        """
        if self._limits is not None:
            max_chats = self._limits.max_parallel_chats
        else:
            max_chats = self._FREE_MAX_PARALLEL_CHATS
        if max_chats <= 0:
            return  # 0 = unlimited

        # Pre-clean: remove this connection_id so a reconnect is not counted
        # against itself.
        if connection_id:
            redis = await get_redis_client()
            key = f"{_ACTIVE_CHATS_KEY}{self._user_id}"
            await redis.srem(key, connection_id)  # type: ignore[misc]

        current = await self.get_active_chat_count()
        if current >= max_chats:
            raise HTTPException(
                status_code=429,
                detail=f"Parallel chat limit reached ({current}/{max_chats}). "
                "Please close an existing chat before opening a new one.",
            )

    async def track_chat_connect(self, connection_id: str) -> None:
        """Add connection_id to Redis SET active_chats:user:{user_id}."""
        redis = await get_redis_client()
        key = f"{_ACTIVE_CHATS_KEY}{self._user_id}"
        await redis.sadd(key, connection_id)  # type: ignore[misc]
        # TTL as safety net: auto-clean if server crashes without disconnect
        await redis.expire(key, 7200)  # 2 hours

    async def track_chat_disconnect(self, connection_id: str) -> None:
        """Remove connection_id from Redis SET."""
        redis = await get_redis_client()
        key = f"{_ACTIVE_CHATS_KEY}{self._user_id}"
        await redis.srem(key, connection_id)  # type: ignore[misc]

    async def get_active_chat_count(self) -> int:
        """SCARD on active_chats:user:{user_id}."""
        redis = await get_redis_client()
        key = f"{_ACTIVE_CHATS_KEY}{self._user_id}"
        count: int = await redis.scard(key)  # type: ignore[misc]
        return count

    # --- Sandbox ---

    async def check_sandbox_creation(self, db: AsyncSession) -> None:
        """Raise HTTPException(429) if user has max active sandboxes."""
        if self._limits is not None:
            max_sandboxes = self._limits.max_sandboxes
        else:
            max_sandboxes = self._FREE_MAX_SANDBOXES
        if max_sandboxes <= 0:
            return  # 0 = unlimited
        current = await self.count_active_sandboxes(db)
        if current >= max_sandboxes:
            raise HTTPException(
                status_code=429,
                detail=f"Sandbox limit reached ({current}/{max_sandboxes}). "
                "Your current plan does not allow more sandboxes.",
            )

    async def count_active_sandboxes(self, db: AsyncSession) -> int:
        """Count active sandboxes belonging to this user.

        Strategy: scan Redis sandbox:session:* keys, resolve session→user via DB.
        """
        from app.repos.session import SessionRepository

        redis = await get_redis_client()
        session_repo = SessionRepository(db)

        count = 0
        cursor: int | str = 0
        while True:
            cursor, keys = await redis.scan(cursor=int(cursor), match=f"{_SANDBOX_KEY_PREFIX}*", count=100)
            for key in keys:
                # key = "sandbox:session:<session_id>"
                session_id_str = str(key).removeprefix(_SANDBOX_KEY_PREFIX)
                try:
                    from uuid import UUID

                    session = await session_repo.get_session_by_id(UUID(session_id_str))
                    if session and session.user_id == self._user_id:
                        count += 1
                except (ValueError, Exception):
                    continue
            if cursor == 0:
                break
        return count

    # --- Summary ---

    async def get_usage_summary(self, db: AsyncSession) -> dict[str, Any]:
        """Return usage vs limits for all resource types."""
        from app.core.storage import create_quota_service

        chat_count = await self.get_active_chat_count()
        sandbox_count = await self.count_active_sandboxes(db)

        quota_service = await create_quota_service(db, self._user_id)
        quota_info = await quota_service.get_quota_info(self._user_id)

        limits = self._limits
        return {
            "role_name": limits.role_name if limits else "free",
            "role_display_name": limits.role_display_name if limits else "Free",
            "chats": {
                "used": chat_count,
                "limit": limits.max_parallel_chats if limits else self._FREE_MAX_PARALLEL_CHATS,
            },
            "sandboxes": {
                "used": sandbox_count,
                "limit": limits.max_sandboxes if limits else self._FREE_MAX_SANDBOXES,
            },
            "storage": {
                "used_bytes": quota_info["storage"]["used_bytes"],
                "limit_bytes": quota_info["storage"]["limit_bytes"],
                "usage_percentage": quota_info["storage"]["usage_percentage"],
            },
            "files": {
                "used": quota_info["file_count"]["used"],
                "limit": quota_info["file_count"]["limit"],
            },
        }
