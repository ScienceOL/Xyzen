from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Column
from sqlmodel import JSON, Field, SQLModel

if TYPE_CHECKING:
    from .agent_snapshot import AgentSnapshotRead


class AgentMarketplace(SQLModel, table=True):
    """Public listing of community agents"""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)

    # Ownership & versioning
    agent_id: UUID = Field(index=True, description="The source agent (owner's working copy)")
    active_snapshot_id: UUID = Field(index=True, description="Currently published version")
    user_id: str = Field(index=True, description="Publisher")

    # Denormalized for search & display
    name: str = Field(index=True)
    description: str | None = None
    avatar: str | None = None
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


class AgentMarketplaceCreate(SQLModel):
    """Model for creating a marketplace listing"""

    agent_id: UUID
    active_snapshot_id: UUID
    user_id: str
    name: str
    description: str | None = None
    avatar: str | None = None
    tags: list[str] = []
    readme: str | None = None


class AgentMarketplaceRead(SQLModel):
    """Model for reading marketplace listing"""

    id: UUID
    agent_id: UUID
    active_snapshot_id: UUID
    user_id: str
    name: str
    description: str | None
    avatar: str | None
    tags: list[str]
    readme: str | None
    likes_count: int
    forks_count: int
    views_count: int
    is_published: bool
    created_at: datetime
    updated_at: datetime
    first_published_at: datetime | None
    has_liked: bool = False  # Whether current user has liked this listing


class AgentMarketplaceUpdate(SQLModel):
    """Model for updating marketplace listing"""

    active_snapshot_id: UUID | None = None
    name: str | None = None
    description: str | None = None
    avatar: str | None = None
    tags: list[str] | None = None
    readme: str | None = None
    is_published: bool | None = None


class AgentMarketplaceReadWithSnapshot(AgentMarketplaceRead):
    """Marketplace listing with snapshot details"""

    snapshot: "AgentSnapshotRead"
    has_liked: bool = False  # Whether current user has liked this listing
