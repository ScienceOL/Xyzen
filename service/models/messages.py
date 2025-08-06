from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .topics import Topic


class MessageBase(SQLModel):
    """
    Base model for messages.
    """

    role: str  # user, assistant, system, tool
    content: str


class Message(MessageBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    topic_id: UUID = Field(foreign_key="topic.id")

    topic: "Topic" = Relationship(back_populates="messages")


class MessageCreate(MessageBase):
    topic_id: UUID


class MessageRead(MessageBase):
    id: UUID
    created_at: datetime


class MessageUpdate(SQLModel):
    role: str | None = None
    content: str | None = None
