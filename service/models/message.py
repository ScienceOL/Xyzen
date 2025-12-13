from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import Column, Field, SQLModel

if TYPE_CHECKING:
    from .citation import CitationRead
    from .file import FileRead, FileReadWithUrl
    from .topic import TopicRead


class MessageBase(SQLModel):
    # role can be 'user', 'assistant', 'system', 'tool', etc.
    role: str
    content: str
    topic_id: UUID = Field(index=True)


class Message(MessageBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class MessageCreate(MessageBase):
    pass


class MessageRead(MessageBase):
    id: UUID
    created_at: datetime


class MessageReadWithTopic(MessageBase):
    id: UUID
    created_at: datetime
    topic: "TopicRead | None" = None


class MessageReadWithFiles(MessageBase):
    id: UUID
    created_at: datetime
    attachments: list["FileRead | FileReadWithUrl"] = []


class MessageReadWithCitations(MessageBase):
    id: UUID
    created_at: datetime
    citations: list["CitationRead"] = []


class MessageReadWithFilesAndCitations(MessageBase):
    id: UUID
    created_at: datetime
    attachments: list["FileRead | FileReadWithUrl"] = []
    citations: list["CitationRead"] = []


class MessageUpdate(SQLModel):
    role: str | None = None
    content: str | None = None
