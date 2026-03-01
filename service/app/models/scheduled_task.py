from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import TIMESTAMP, Index
from sqlmodel import JSON, Column, Field, SQLModel


class ScheduledTaskBase(SQLModel):
    agent_id: UUID = Field(index=True)
    session_id: UUID | None = Field(default=None)
    topic_id: UUID | None = Field(default=None)
    prompt: str = Field(max_length=10000)
    schedule_type: str = Field(
        sa_column=sa.Column(sa.String, nullable=False),
        description="once | daily | weekly | cron",
    )
    cron_expression: str | None = Field(default=None)
    scheduled_at: datetime = Field(
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    timezone: str = Field(default="UTC")
    celery_task_id: str | None = Field(default=None)
    status: str = Field(
        default="active",
        sa_column=sa.Column(sa.String, nullable=False, server_default="active", index=True),
        description="active | paused | completed | failed | cancelled",
    )
    max_runs: int | None = Field(default=None)
    run_count: int = Field(default=0)
    last_run_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
    )
    last_error: str | None = Field(default=None)
    metadata_: dict[str, Any] | None = Field(default=None, sa_column=Column("metadata", JSON))
    user_id: str = Field(index=True)


class ScheduledTask(ScheduledTaskBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )

    __table_args__ = (Index("ix_scheduledtask_status_scheduled_at", "status", "scheduled_at"),)


class ScheduledTaskCreate(SQLModel):
    agent_id: UUID
    session_id: UUID | None = None
    topic_id: UUID | None = None
    prompt: str = Field(max_length=10000)
    schedule_type: str
    cron_expression: str | None = None
    scheduled_at: datetime
    timezone: str = "UTC"
    max_runs: int | None = None
    metadata_: dict[str, Any] | None = Field(default=None, alias="metadata")


class ScheduledTaskRead(ScheduledTaskBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class ScheduledTaskUpdate(SQLModel):
    prompt: str | None = None
    schedule_type: str | None = None
    cron_expression: str | None = None
    scheduled_at: datetime | None = None
    timezone: str | None = None
    status: str | None = None
    max_runs: int | None = None
    metadata_: dict[str, Any] | None = Field(default=None, alias="metadata")
