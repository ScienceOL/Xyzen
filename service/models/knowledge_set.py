from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Column
from sqlmodel import Field, SQLModel


class KnowledgeSetBase(SQLModel):
    """Base model for knowledge set information"""

    user_id: str = Field(
        index=True,
        description="The user ID who owns the knowledge set",
    )
    name: str = Field(
        max_length=255,
        description="Knowledge set name",
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
        description="Knowledge set description",
    )
    is_deleted: bool = Field(
        default=False,
        index=True,
        description="Soft delete flag",
    )


class KnowledgeSet(KnowledgeSetBase, table=True):
    """Knowledge set table model"""

    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        index=True,
        description="Unique identifier for this knowledge set",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Timestamp when the knowledge set was created",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Timestamp when the knowledge set was last updated",
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
        description="Timestamp when the knowledge set was soft deleted",
    )


class KnowledgeSetCreate(SQLModel):
    """Model for creating a new knowledge set"""

    name: str = Field(
        min_length=1,
        max_length=255,
        description="Knowledge set name",
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
        description="Knowledge set description",
    )


class KnowledgeSetRead(KnowledgeSetBase):
    """Model for reading knowledge set information"""

    id: UUID
    created_at: datetime
    updated_at: datetime


class KnowledgeSetUpdate(SQLModel):
    """Model for updating knowledge set information"""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="New knowledge set name",
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
        description="New knowledge set description",
    )
    is_deleted: bool | None = Field(
        default=None,
        description="Soft delete flag",
    )


class KnowledgeSetWithFileCount(KnowledgeSetRead):
    """Model for reading knowledge set with file count"""

    file_count: int = Field(
        default=0,
        description="Number of files linked to this knowledge set",
    )
