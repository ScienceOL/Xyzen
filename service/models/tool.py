import enum
from datetime import datetime
from typing import List, Optional

from sqlmodel import Column, DateTime, Field, Relationship, SQLModel, Text, UniqueConstraint, text


class ToolStatus(str, enum.Enum):
    """Enumeration for the status of a tool version."""

    BUILDING = "BUILDING"
    READY = "READY"
    FAILED = "FAILED"
    DEPRECATED = "DEPRECATED"


# ============================================================================
# Tool Models
# ============================================================================


class ToolBase(SQLModel):
    """Base model for a tool with required fields for creation."""

    user_id: str = Field(index=True, description="The user ID from authentication provider")
    name: str = Field(index=True, min_length=1, max_length=100, description="Tool name")
    description: Optional[str] = Field(default=None, description="Tool description")
    tags_json: str = Field(default="[]", description="JSON array of tags")
    is_active: bool = Field(default=True, description="Whether the tool is active")


class Tool(ToolBase, table=True):
    """Database model for a tool, inherits from ToolBase."""

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_tool_name"),)

    id: Optional[int] = Field(default=None, primary_key=True, description="Unique identifier for this tool")
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


class ToolRead(ToolBase):
    """Model for reading a tool, includes the ID and timestamps."""

    id: int = Field(description="Unique identifier for this tool")
    created_at: datetime
    updated_at: datetime


class ToolCreate(ToolBase):
    """Model for creating a tool."""

    pass


class ToolUpdate(SQLModel):
    """Model for updating a tool. All fields are optional."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100, description="Tool name")
    description: Optional[str] = Field(default=None, description="Tool description")
    tags_json: Optional[str] = Field(default=None, description="JSON array of tags")
    is_active: Optional[bool] = Field(default=None, description="Whether the tool is active")


# ============================================================================
# ToolVersion Models
# ============================================================================


class ToolVersionBase(SQLModel):
    """Base model for a tool version with required fields for creation."""

    user_id: str = Field(index=True, description="The user ID from authentication provider")
    version: int = Field(default=1, index=True, description="Version number")
    requirements: str = Field(sa_column=Column(Text), description="Python requirements.txt content")
    code_content: str = Field(sa_column=Column(Text), description="Python code content")
    status: ToolStatus = Field(default=ToolStatus.BUILDING, index=True, description="Build status")
    tool_id: int = Field(foreign_key="tool.id", description="Foreign key to tool table")


class ToolVersion(ToolVersionBase, table=True):
    """Database model for a tool version, inherits from ToolVersionBase."""

    id: Optional[int] = Field(default=None, primary_key=True, description="Unique identifier for this version")
    created_at: datetime = Field(
        default_factory=datetime.now,
        sa_column=Column(DateTime, server_default=text("CURRENT_TIMESTAMP")),
    )

    tool: Tool = Relationship(back_populates="versions")
    functions: List["ToolFunction"] = Relationship(back_populates="tool_version")


class ToolVersionRead(ToolVersionBase):
    """Model for reading a tool version, includes the ID and timestamp."""

    id: int = Field(description="Unique identifier for this version")
    created_at: datetime


class ToolVersionCreate(ToolVersionBase):
    """Model for creating a tool version."""

    pass


class ToolVersionUpdate(SQLModel):
    """Model for updating a tool version. All fields are optional."""

    version: Optional[int] = Field(default=None, description="Version number")
    requirements: Optional[str] = Field(default=None, description="Python requirements.txt content")
    code_content: Optional[str] = Field(default=None, description="Python code content")
    status: Optional[ToolStatus] = Field(default=None, description="Build status")


# ============================================================================
# ToolFunction Models
# ============================================================================


class ToolFunctionBase(SQLModel):
    """Base model for a tool function with required fields for creation."""

    user_id: str = Field(index=True, description="The user ID from authentication provider")
    function_name: str = Field(description="Name of the function")
    docstring: Optional[str] = Field(default=None, description="Function docstring")
    input_schema: str = Field(default="{}", description="JSON schema for function input")
    output_schema: str = Field(default="{}", description="JSON schema for function output")
    tool_version_id: int = Field(foreign_key="toolversion.id", description="Foreign key to tool version table")


class ToolFunction(ToolFunctionBase, table=True):
    """Database model for a tool function, inherits from ToolFunctionBase."""

    id: Optional[int] = Field(default=None, primary_key=True, description="Unique identifier for this function")

    tool_version: ToolVersion = Relationship(back_populates="functions")


class ToolFunctionRead(ToolFunctionBase):
    """Model for reading a tool function, includes the ID."""

    id: int = Field(description="Unique identifier for this function")


class ToolFunctionCreate(ToolFunctionBase):
    """Model for creating a tool function."""

    pass


class ToolFunctionUpdate(SQLModel):
    """Model for updating a tool function. All fields are optional."""

    function_name: Optional[str] = Field(default=None, description="Name of the function")
    docstring: Optional[str] = Field(default=None, description="Function docstring")
    input_schema: Optional[str] = Field(default=None, description="JSON schema for function input")
    output_schema: Optional[str] = Field(default=None, description="JSON schema for function output")
