from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import TIMESTAMP, Column, Index, text
from sqlmodel import JSON, Field, SQLModel

if TYPE_CHECKING:
    from .skill_snapshot import SkillSnapshotRead


class SkillMarketplaceScope(str):
    OFFICIAL = "official"
    COMMUNITY = "community"


class SkillMarketplace(SQLModel, table=True):
    """Public listing of community skills in the marketplace."""

    __table_args__ = (
        Index(
            "uq_skillmarketplace_builtin_name_not_null",
            "builtin_name",
            unique=True,
            postgresql_where=text("builtin_name IS NOT NULL"),
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)

    # Ownership & versioning
    skill_id: UUID = Field(index=True, description="The source skill (owner's working copy)")
    active_snapshot_id: UUID = Field(index=True, description="Currently published version")
    user_id: str | None = Field(index=True, default=None, nullable=True, description="Publisher")

    # Scope & builtin tracking
    scope: str = Field(
        default="community",
        sa_column=sa.Column(
            sa.String,
            nullable=False,
            index=True,
            server_default="community",
        ),
    )
    builtin_name: str | None = Field(default=None, index=True, description="Stable name for builtin skills")

    # Author info (denormalized from auth provider at publish time)
    author_display_name: str | None = Field(default=None, description="Author display name")
    author_avatar_url: str | None = Field(default=None, description="Author avatar URL")

    # Denormalized for search & display
    name: str = Field(index=True)
    description: str | None = None
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    readme: str | None = None

    # Social stats
    likes_count: int = Field(default=0, index=True)
    forks_count: int = Field(default=0, index=True)
    views_count: int = Field(default=0)

    # Visibility control
    is_published: bool = Field(default=False, index=True)

    # Timestamps
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    first_published_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
    )


class SkillMarketplaceCreate(SQLModel):
    """Model for creating a skill marketplace listing."""

    skill_id: UUID
    active_snapshot_id: UUID
    user_id: str | None = None
    author_display_name: str | None = None
    author_avatar_url: str | None = None
    name: str
    description: str | None = None
    tags: list[str] = []
    readme: str | None = None
    scope: str = "community"
    builtin_name: str | None = None


class SkillMarketplaceRead(SQLModel):
    """Model for reading skill marketplace listing."""

    id: UUID
    skill_id: UUID
    active_snapshot_id: UUID
    user_id: str | None
    author_display_name: str | None = None
    author_avatar_url: str | None = None
    name: str
    description: str | None
    tags: list[str]
    readme: str | None
    likes_count: int
    forks_count: int
    views_count: int
    is_published: bool
    scope: str
    created_at: datetime
    updated_at: datetime
    first_published_at: datetime | None
    has_liked: bool = False


class SkillMarketplaceUpdate(SQLModel):
    """Model for updating skill marketplace listing."""

    active_snapshot_id: UUID | None = None
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    readme: str | None = None
    is_published: bool | None = None
    author_display_name: str | None = None
    author_avatar_url: str | None = None


class SkillMarketplaceReadWithSnapshot(SkillMarketplaceRead):
    """Skill marketplace listing with snapshot details."""

    snapshot: "SkillSnapshotRead"
    has_liked: bool = False
