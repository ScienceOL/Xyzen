"""ContextVar-based tracking context for consumption recording.

Set once at the start of a Celery chat task, then read by tool
implementations (image, subagent, delegation, topic_generator, model_selector)
to obtain the user/session/topic/message_id and a DB session factory
without explicit parameter passing.
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any
from uuid import UUID


@dataclass
class TrackingContext:
    """Tracking context for the current chat task.

    Most fields are set once at task start, but ``message_id`` is mutable —
    it is set to ``None`` initially and updated after the AI message is created.
    """

    user_id: str
    session_id: UUID | None
    topic_id: UUID | None
    message_id: UUID | None
    model_tier: str | None
    db_session_factory: Any  # async_sessionmaker


_tracking_ctx: ContextVar[TrackingContext | None] = ContextVar("tracking_ctx", default=None)


def set_tracking_context(ctx: TrackingContext) -> None:
    """Set the tracking context for the current task."""
    _tracking_ctx.set(ctx)


def get_tracking_context() -> TrackingContext | None:
    """Get the tracking context, or None if not in a tracked task."""
    return _tracking_ctx.get()


def clear_tracking_context() -> None:
    """Clear the tracking context."""
    _tracking_ctx.set(None)
