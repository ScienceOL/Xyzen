"""Centralized subscription limit enforcement.

Provides a LimitsEnforcer that checks parallel chat and sandbox quotas
using Redis for real-time tracking and SubscriptionService for limits.
Storage quota enforcement is handled separately via StorageQuotaService.
"""

import logging

from typing import Any

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.session_pool import SessionPool
from app.core.subscription import SubscriptionService, UserLimits
from app.infra.redis import get_redis_client
from app.infra.sandbox.manager import REDIS_KEY_PREFIX as _SANDBOX_KEY_PREFIX

logger = logging.getLogger(__name__)


class ParallelChatLimitError(Exception):
    """Raised when the user has reached the max number of responding chats."""

    def __init__(self, current: int, limit: int) -> None:
        self.current = current
        self.limit = limit
        super().__init__(f"Parallel chat limit reached ({current}/{limit})")


class LimitsEnforcer:
    """Centralized subscription limit enforcement.

    Usage:
        enforcer = await LimitsEnforcer.create(db, user_id)
        await enforcer.check_and_start_responding(connection_id)
    """

    # Free-tier fallback defaults (used when no subscription role is resolved)
    _FREE_MAX_PARALLEL_CHATS = 1
    _FREE_MAX_SANDBOXES = 0

    def __init__(self, limits: UserLimits | None, user_id: str) -> None:
        self._limits = limits
        self._user_id = user_id
        self._pool = SessionPool(user_id)

    @staticmethod
    async def create(db: AsyncSession, user_id: str) -> "LimitsEnforcer":
        limits = await SubscriptionService(db).get_user_limits(user_id)
        return LimitsEnforcer(limits, user_id)

    # --- Chat ---

    @property
    def _max_parallel_chats(self) -> int:
        if self._limits is not None:
            return self._limits.max_parallel_chats
        return self._FREE_MAX_PARALLEL_CHATS

    async def track_chat_connect(self, connection_id: str) -> None:
        """Register connection as idle in the session pool."""
        await self._pool.register(connection_id)

    async def track_chat_disconnect(self, connection_id: str) -> None:
        """Remove connection from the session pool."""
        await self._pool.unregister(connection_id)

    async def check_and_start_responding(self, connection_id: str) -> None:
        """Atomically check limit and mark connection as responding.

        Raises ParallelChatLimitError if the limit is reached.
        """
        max_chats = self._max_parallel_chats
        result = await self._pool.check_and_set_responding(connection_id, max_chats)
        if result == 0:
            count = await self._pool.get_responding_count()
            raise ParallelChatLimitError(current=count, limit=max_chats)
        if result == -1:
            # Connection not registered — register as responding directly
            logger.warning(f"Connection {connection_id} not registered, registering now")
            await self._pool.register(connection_id)
            # Retry once after registration
            result = await self._pool.check_and_set_responding(connection_id, max_chats)
            if result == 0:
                count = await self._pool.get_responding_count()
                raise ParallelChatLimitError(current=count, limit=max_chats)

    async def finish_responding(self, connection_id: str) -> None:
        """Mark connection as idle after AI processing completes."""
        await self._pool.set_idle(connection_id)

    # --- Sandbox ---

    async def check_sandbox_creation(self, db: AsyncSession) -> None:
        """Raise HTTPException(429) if user has max active sandboxes."""
        from fastapi import HTTPException

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

        responding_count = await self._pool.get_responding_count()
        sandbox_count = await self.count_active_sandboxes(db)

        quota_service = await create_quota_service(db, self._user_id)
        quota_info = await quota_service.get_quota_info(self._user_id)

        limits = self._limits
        return {
            "role_name": limits.role_name if limits else "free",
            "role_display_name": limits.role_display_name if limits else "Free",
            "chats": {
                "used": responding_count,
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
