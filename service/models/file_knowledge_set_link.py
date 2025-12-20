from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Column
from sqlmodel import Field, SQLModel


class FileKnowledgeSetLink(SQLModel, table=True):
    """Link table for many-to-many relationship between files and knowledge sets"""

    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        index=True,
        description="Unique identifier for this link",
    )
    file_id: UUID = Field(
        index=True,
        description="File ID",
    )
    knowledge_set_id: UUID = Field(
        index=True,
        description="Knowledge set ID",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Timestamp when the link was created",
    )


class FileKnowledgeSetLinkCreate(SQLModel):
    """Model for creating a new file-knowledge set link"""

    file_id: UUID = Field(
        description="File ID to link",
    )
    knowledge_set_id: UUID = Field(
        description="Knowledge set ID to link",
    )


class FileKnowledgeSetLinkRead(SQLModel):
    """Model for reading file-knowledge set link information"""

    id: UUID
    file_id: UUID
    knowledge_set_id: UUID
    created_at: datetime
