import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import TIMESTAMP, func
from sqlmodel import Column, Field, SQLModel, Text, UniqueConstraint


class ToolStatus(str, enum.Enum):
    BUILDING = "BUILDING"
    READY = "READY"
    FAILED = "FAILED"
    DEPRECATED = "DEPRECATED"


class ToolBase(SQLModel):
    """Base model for a tool with required fields for creation."""

    user_id: str = Field(index=True, description="The user ID from authentication provider")
    name: str = Field(index=True, min_length=1, max_length=100, description="Tool name")
    description: str | None = Field(default=None, description="Tool description")
    tags_json: str = Field(default="[]", description="JSON array of tags")
    is_active: bool = Field(default=True, description="Whether the tool is active")


class Tool(ToolBase, table=True):
    """Database model for a tool, inherits from ToolBase."""

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_tool_name"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, description="Unique identifier for this tool")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class ToolRead(ToolBase):
    """Model for reading a tool, includes the ID and timestamps."""

    id: uuid.UUID = Field(description="Unique identifier for this tool")
    created_at: datetime
    updated_at: datetime


class ToolCreate(ToolBase):
    """Model for creating a tool."""

    pass


class ToolUpdate(SQLModel):
    """Model for updating a tool. All fields are optional."""

    name: str | None = Field(default=None, min_length=1, max_length=100, description="Tool name")
    description: str | None = Field(default=None, description="Tool description")
    tags_json: str | None = Field(default=None, description="JSON array of tags")
    is_active: bool | None = Field(default=None, description="Whether the tool is active")


class ToolVersionBase(SQLModel):
    """Base model for a tool version with required fields for creation."""

    user_id: str = Field(index=True, description="The user ID from authentication provider")
    version: int = Field(default=1, index=True, description="Version number")
    requirements: str = Field(sa_column=Column(Text), description="Python requirements.txt content")
    code_content: str = Field(sa_column=Column(Text), description="Python code content")
    status: ToolStatus = Field(default=ToolStatus.BUILDING, index=True, description="Build status")
    tool_id: uuid.UUID = Field(index=True, description="Reference to tool table")


class ToolVersion(ToolVersionBase, table=True):
    """Database model for a tool version, inherits from ToolVersionBase."""

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4, primary_key=True, description="Unique identifier for this version"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), server_default=func.now()),
    )


class ToolVersionRead(ToolVersionBase):
    """Model for reading a tool version, includes the ID and timestamp."""

    id: uuid.UUID = Field(description="Unique identifier for this version")
    created_at: datetime


class ToolVersionCreate(ToolVersionBase):
    """Model for creating a tool version."""

    pass


class ToolVersionUpdate(SQLModel):
    """Model for updating a tool version. All fields are optional."""

    version: int | None = Field(default=None, description="Version number")
    requirements: str | None = Field(default=None, description="Python requirements.txt content")
    code_content: str | None = Field(default=None, description="Python code content")
    status: ToolStatus | None = Field(default=None, description="Build status")


class ToolFunctionBase(SQLModel):
    """Base model for a tool function with required fields for creation."""

    user_id: str = Field(index=True, description="The user ID from authentication provider")
    function_name: str = Field(description="Name of the function")
    docstring: str | None = Field(default=None, description="Function docstring")
    input_schema: str = Field(default="{}", description="JSON schema for function input")
    output_schema: str = Field(default="{}", description="JSON schema for function output")
    tool_version_id: uuid.UUID = Field(index=True, description="Reference to tool version table")


class ToolFunction(ToolFunctionBase, table=True):
    """Database model for a tool function, inherits from ToolFunctionBase."""

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4, primary_key=True, description="Unique identifier for this function"
    )


class ToolFunctionRead(ToolFunctionBase):
    """Model for reading a tool function, includes the ID."""

    id: uuid.UUID = Field(description="Unique identifier for this function")


class ToolFunctionCreate(ToolFunctionBase):
    """Model for creating a tool function."""

    pass


class ToolFunctionUpdate(SQLModel):
    """Model for updating a tool function. All fields are optional."""

    function_name: str | None = Field(default=None, description="Name of the function")
    docstring: str | None = Field(default=None, description="Function docstring")
    input_schema: str | None = Field(default=None, description="JSON schema for function input")
    output_schema: str | None = Field(default=None, description="JSON schema for function output")
