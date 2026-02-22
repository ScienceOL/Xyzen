"""ChatLifecycle protocol and implementations.

Provides the central abstraction that the WebSocket chat handler uses
for billing, limits, and connection tracking.

- ``DefaultChatLifecycle``: wraps the existing local billing / limits code.
  This is the **default** so that behaviour is identical to pre-EE.
- ``NoopChatLifecycle``: every method is a no-op.  Reserved for future use
  (e.g. a self-hosted CE build that explicitly disables billing).
"""

import logging
from typing import Any, Protocol
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)


class ChatLifecycle(Protocol):
    """Interface consumed by the WebSocket chat handler."""

    async def on_connect(self, connection_id: str) -> None: ...

    async def check_before_message(self, connection_id: str) -> dict[str, Any] | None:
        """Return ``None`` to allow the message, or an error payload dict to reject."""
        ...

    async def pre_deduct(
        self,
        db: AsyncSession,
        user_id: str,
        auth_provider: str,
        amount: int,
        access_key: str | None,
        session_id: UUID | None,
        topic_id: UUID | None,
        message_id: UUID | None,
        description: str | None,
    ) -> float:
        """Return the pre-deducted amount (0.0 means no billing)."""
        ...

    async def on_disconnect(self, connection_id: str) -> None: ...


# ---------------------------------------------------------------------------
# Default — delegates to existing local billing / limits code
# ---------------------------------------------------------------------------


class DefaultChatLifecycle:
    """Default lifecycle: wraps LimitsEnforcer + settle_chat_records.

    Behaviour is identical to the pre-EE codebase.  The enforcer (which
    requires a DB session to resolve subscription limits) is created
    eagerly.  If that fails, limits enforcement is skipped but billing
    (``pre_deduct``) still works because it receives its own ``db`` from
    the caller.
    """

    def __init__(self, enforcer: Any | None) -> None:
        self._enforcer = enforcer

    @staticmethod
    async def create(user_id: str, db: AsyncSession) -> "DefaultChatLifecycle":
        """Create a lifecycle, tolerating enforcer creation failures."""
        enforcer = None
        try:
            from app.core.limits import LimitsEnforcer

            enforcer = await LimitsEnforcer.create(db, user_id)
        except Exception as e:
            logger.warning(f"Failed to create LimitsEnforcer (limits disabled): {e}")
        return DefaultChatLifecycle(enforcer)

    async def on_connect(self, connection_id: str) -> None:
        if self._enforcer:
            await self._enforcer.track_chat_connect(connection_id)

    async def check_before_message(self, connection_id: str) -> dict[str, Any] | None:
        if not self._enforcer:
            return None

        from app.core.limits import ParallelChatLimitError

        try:
            await self._enforcer.check_and_start_responding(connection_id)
        except ParallelChatLimitError as e:
            return {
                "type": "parallel_chat_limit",
                "data": {
                    "error_code": "PARALLEL_CHAT_LIMIT",
                    "current": e.current,
                    "limit": e.limit,
                },
            }
        return None

    async def pre_deduct(
        self,
        db: AsyncSession,
        user_id: str,
        auth_provider: str,
        amount: int,
        access_key: str | None,
        session_id: UUID | None,
        topic_id: UUID | None,
        message_id: UUID | None,
        description: str | None,
    ) -> float:
        from app.repos.redemption import RedemptionRepository

        redemption_repo = RedemptionRepository(db)
        wallet = await redemption_repo.get_or_create_user_wallet(user_id)

        if wallet.virtual_balance <= 0:
            from app.common.code.error_code import ErrCode

            raise ErrCode.INSUFFICIENT_BALANCE.with_messages(f"积分余额不足，当前余额: {wallet.virtual_balance}")

        return 0.0  # No pre-deduction; settlement handles billing

    async def on_disconnect(self, connection_id: str) -> None:
        if self._enforcer:
            await self._enforcer.track_chat_disconnect(connection_id)


# ---------------------------------------------------------------------------
# Noop — no billing, no limits (reserved for future CE builds)
# ---------------------------------------------------------------------------


class NoopChatLifecycle:
    """No billing, no limits.  All methods are no-ops."""

    async def on_connect(self, connection_id: str) -> None:
        pass

    async def check_before_message(self, connection_id: str) -> dict[str, Any] | None:
        return None

    async def pre_deduct(
        self,
        db: AsyncSession,
        user_id: str,
        auth_provider: str,
        amount: int,
        access_key: str | None,
        session_id: UUID | None,
        topic_id: UUID | None,
        message_id: UUID | None,
        description: str | None,
    ) -> float:
        return 0.0

    async def on_disconnect(self, connection_id: str) -> None:
        pass


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


async def get_chat_lifecycle(user_id: str, db: AsyncSession) -> ChatLifecycle:
    """Return the appropriate ChatLifecycle for the current deployment.

    Currently always returns ``DefaultChatLifecycle`` (local billing/limits).
    When the remote EE billing API is ready, this factory will select the
    implementation based on ``is_ee()``.
    """
    return await DefaultChatLifecycle.create(user_id, db)
