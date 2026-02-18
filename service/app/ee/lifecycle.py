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
    """Default lifecycle: wraps LimitsEnforcer + create_consume_for_chat.

    Behaviour is identical to the pre-EE codebase.
    """

    def __init__(self, user_id: str, db: AsyncSession) -> None:
        self._user_id = user_id
        self._db = db
        self._enforcer: Any | None = None

    async def _ensure_enforcer(self) -> Any:
        if self._enforcer is None:
            from app.core.limits import LimitsEnforcer

            self._enforcer = await LimitsEnforcer.create(self._db, self._user_id)
        return self._enforcer

    async def on_connect(self, connection_id: str) -> None:
        enforcer = await self._ensure_enforcer()
        await enforcer.track_chat_connect(connection_id)

    async def check_before_message(self, connection_id: str) -> dict[str, Any] | None:
        from app.core.limits import ParallelChatLimitError

        enforcer = await self._ensure_enforcer()
        try:
            await enforcer.check_and_start_responding(connection_id)
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
        from app.core.consume import create_consume_for_chat

        await create_consume_for_chat(
            db=db,
            user_id=user_id,
            auth_provider=auth_provider,
            amount=amount,
            access_key=access_key,
            session_id=session_id,
            topic_id=topic_id,
            message_id=message_id,
            description=description,
        )
        return float(amount)

    async def on_disconnect(self, connection_id: str) -> None:
        if self._enforcer is not None:
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


def get_chat_lifecycle(user_id: str, db: AsyncSession) -> ChatLifecycle:
    """Return the appropriate ChatLifecycle for the current deployment.

    Currently always returns ``DefaultChatLifecycle`` (local billing/limits).
    When the remote EE billing API is ready, this factory will select the
    implementation based on ``is_ee()``.
    """
    return DefaultChatLifecycle(user_id, db)
