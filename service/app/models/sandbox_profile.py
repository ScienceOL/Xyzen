"""Per-user sandbox configuration profile."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import Column, Field, SQLModel


class SandboxProfileBase(SQLModel):
    """Shared fields for sandbox profile."""

    # Resources (None = use global default)
    cpu: int | None = Field(default=None, description="CPU cores per sandbox")
    memory: int | None = Field(default=None, description="Memory in GiB per sandbox")
    disk: int | None = Field(default=None, description="Disk in GiB per sandbox")

    # Lifecycle
    auto_stop_minutes: int | None = Field(default=None, description="Auto-stop after inactivity (minutes)")
    auto_delete_minutes: int | None = Field(default=None, description="Auto-delete after stopped (minutes)")

    # Runtime
    timeout: int | None = Field(default=None, description="Command execution timeout (seconds)")
    image: str | None = Field(default=None, description="Docker image override")


class SandboxProfile(SandboxProfileBase, table=True):
    """Per-user sandbox configuration stored in DB."""

    __tablename__ = "sandbox_profiles"  # type: ignore

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: str = Field(index=True, unique=True, description="Owning user ID")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class SandboxProfileRead(SandboxProfileBase):
    """API response schema."""

    id: UUID
    user_id: str
    created_at: datetime
    updated_at: datetime


class SandboxProfileUpdate(SQLModel):
    """API request schema — all fields optional, None clears back to default."""

    cpu: int | None = None
    memory: int | None = None
    disk: int | None = None
    auto_stop_minutes: int | None = None
    auto_delete_minutes: int | None = None
    timeout: int | None = None
    image: str | None = None
