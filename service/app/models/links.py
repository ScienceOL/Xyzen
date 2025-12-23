from uuid import UUID

from sqlmodel import Field, SQLModel


class AgentMcpServerLink(SQLModel, table=True):
    agent_id: UUID | None = Field(default=None, primary_key=True, index=True)
    mcp_server_id: UUID | None = Field(default=None, primary_key=True, index=True)


class SessionMcpServerLink(SQLModel, table=True):
    session_id: UUID | None = Field(default=None, primary_key=True, index=True)
    mcp_server_id: UUID | None = Field(default=None, primary_key=True, index=True)
