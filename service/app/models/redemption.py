from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, BigInteger
from sqlmodel import Column, Field, SQLModel


# ==================== RedemptionCode Models ====================
class RedemptionCodeBase(SQLModel):
    """Base model for redemption code with shared fields."""

    code: str = Field(unique=True, index=True, description="Unique redemption code")
    amount: int = Field(description="Virtual balance amount to credit")
    max_usage: int = Field(default=1, description="Maximum number of times this code can be used")
    current_usage: int = Field(default=0, description="Current number of times this code has been used")
    is_active: bool = Field(default=True, index=True, description="Whether this code is active")
    expires_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
        description="Expiration time (null means no expiration)",
    )
    description: str | None = Field(default=None, description="Code description or notes")
    code_type: str = Field(default="credits", description="Code type: 'credits' or 'subscription'")
    role_name: str | None = Field(default=None, description="Target subscription role name (for subscription codes)")
    duration_days: int = Field(default=30, description="Subscription duration in days (for subscription codes)")


class RedemptionCode(RedemptionCodeBase, table=True):
    """Redemption code table - defines reusable redemption codes"""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class RedemptionCodeCreate(SQLModel):
    """Schema for creating a new redemption code."""

    code: str = Field(description="Unique redemption code")
    amount: int = Field(description="Virtual balance amount to credit")
    max_usage: int = Field(default=1, description="Maximum number of times this code can be used")
    is_active: bool = Field(default=True, description="Whether this code is active")
    expires_at: datetime | None = Field(default=None, description="Expiration time (null means no expiration)")
    description: str | None = Field(default=None, description="Code description or notes")
    code_type: str = Field(default="credits", description="Code type: 'credits' or 'subscription'")
    role_name: str | None = Field(default=None, description="Target subscription role name")
    duration_days: int = Field(default=30, description="Subscription duration in days")


class RedemptionCodeRead(RedemptionCodeBase):
    """Schema for reading a redemption code, includes ID and timestamps."""

    id: UUID = Field(description="Unique identifier for this code")
    created_at: datetime = Field(description="Creation time")
    updated_at: datetime = Field(description="Update time")


class RedemptionCodeUpdate(SQLModel):
    """Schema for updating a redemption code. All fields are optional."""

    amount: int | None = Field(default=None, description="Virtual balance amount to credit")
    max_usage: int | None = Field(default=None, description="Maximum number of times this code can be used")
    is_active: bool | None = Field(default=None, description="Whether this code is active")
    expires_at: datetime | None = Field(default=None, description="Expiration time")
    description: str | None = Field(default=None, description="Code description or notes")
    code_type: str | None = Field(default=None, description="Code type: 'credits' or 'subscription'")
    role_name: str | None = Field(default=None, description="Target subscription role name")
    duration_days: int | None = Field(default=None, description="Subscription duration in days")


# ==================== RedemptionHistory Models ====================
class RedemptionHistoryBase(SQLModel):
    """Base model for redemption history with shared fields."""

    code_id: UUID = Field(index=True, description="Reference to redemption code ID")
    user_id: str = Field(index=True, description="User ID who redeemed the code")
    amount: int = Field(description="Amount credited to user")


class RedemptionHistory(RedemptionHistoryBase, table=True):
    """Redemption history table - tracks which users redeemed which codes"""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    redeemed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Time when the code was redeemed",
    )


class RedemptionHistoryCreate(RedemptionHistoryBase):
    """Schema for creating a new redemption history record."""

    pass


class RedemptionHistoryRead(RedemptionHistoryBase):
    """Schema for reading a redemption history record, includes ID and timestamp."""

    id: UUID = Field(description="Unique identifier for this history record")
    redeemed_at: datetime = Field(description="Time when the code was redeemed")


# ==================== UserWallet Models ====================


class UserWalletBase(SQLModel):
    """Base model for user wallet with shared fields."""

    user_id: str = Field(unique=True, index=True, description="User ID")
    virtual_balance: int = Field(default=0, sa_type=BigInteger, description="Current virtual balance")
    free_balance: int = Field(
        default=0, sa_type=BigInteger, description="Free credits (check-in, welcome bonus, events)"
    )
    paid_balance: int = Field(
        default=0, sa_type=BigInteger, description="Paid credits (subscription, top-up, redemption)"
    )
    earned_balance: int = Field(default=0, sa_type=BigInteger, description="Earned credits (community earnings)")
    total_credited: int = Field(default=0, sa_type=BigInteger, description="Total amount credited (audit trail)")
    total_consumed: int = Field(default=0, sa_type=BigInteger, description="Total amount consumed from virtual balance")  # noqa: E501


class UserWallet(UserWalletBase, table=True):
    """User wallet table - manages user virtual balance"""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class UserWalletCreate(SQLModel):
    """Schema for creating a new user wallet."""

    user_id: str = Field(description="User ID")
    virtual_balance: int = Field(default=0, description="Initial virtual balance")
    free_balance: int = Field(default=0, description="Initial free balance")
    paid_balance: int = Field(default=0, description="Initial paid balance")
    earned_balance: int = Field(default=0, description="Initial earned balance")
    total_credited: int = Field(default=0, description="Initial total credited")
    total_consumed: int = Field(default=0, description="Initial total consumed")


class UserWalletRead(UserWalletBase):
    """Schema for reading a user wallet, includes ID and timestamps."""

    id: UUID = Field(description="Unique identifier for this wallet")
    created_at: datetime = Field(description="Creation time")
    updated_at: datetime = Field(description="Update time")


class UserWalletUpdate(SQLModel):
    """Schema for updating a user wallet. All fields are optional."""

    virtual_balance: int | None = Field(default=None, description="Current virtual balance")
    free_balance: int | None = Field(default=None, description="Free balance")
    paid_balance: int | None = Field(default=None, description="Paid balance")
    earned_balance: int | None = Field(default=None, description="Earned balance")
    total_credited: int | None = Field(default=None, description="Total amount credited")
    total_consumed: int | None = Field(default=None, description="Total amount consumed")


# ==================== CreditLedger Models ====================


class CreditLedger(SQLModel, table=True):
    """Audit ledger for all credit transactions, tracking per-category changes."""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: str = Field(index=True, description="User ID")
    credit_type: str = Field(index=True, description="Credit category: free, paid, or earned")
    direction: str = Field(description="Transaction direction: credit or debit")
    amount: int = Field(sa_type=BigInteger, description="Transaction amount (positive)")
    balance_after: int = Field(sa_type=BigInteger, description="This credit_type balance after transaction")
    total_balance_after: int = Field(sa_type=BigInteger, description="virtual_balance after transaction")
    source: str = Field(description="Transaction source: welcome_bonus, daily_checkin, redemption_code, etc.")
    reference_id: str | None = Field(default=None, description="Optional reference ID for tracing")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class CreditLedgerRead(SQLModel):
    """Schema for reading a credit ledger entry."""

    id: UUID
    user_id: str
    credit_type: str
    direction: str
    amount: int
    balance_after: int
    total_balance_after: int
    source: str
    reference_id: str | None
    created_at: datetime
