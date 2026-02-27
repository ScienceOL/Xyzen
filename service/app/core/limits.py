"""Centralized subscription limit enforcement.

Provides a LimitsEnforcer that checks parallel chat and sandbox quotas
using Redis for real-time tracking and SubscriptionService for limits.
Storage quota enforcement is handled separately via StorageQuotaService.

FGA integration: each gate first checks a boolean FGA capability
(can/cannot), then falls back to DB numeric quotas. FGA is optional —
if unavailable, the enforcer gracefully degrades to DB-only checks.
"""

import logging

from typing import Any, Protocol, runtime_checkable

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.fga.capabilities import (
    CAPABILITY_DEPLOYMENT_ACCESS,
    CAPABILITY_MODEL_TIER_PRO,
    CAPABILITY_MODEL_TIER_STANDARD,
    CAPABILITY_MODEL_TIER_ULTRA,
    CAPABILITY_SANDBOX_ACCESS,
    CAPABILITY_SCHEDULED_TASK_ACCESS,
    CAPABILITY_TERMINAL_ACCESS,
)
from app.core.session_pool import SessionPool
from app.core.subscription import SubscriptionService, UserLimits
from app.infra.redis import get_redis_client
from app.infra.sandbox.manager import REDIS_KEY_PREFIX as _SANDBOX_KEY_PREFIX
from app.schemas.model_tier import ModelTier

logger = logging.getLogger(__name__)

# Mapping from ModelTier enum to FGA capability ID
_TIER_CAPABILITY_MAP: dict[ModelTier, str] = {
    ModelTier.STANDARD: CAPABILITY_MODEL_TIER_STANDARD,
    ModelTier.PRO: CAPABILITY_MODEL_TIER_PRO,
    ModelTier.ULTRA: CAPABILITY_MODEL_TIER_ULTRA,
}

TIER_ORDER = [ModelTier.LITE, ModelTier.STANDARD, ModelTier.PRO, ModelTier.ULTRA]


class ParallelChatLimitError(Exception):
    """Raised when the user has reached the max number of responding chats."""

    def __init__(self, current: int, limit: int) -> None:
        self.current = current
        self.limit = limit
        super().__init__(f"Parallel chat limit reached ({current}/{limit})")


@runtime_checkable
class FgaClientProtocol(Protocol):
    """Minimal interface expected from the FGA client."""

    async def check_capability(self, user_id: str, capability: str) -> bool: ...


class LimitsEnforcer:
    """Centralized subscription limit enforcement.

    Usage:
        enforcer = await LimitsEnforcer.create(db, user_id)
        await enforcer.check_and_start_responding(connection_id)
    """

    # Free-tier fallback defaults (used when no subscription role is resolved)
    _FREE_MAX_PARALLEL_CHATS = 1
    _FREE_MAX_SANDBOXES = 1
    _FREE_MAX_SCHEDULED_TASKS = 1
    _FREE_MAX_TERMINALS = 1
    _FREE_MAX_DEPLOYMENTS = 1

    def __init__(
        self,
        limits: UserLimits | None,
        user_id: str,
        fga: FgaClientProtocol | None = None,
    ) -> None:
        self._limits = limits
        self._user_id = user_id
        self._pool = SessionPool(user_id)
        self._fga = fga

    @staticmethod
    async def create(db: AsyncSession, user_id: str) -> "LimitsEnforcer":
        limits = await SubscriptionService(db).get_user_limits(user_id)
        fga: FgaClientProtocol | None = None
        try:
            from app.core.fga.client import get_fga_client

            fga = await get_fga_client()
        except Exception:
            pass
        return LimitsEnforcer(limits, user_id, fga=fga)

    # --- FGA helpers ---

    async def _check_capability(self, capability: str) -> bool | None:
        """FGA boolean gate. Returns True/False, or None if FGA unavailable."""
        if self._fga is None:
            return None
        try:
            return await self._fga.check_capability(self._user_id, capability)
        except Exception:
            return None  # Fall through to DB check

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
        """Raise HTTPException(403/429) if user cannot create sandboxes."""
        from fastapi import HTTPException

        # FGA boolean gate: can this plan use sandboxes at all?
        fga_result = await self._check_capability(CAPABILITY_SANDBOX_ACCESS)
        if fga_result is False:
            raise HTTPException(
                status_code=403,
                detail="Sandbox access is not available on your current plan.",
            )

        # DB numeric quota check
        if self._limits is not None:
            max_sandboxes = self._limits.max_sandboxes
        else:
            max_sandboxes = self._FREE_MAX_SANDBOXES
        if max_sandboxes <= 0:
            # If FGA said True but DB says 0, FGA takes priority (plan allows it)
            if fga_result is True:
                return
            return  # 0 = unlimited or not available (FGA already checked)
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

    # --- Scheduled Tasks ---

    async def check_scheduled_task_creation(self, db: AsyncSession) -> None:
        """Raise HTTPException(403/429) if user cannot create scheduled tasks."""
        from fastapi import HTTPException

        # FGA boolean gate
        fga_result = await self._check_capability(CAPABILITY_SCHEDULED_TASK_ACCESS)
        if fga_result is False:
            raise HTTPException(
                status_code=403,
                detail="Scheduled tasks are not available on your current plan.",
            )

        # DB numeric quota check
        if self._limits is not None:
            max_tasks = self._limits.max_scheduled_tasks
        else:
            max_tasks = self._FREE_MAX_SCHEDULED_TASKS

        if max_tasks <= 0:
            # If FGA said True but DB says 0, FGA takes priority
            if fga_result is True:
                return
            raise HTTPException(
                status_code=429,
                detail="Scheduled tasks are not available on your current plan.",
            )

        current = await self.count_active_scheduled_tasks(db)
        if current >= max_tasks:
            raise HTTPException(
                status_code=429,
                detail=f"Scheduled task limit reached ({current}/{max_tasks}). "
                "Your current plan does not allow more scheduled tasks.",
            )

    async def count_active_scheduled_tasks(self, db: AsyncSession) -> int:
        """Count active or paused scheduled tasks belonging to this user."""
        from sqlalchemy import func
        from sqlmodel import col, select

        from app.models.scheduled_task import ScheduledTask

        stmt = (
            select(func.count())
            .select_from(ScheduledTask)
            .where(
                ScheduledTask.user_id == self._user_id,
                col(ScheduledTask.status).in_(["active", "paused"]),
            )
        )
        result = await db.exec(stmt)
        return result.one()

    # --- Terminals ---

    async def check_terminal_connection(self) -> None:
        """Raise HTTPException(403/429) if user cannot create terminal connections."""
        from fastapi import HTTPException

        fga_result = await self._check_capability(CAPABILITY_TERMINAL_ACCESS)
        if fga_result is False:
            raise HTTPException(
                status_code=403,
                detail="Terminal access is not available on your current plan.",
            )

        if self._limits is not None:
            max_terminals = self._limits.max_terminals
        else:
            max_terminals = self._FREE_MAX_TERMINALS

        if max_terminals <= 0:
            if fga_result is True:
                return
            raise HTTPException(
                status_code=429,
                detail="Terminal connections are not available on your current plan.",
            )

        # Terminal sessions are tracked in Redis — count active ones
        current = await self.count_active_terminals()
        if current >= max_terminals:
            raise HTTPException(
                status_code=429,
                detail=f"Terminal connection limit reached ({current}/{max_terminals}). "
                "Your current plan does not allow more terminal connections.",
            )

    async def count_active_terminals(self) -> int:
        """Count active terminal sessions belonging to this user via Redis."""
        from app.infra.redis import get_redis_client

        redis = await get_redis_client()
        count = 0
        cursor: int | str = 0
        while True:
            cursor, keys = await redis.scan(cursor=int(cursor), match="terminal:session:*", count=100)
            for key in keys:
                import json

                data = await redis.get(key)
                if data:
                    try:
                        session = json.loads(data)
                        if session.get("user_id") == self._user_id and session.get("state") == "attached":
                            count += 1
                    except (json.JSONDecodeError, TypeError):
                        continue
            if cursor == 0:
                break
        return count

    # --- Deployments ---

    async def check_deployment_creation(self, db: AsyncSession) -> None:
        """Raise HTTPException(403/429) if user cannot create deployments."""
        from fastapi import HTTPException

        fga_result = await self._check_capability(CAPABILITY_DEPLOYMENT_ACCESS)
        if fga_result is False:
            raise HTTPException(
                status_code=403,
                detail="Deployment access is not available on your current plan.",
            )

        if self._limits is not None:
            max_deployments = self._limits.max_deployments
        else:
            max_deployments = self._FREE_MAX_DEPLOYMENTS

        if max_deployments <= 0:
            if fga_result is True:
                return
            raise HTTPException(
                status_code=429,
                detail="Deployments are not available on your current plan.",
            )

        current = await self.count_active_deployments(db)
        if current >= max_deployments:
            raise HTTPException(
                status_code=429,
                detail=f"Deployment limit reached ({current}/{max_deployments}). "
                "Your current plan does not allow more deployments.",
            )

    async def count_active_deployments(self, db: AsyncSession) -> int:
        """Count active deployments belonging to this user."""
        from app.repos.deployment import DeploymentRepository

        repo = DeploymentRepository(db)
        return await repo.count_active_by_user(self._user_id)

    # --- Model Tier ---

    async def check_model_tier(self, requested_tier: ModelTier) -> ModelTier:
        """Validate and clamp a requested model tier against subscription limits.

        1. FGA capability check for the requested tier level
        2. DB-based clamp using max_model_tier from the role

        Returns the effective (possibly clamped) tier.
        """
        # FGA check: try the requested tier's capability
        capability = _TIER_CAPABILITY_MAP.get(requested_tier)
        if capability:
            fga_result = await self._check_capability(capability)
            if fga_result is False:
                # FGA denied — clamp to the highest allowed tier
                return self._db_clamp_tier(requested_tier)

        # DB-based clamp (always applied as secondary check)
        return self.db_clamp_tier(requested_tier)

    def db_clamp_tier(self, requested_tier: ModelTier) -> ModelTier:
        """Clamp tier using DB role limits."""
        max_tier_str = self._limits.max_model_tier if self._limits else "lite"
        max_tier_enum = ModelTier(max_tier_str)
        if TIER_ORDER.index(requested_tier) > TIER_ORDER.index(max_tier_enum):
            return max_tier_enum
        return requested_tier

    # --- Summary ---

    async def get_usage_summary(self, db: AsyncSession) -> dict[str, Any]:
        """Return usage vs limits for all resource types."""
        from app.core.storage import create_quota_service

        responding_count = await self._pool.get_responding_count()
        sandbox_count = await self.count_active_sandboxes(db)
        scheduled_task_count = await self.count_active_scheduled_tasks(db)
        terminal_count = await self.count_active_terminals()

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
            "scheduled_tasks": {
                "used": scheduled_task_count,
                "limit": limits.max_scheduled_tasks if limits else self._FREE_MAX_SCHEDULED_TASKS,
            },
            "terminals": {
                "used": terminal_count,
                "limit": limits.max_terminals if limits else self._FREE_MAX_TERMINALS,
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
