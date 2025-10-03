import enum
from datetime import datetime
from typing import List, Optional

from sqlmodel import Column, DateTime, Field, Relationship, SQLModel, Text, text


class ToolStatus(str, enum.Enum):
    """Enumeration for the status of a tool version."""

    BUILDING = "BUILDING"
    READY = "READY"
    FAILED = "FAILED"
    DEPRECATED = "DEPRECATED"


class Tool(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    description: Optional[str] = Field(default=None)
    tags_json: str = Field(default="[]")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=datetime.now,
        sa_column=Column(DateTime, server_default=text("CURRENT_TIMESTAMP")),
    )
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column=Column(
            DateTime,
            server_default=text("CURRENT_TIMESTAMP"),
            onupdate=text("CURRENT_TIMESTAMP"),
        ),
    )

    versions: List["ToolVersion"] = Relationship(back_populates="tool")


class ToolVersion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    version: int = Field(default=1, index=True)
    requirements: str = Field(sa_column=Column(Text))
    code_content: str = Field(sa_column=Column(Text))
    status: ToolStatus = Field(default=ToolStatus.BUILDING, index=True)
    created_at: datetime = Field(
        default_factory=datetime.now,
        sa_column=Column(DateTime, server_default=text("CURRENT_TIMESTAMP")),
    )

    tool_id: int = Field(foreign_key="tool.id")
    tool: "Tool" = Relationship(back_populates="versions")

    functions: List["ToolFunction"] = Relationship(back_populates="tool_version")


class ToolFunction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    function_name: str
    docstring: Optional[str] = Field(default=None)
    input_schema: str = Field(default="{}")
    output_schema: str = Field(default="{}")

    tool_version_id: int = Field(foreign_key="toolversion.id")
    tool_version: "ToolVersion" = Relationship(back_populates="functions")
