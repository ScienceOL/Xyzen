"""
Context variables for subagent tool execution.

Provides a session factory via contextvars so subagents can create
their own fresh database sessions instead of reusing the parent's.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

_session_factory_var: ContextVar["async_sessionmaker[AsyncSession] | None"] = ContextVar(
    "subagent_session_factory", default=None
)


def set_session_factory(factory: "async_sessionmaker[AsyncSession]") -> None:
    """Set the async session factory for subagent use. Called in Celery task setup."""
    _session_factory_var.set(factory)


def get_session_factory() -> "async_sessionmaker[AsyncSession] | None":
    """Get the async session factory. Returns None if not set."""
    return _session_factory_var.get()
