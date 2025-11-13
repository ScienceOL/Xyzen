from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import Column, Field, SQLModel

if TYPE_CHECKING:
    from .message import MessageRead


class TopicBase(SQLModel):
    name: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = Field(default=True)
    session_id: UUID = Field(index=True)


class Topic(TopicBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class TopicCreate(TopicBase):
    pass


class TopicRead(TopicBase):
    id: UUID
    updated_at: datetime


class TopicReadWithMessages(TopicBase):
    id: UUID
    updated_at: datetime
    messages: list["MessageRead"] = []


class TopicUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
