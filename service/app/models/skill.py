from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import TIMESTAMP
from sqlmodel import JSON, Column, Field, SQLModel


class SkillScope(StrEnum):
    BUILTIN = "builtin"
    USER = "user"


class SkillBase(SQLModel):
    name: str = Field(index=True, max_length=64)
    description: str = Field(max_length=1024)
    scope: SkillScope = Field(
        sa_column=sa.Column(
            sa.Enum(*(v.value for v in SkillScope), name="skillscope", native_enum=True),
            nullable=False,
            index=True,
        )
    )
    user_id: str | None = Field(index=True, default=None, nullable=True)
    license: str | None = None
    compatibility: str | None = None
    metadata_json: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    # OSS folder prefix for this skill package (one skill = one folder).
    resource_prefix: str | None = Field(default=None, index=True, max_length=512)


class Skill(SkillBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class SkillCreate(SQLModel):
    name: str
    description: str
    scope: SkillScope = SkillScope.USER
    license: str | None = None
    compatibility: str | None = None
    metadata_json: dict[str, Any] | None = None
    resource_prefix: str | None = None


class SkillRead(SkillBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class SkillUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    license: str | None = None
    compatibility: str | None = None
    metadata_json: dict[str, Any] | None = None
    resource_prefix: str | None = None


class AgentSkillLink(SQLModel, table=True):
    agent_id: UUID | None = Field(default=None, primary_key=True, index=True)
    skill_id: UUID | None = Field(default=None, primary_key=True, index=True)
    enabled: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
