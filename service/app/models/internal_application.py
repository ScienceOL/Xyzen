"""Internal application models for beta internal access requests."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import Column, Field, SQLModel

from sqlalchemy.dialects.postgresql import JSONB


class InternalApplicationBase(SQLModel):
    """Base model for internal application with shared fields."""

    user_id: str = Field(index=True, description="User ID (required)")
    company_name: str = Field(description="Company name")
    company_email: str = Field(description="Company email")
    real_name: str = Field(description="Applicant real name")
    reason: str = Field(description="Reason for application")
    application_items: list[str] = Field(
        sa_column=Column(JSONB, nullable=False),
        description="List of application items (e.g. subscription, credits, sandbox, model_access)",
    )


class InternalApplication(InternalApplicationBase, table=True):
    """Internal application record table."""

    __tablename__ = "internal_applications"  # type: ignore

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    status: str = Field(default="pending", description="Application status")
    serial_number: str = Field(unique=True, description="Unique serial number (XYZEN-YYYYMMDD-XXXXXXXX)")
    certificate_token: str = Field(description="JWT certificate token")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class InternalApplicationCreate(SQLModel):
    """Schema for creating an internal application."""

    company_name: str
    company_email: str
    real_name: str
    reason: str
    application_items: list[str]


class InternalApplicationRead(InternalApplicationBase):
    """Schema for reading an internal application."""

    id: UUID
    status: str
    serial_number: str
    certificate_token: str
    created_at: datetime
    updated_at: datetime
