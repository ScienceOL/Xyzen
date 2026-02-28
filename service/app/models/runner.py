from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import Column, Field, SQLModel


class RunnerBase(SQLModel):
    name: str = Field(max_length=255, description="Human-readable runner name")
    is_active: bool = Field(default=True, description="Whether the runner token is enabled")


class Runner(RunnerBase, table=True):
    __tablename__ = "runners"  # type: ignore

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: str = Field(index=True, description="Owning user ID")
    token_hash: str = Field(unique=True, description="SHA-256 hash of the runner token")
    token_prefix: str = Field(max_length=8, description="First 8 chars of token for display")
    last_connected_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
    )
    os_info: str | None = Field(default=None, max_length=255, description="e.g. darwin/arm64")
    work_dir: str | None = Field(default=None, max_length=1024, description="Reported working directory")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class RunnerRead(RunnerBase):
    id: UUID
    user_id: str
    token_prefix: str
    last_connected_at: datetime | None
    os_info: str | None
    work_dir: str | None
    created_at: datetime
    updated_at: datetime
    is_online: bool = False


class RunnerUpdate(SQLModel):
    name: str | None = None
    is_active: bool | None = None
