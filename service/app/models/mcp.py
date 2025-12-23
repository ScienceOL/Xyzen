import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlmodel import JSON, Column, Field, SQLModel


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


class McpServerCreate(SQLModel):
    name: str
    description: str | None = None
    url: str
    token: str


class McpServerUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    url: str | None = None
    token: str | None = None
    status: str | None = None
