import sqlalchemy as sa
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Column
from sqlmodel import JSON, Field, SQLModel


class SkillSnapshot(SQLModel, table=True):
    """Immutable version history of skill configurations."""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    skill_id: UUID = Field(index=True, description="Original skill this snapshot belongs to")
    version: int = Field(description="Monotonic version number (1, 2, 3...)")

    # Full SKILL.md content
    skill_md_content: str = Field(
        sa_column=Column(sa.Text, nullable=False),
        description="Full SKILL.md content at snapshot time",
    )

    # Resource manifest: [{path, size_bytes, content_hash}]
    resource_manifest: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Snapshot of resource files: [{path, size_bytes, content_hash}]",
    )

    # Metadata from SKILL.md frontmatter (named skill_metadata to avoid clash with DeclarativeMeta.metadata)
    skill_metadata: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Skill metadata: {name, description, license, compatibility}",
    )

    commit_message: str = Field(description="Change description from publisher")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class SkillSnapshotCreate(SQLModel):
    """Model for creating a new skill snapshot."""

    skill_id: UUID
    skill_md_content: str
    resource_manifest: list[dict[str, Any]] = []
    skill_metadata: dict[str, Any] = {}
    commit_message: str


class SkillSnapshotRead(SQLModel):
    """Model for reading skill snapshot information."""

    id: UUID
    skill_id: UUID
    version: int
    skill_md_content: str
    resource_manifest: list[dict[str, Any]]
    skill_metadata: dict[str, Any]
    commit_message: str
    created_at: datetime
