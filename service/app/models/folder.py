from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Column
from sqlmodel import Field, SQLModel


class FolderBase(SQLModel):
    """Base model for folder information"""

    user_id: str = Field(
        index=True,
        description="The user ID who owns the folder",
    )
    parent_id: UUID | None = Field(
        default=None,
        index=True,
        description="Parent folder ID. None for root folders.",
    )
    name: str = Field(
        max_length=255,
        description="Folder name",
    )
    is_deleted: bool = Field(
        default=False,
        index=True,
        description="Soft delete flag",
    )


class Folder(FolderBase, table=True):
    """Folder table model"""

    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        index=True,
        description="Unique identifier for this folder",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Timestamp when the folder was created",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Timestamp when the folder was last updated",
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
        description="Timestamp when the folder was soft deleted",
    )


class FolderCreate(SQLModel):
    """Model for creating a new folder"""

    parent_id: UUID | None = Field(
        default=None,
        description="Parent folder ID",
    )
    name: str = Field(
        min_length=1,
        max_length=255,
        description="Folder name",
    )


class FolderRead(FolderBase):
    """Model for reading folder information"""

    id: UUID
    created_at: datetime
    updated_at: datetime


class FolderUpdate(SQLModel):
    """Model for updating folder information"""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="New folder name",
    )
    parent_id: UUID | None = Field(
        default=None,
        description="New parent folder ID (move folder)",
    )
    is_deleted: bool | None = Field(
        default=None,
        description="Soft delete flag",
    )
