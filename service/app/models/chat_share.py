import secrets
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import JSON, Column, Field, SQLModel


class ShareStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


class ChatShare(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    token: str = Field(
        default_factory=lambda: secrets.token_urlsafe(16),
        unique=True,
        index=True,
    )
    user_id: str = Field(index=True)
    session_id: UUID = Field(index=True)
    topic_id: UUID = Field(index=True)
    agent_id: UUID | None = Field(default=None, index=True)
    messages_snapshot: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    agent_snapshot: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    title: str | None = None
    message_count: int = Field(default=0)
    status: ShareStatus = Field(default=ShareStatus.ACTIVE)
    expires_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
    )
    allow_fork: bool = Field(default=False)
    max_uses: int | None = None
    use_count: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class ChatShareCreate(SQLModel):
    session_id: UUID
    topic_id: UUID
    message_ids: list[UUID] | None = None
    messages_snapshot: list[dict[str, Any]] | None = None
    title: str | None = None
    allow_fork: bool = False
    expires_at: datetime | None = None
    max_uses: int | None = None


class ChatShareRead(SQLModel):
    id: UUID
    token: str
    user_id: str
    session_id: UUID
    topic_id: UUID
    agent_id: UUID | None = None
    title: str | None = None
    message_count: int
    allow_fork: bool
    status: ShareStatus
    expires_at: datetime | None = None
    max_uses: int | None = None
    use_count: int
    created_at: datetime


class ChatSharePublicRead(SQLModel):
    token: str
    title: str | None = None
    message_count: int
    allow_fork: bool
    messages_snapshot: list[dict[str, Any]]
    agent_snapshot: dict[str, Any] | None = None
    created_at: datetime
