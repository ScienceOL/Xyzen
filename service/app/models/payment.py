"""Payment order models for tracking payment transactions."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import Column, Field, SQLModel


class PaymentOrderBase(SQLModel):
    """Base model for payment orders with shared fields."""

    user_id: str = Field(index=True, description="User who initiated the payment")
    order_type: str = Field(description="Order type: subscription or topup")
    plan_name: str = Field(default="", description="Subscription plan name (e.g. standard, professional, ultra)")
    amount: int = Field(description="Payment amount in minor units (cents/fen)")
    currency: str = Field(default="CNY", description="Currency code (CNY, USD)")
    credits_amount: int = Field(default=0, description="Credits to grant upon fulfillment")
    duration_days: int = Field(default=30, description="Subscription duration in days")
    payment_method: str = Field(default="alipaycn", description="Payment method (alipaycn, wechatpay, card)")
    status: str = Field(default="pending", description="Order status: pending, succeeded, failed, expired")
    airwallex_intent_id: str = Field(default="", description="Airwallex PaymentIntent ID")
    qr_code_url: str = Field(default="", description="QR code URL for scan-to-pay")
    fulfilled: bool = Field(default=False, description="Whether credits/subscription have been granted")
    fulfilled_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
        description="When fulfillment occurred",
    )


class PaymentOrder(PaymentOrderBase, table=True):
    """Payment order table - tracks every payment transaction."""

    __tablename__ = "payment_orders"  # type: ignore

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class PaymentOrderRead(PaymentOrderBase):
    """Schema for reading a payment order."""

    id: UUID
    created_at: datetime
    updated_at: datetime


class PaymentOrderCreate(SQLModel):
    """Schema for creating a payment order."""

    user_id: str
    order_type: str
    plan_name: str = ""
    amount: int
    currency: str = "CNY"
    credits_amount: int = 0
    duration_days: int = 30
    payment_method: str = "alipaycn"
