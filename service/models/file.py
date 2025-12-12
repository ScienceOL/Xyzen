from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import JSON, TIMESTAMP, Column
from sqlmodel import Field, SQLModel


class FileBase(SQLModel):
    """Base model for file storage information"""

    user_id: str = Field(
        index=True,
        description="The user ID from authentication provider (e.g., Casdoor user ID)",
    )
    storage_key: str = Field(
        index=True,
        unique=True,
        description="Unique storage key/path in object storage",
    )
    original_filename: str = Field(
        max_length=255,
        description="Original filename when uploaded",
    )
    content_type: str = Field(
        max_length=100,
        description="MIME type of the file",
    )
    file_size: int = Field(
        ge=0,
        description="File size in bytes",
    )
    scope: str = Field(
        index=True,
        max_length=20,
        description="File scope: public, private, or generated",
    )
    category: str = Field(
        index=True,
        max_length=20,
        description="File category: images, documents, audio, or others",
    )
    file_hash: str | None = Field(
        default=None,
        max_length=64,
        description="File hash (e.g., SHA256) for deduplication",
    )
    metainfo: dict | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Additional metadata as JSON",
    )
    is_deleted: bool = Field(
        default=False,
        index=True,
        description="Soft delete flag",
    )
    message_id: UUID | None = Field(
        default=None,
        index=True,
        nullable=True,
        description="Associated message ID (null for pending/unconfirmed files)",
    )
    status: str = Field(
        default="pending",
        index=True,
        max_length=20,
        description="File status: pending, confirmed, or expired",
    )


class File(FileBase, table=True):
    """File storage table model"""

    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        index=True,
        description="Unique identifier for this file record",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Timestamp when the file was uploaded",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Timestamp when the record was last updated",
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
        description="Timestamp when the file was soft deleted",
    )


class FileCreate(FileBase):
    """Model for creating a new file record"""

    pass


class FileRead(FileBase):
    """Model for reading file information"""

    id: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class FileUpdate(SQLModel):
    """Model for updating file information"""

    original_filename: str | None = Field(
        default=None,
        max_length=255,
        description="Original filename when uploaded",
    )
    metainfo: dict | None = Field(
        default=None,
        description="Additional metadata as JSON string",
    )
    is_deleted: bool | None = Field(
        default=None,
        description="Soft delete flag",
    )
    message_id: UUID | None = Field(
        default=None,
        description="Associated message ID",
    )
    status: str | None = Field(
        default=None,
        max_length=20,
        description="File status: pending, confirmed, or expired",
    )


class FileReadWithUrl(FileRead):
    """Model for reading file information with presigned URL"""

    download_url: str | None = None
    upload_url: str | None = None
