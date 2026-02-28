"""Deployment model for Settler persistent deployments."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import Column, Field, SQLModel


class DeploymentBase(SQLModel):
    """Shared fields for deployment records."""

    port: int = Field(description="Port the deployed service listens on")
    start_command: str = Field(description="Command used to start the service")
    source_dir: str = Field(description="Source directory copied from sandbox")
    status: str = Field(default="creating", description="creating | running | stopped | failed | deleted")
    url: str = Field(default="", description="Persistent public URL")


class Deployment(DeploymentBase, table=True):
    """Settler deployment record stored in DB."""

    __tablename__ = "deployments"  # type: ignore

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: str = Field(index=True, description="Owning user ID")
    session_id: str = Field(index=True, description="Source chat session ID")
    sandbox_id: str = Field(description="Daytona workspace ID for this deployment")

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class DeploymentRead(DeploymentBase):
    """API response schema."""

    id: UUID
    user_id: str
    session_id: str
    sandbox_id: str
    created_at: datetime
    updated_at: datetime


class DeploymentCreate(SQLModel):
    """Internal creation schema (not exposed via API — deployments are created by the tool)."""

    user_id: str
    session_id: str
    sandbox_id: str
    port: int
    start_command: str
    source_dir: str
    status: str = "creating"
    url: str = ""
