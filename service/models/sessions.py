from typing import TYPE_CHECKING, List
from uuid import UUID

from sqlmodel import Field, Relationship, SQLModel

from .topics import Topic, TopicRead

if TYPE_CHECKING:
    from .agents import Agent


class SessionBase(SQLModel):
    """
    Base model for sessions.
    """

    name: str
    description: str | None = None
    is_active: bool = True
    username: str = Field(index=True, description="The username from Casdoor")
    agent_id: UUID = Field(foreign_key="agent.id", index=True, description="The agent associated with this session")


class Session(SessionBase, table=True):
    id: UUID = Field(default=None, primary_key=True, index=True)

    topics: List["Topic"] = Relationship(back_populates="session", sa_relationship_kwargs={"lazy": "selectin"})
    agent: "Agent" = Relationship(back_populates="sessions")


class SessionCreate(SessionBase):
    agent_id: UUID


class SessionRead(SessionBase):
    id: UUID
    topics: List["TopicRead"] = []


class SessionUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


TopicRead.model_rebuild()  # Rebuild to resolve forward references
