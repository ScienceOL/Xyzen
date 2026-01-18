import hashlib
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, TIMESTAMP
from sqlmodel import Column, Field, SQLModel

if TYPE_CHECKING:
    from .topic import TopicRead

from app.schemas.model_tier import ModelTier


def builtin_agent_id_to_uuid(agent_id: str) -> UUID:
    """
    Convert a builtin agent string ID to a deterministic UUID.

    This allows storing builtin agent IDs in the database UUID field
    while maintaining consistency.

    Args:
        agent_id: Builtin agent ID (e.g., "builtin_scientific_figure_generator")

    Returns:
        Deterministic UUID based on the agent ID
    """
    # Create a deterministic UUID from the string using SHA256 hash
    hash_bytes = hashlib.sha256(agent_id.encode("utf-8")).digest()[:16]
    return UUID(bytes=hash_bytes)


def is_builtin_agent_uuid(agent_uuid: UUID, agent_id: str) -> bool:
    """
    Check if a UUID corresponds to a specific builtin agent ID.

    Args:
        agent_uuid: The UUID to check
        agent_id: The builtin agent string ID to compare against

    Returns:
        True if the UUID matches the builtin agent ID
    """
    return agent_uuid == builtin_agent_id_to_uuid(agent_id)


def uuid_to_builtin_agent_id(agent_uuid: UUID) -> str | None:
    """
    Convert a UUID back to a builtin agent string ID if it matches any registered builtin agent.

    Args:
        agent_uuid: The UUID to check

    Returns:
        The original builtin agent string ID if found, None otherwise
    """
    try:
        from app.agents.builtin import list_builtin_keys

        # Check all registered builtin agents
        for agent_name in list_builtin_keys():
            builtin_agent_id = f"builtin_{agent_name}"
            if builtin_agent_id_to_uuid(builtin_agent_id) == agent_uuid:
                return builtin_agent_id
        return None
    except Exception:
        return None


class SessionBase(SQLModel):
    name: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = True
    agent_id: UUID | None = Field(default=None, index=True)
    user_id: str = Field(index=True)
    provider_id: UUID | None = Field(default=None, description="If set, overrides the agent's provider")
    model: str | None = Field(default=None, description="If set, overrides the agent's model")
    model_tier: ModelTier | None = Field(default=None, description="User-selected model tier for simplified selection")
    knowledge_set_id: UUID | None = Field(
        default=None,
        index=True,
        description="Session-level knowledge set override. If set, overrides the agent's knowledge_set_id for this session.",
    )
    avatar: str | None = Field(
        default=None,
        max_length=500,
        description="Session-specific avatar URL or DiceBear seed (e.g., 'dicebear:adventurer:seed123' or full URL)",
    )
    spatial_layout: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Optional JSON blob for spatial UI layout (e.g., agent node positions, widget sizes)",
    )


class Session(SessionBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class SessionCreate(SQLModel):
    name: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = True
    agent_id: str | UUID | None = Field(default=None)
    provider_id: UUID | None = None
    model: str | None = None
    model_tier: ModelTier | None = None
    knowledge_set_id: UUID | None = None
    avatar: str | None = None
    spatial_layout: dict[str, Any] | None = None


class SessionRead(SessionBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class SessionReadWithTopics(SessionBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    topics: list["TopicRead"] = []


class SessionUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    provider_id: UUID | None = None
    model: str | None = None
    model_tier: ModelTier | None = None
    knowledge_set_id: UUID | None = None
    avatar: str | None = None
    spatial_layout: dict[str, Any] | None = None
