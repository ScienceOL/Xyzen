from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import JSON, Column, Field, SQLModel

if TYPE_CHECKING:
    from .citation import CitationRead
    from .file import FileRead, FileReadWithUrl
    from .topic import TopicRead


class MessageBase(SQLModel):
    # role can be 'user', 'assistant', 'system', 'tool', etc.
    role: str
    content: str
    topic_id: UUID = Field(index=True)
    # Thinking/reasoning content from models like Claude, DeepSeek R1, Gemini 3
    thinking_content: str | None = None
    # Agent metadata for storing additional context (agent state, etc.)
    agent_metadata: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))


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
    thinking_content: str | None = None
    agent_metadata: dict[str, Any] | None = None
