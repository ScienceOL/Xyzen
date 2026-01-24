from datetime import datetime, timezone
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import TIMESTAMP
from sqlmodel import JSON, Column, Field, SQLModel

if TYPE_CHECKING:
    from .mcp import McpServer


class AgentScope(StrEnum):
    SYSTEM = "system"
    USER = "user"


class ConfigVisibility(StrEnum):
    """Controls whether the agent's graph_config is visible to users."""

    VISIBLE = "visible"  # Users can view graph_config
    HIDDEN = "hidden"  # graph_config is hidden from users


class ForkMode(StrEnum):
    """Controls what access forked agents get."""

    EDITABLE = "editable"  # Forked agents get visible + editable config
    LOCKED = "locked"  # Forked agents get hidden + non-editable config


class AgentBase(SQLModel):
    scope: AgentScope = Field(
        sa_column=sa.Column(
            sa.Enum(*(v.value for v in AgentScope), name="agentscope", native_enum=True),
            nullable=False,
            index=True,
        )
    )
    name: str
    description: str | None = None
    avatar: str | None = None
    tags: list[str] | None = Field(default=None, sa_column=Column(JSON))
    model: str | None = None
    temperature: float | None = None
    prompt: str | None = None
    user_id: str | None = Field(index=True, default=None, nullable=True)
    require_tool_confirmation: bool = Field(default=False)
    provider_id: UUID | None = Field(default=None, index=True)
    knowledge_set_id: UUID | None = Field(default=None, index=True)
    original_source_id: UUID | None = Field(
        default=None,
        index=True,
        description="UUID of the marketplace listing this agent was forked from",
    )
    source_version: int | None = Field(
        default=None,
        description="Version of the marketplace listing this agent was forked from",
    )
    # JSON configuration for graph-based agents
    # If None or empty, fallback to the default react system agent
    # Can include metadata.system_agent_key to use a specific system agent as base
    # Tools are configured via graph_config.tool_config.tool_filter
    graph_config: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))

    # Configuration access control
    config_visibility: ConfigVisibility = Field(
        default=ConfigVisibility.VISIBLE,
        sa_column=sa.Column(
            sa.Enum(*(v.value for v in ConfigVisibility), name="configvisibility", native_enum=True),
            nullable=False,
            server_default="visible",
        ),
        description="Whether the graph_config is visible to the user",
    )
    config_editable: bool = Field(
        default=True,
        description="Whether the user can edit graph_config",
    )


class Agent(AgentBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class AgentCreate(SQLModel):
    scope: AgentScope = AgentScope.USER
    name: str
    description: str | None = None
    avatar: str | None = None
    tags: list[str] | None = Field(default=None, sa_column=Column(JSON))
    model: str | None = None
    temperature: float | None = None
    prompt: str | None = None
    require_tool_confirmation: bool = Field(default=False)
    provider_id: UUID | None = Field(default=None, index=True)
    knowledge_set_id: UUID | None = Field(default=None)
    mcp_server_ids: list[UUID] = []
    graph_config: dict[str, Any] | None = None
    config_visibility: ConfigVisibility = ConfigVisibility.VISIBLE
    config_editable: bool = True


class AgentRead(AgentBase):
    id: UUID
    updated_at: datetime


class AgentReadWithDetails(AgentRead):
    mcp_servers: list["McpServer"] = []


class AgentUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    avatar: str | None = None
    tags: list[str] | None = None
    model: str | None = None
    temperature: float | None = None
    prompt: str | None = None
    require_tool_confirmation: bool | None = None
    provider_id: UUID | None = None
    knowledge_set_id: UUID | None = None
    mcp_server_ids: list[UUID] | None = None
    graph_config: dict[str, Any] | None = None
    config_visibility: ConfigVisibility | None = None
    config_editable: bool | None = None
