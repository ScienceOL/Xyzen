from typing import TYPE_CHECKING, List, Optional
from uuid import UUID, uuid4

from sqlmodel import JSON, Column, Field, ForeignKey, Relationship, SQLModel

from .links import AgentMcpServerLink
from .mcp import McpServer

if TYPE_CHECKING:
    from .sessions import Session


class AgentBase(SQLModel):
    name: str
    description: Optional[str] = None
    avatar: Optional[str] = None
    tags: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    model: Optional[str] = None
    temperature: Optional[float] = None
    prompt: Optional[str] = None
    user_id: str = Field(index=True, description="The user ID from Casdoor")
    require_tool_confirmation: bool = Field(
        default=False, description="Whether to require user confirmation for tool calls"
    )

    provider_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            ForeignKey("provider.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )


class Agent(AgentBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    mcp_servers: List["McpServer"] = Relationship(
        back_populates="agents",
        link_model=AgentMcpServerLink,
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    session: Optional["Session"] = Relationship(back_populates="agent")


class AgentCreate(AgentBase):
    mcp_server_ids: List[UUID] = []


class AgentRead(AgentBase):
    id: UUID
    mcp_servers: List["McpServer"] = []


class AgentUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    avatar: Optional[str] = None
    tags: Optional[List[str]] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    prompt: Optional[str] = None
    require_tool_confirmation: Optional[bool] = None
    provider_id: Optional[UUID] = None
    mcp_server_ids: Optional[List[UUID]] = None


Agent.model_rebuild()
McpServer.model_rebuild()
