import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlmodel import JSON, Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .agent import Agent

from .links import AgentMcpServerLink


class MCPServerBase(SQLModel):

    user_id: str = Field(default=None, index=True, description="The user ID of mcp server owner")
    name: str = Field(index=True)
    description: Optional[str] = Field(default=None)
    url: str
    token: str
    status: str = Field(default="unknown", index=True)
    tools: Optional[List[Dict[str, Any]]] = Field(default=None, sa_column=Column(JSON))
    last_checked_at: Optional[datetime.datetime] = Field(default=None)


class McpServer(MCPServerBase, table=True):
    id: UUID = Field(default_factory=uuid4, index=True, primary_key=True)

    agents: List["Agent"] = Relationship(back_populates="mcp_servers", link_model=AgentMcpServerLink)


class McpServerCreate(SQLModel):
    """Schema for creating a new MCP server"""

    name: str
    description: Optional[str] = None
    url: str
    token: str


class McpServerUpdate(SQLModel):
    """Schema for updating an existing MCP server - all fields optional for partial updates"""

    name: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    token: Optional[str] = None
    status: Optional[str] = None
