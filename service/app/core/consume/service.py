"""Consumption service core module

Provides core business logic for consumption records, billing, and statistics.
"""

import logging
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.consume import ConsumeRecord, UserConsumeSummary
from app.repos.consume import ConsumeRepository
from app.repos.redemption import RedemptionRepository

logger = logging.getLogger(__name__)


class ConsumeService:
    """Core business logic layer for consumption service"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.consume_repo = ConsumeRepository(db)
        self.redemption_repo = RedemptionRepository(db)

    async def get_consume_record_by_id(self, record_id: UUID) -> ConsumeRecord | None:
        """Get consumption record"""
        return await self.consume_repo.get_consume_record_by_id(record_id)

    async def get_user_consume_summary(self, user_id: str) -> UserConsumeSummary | None:
        """Get user consumption summary"""
        return await self.consume_repo.get_user_consume_summary(user_id)

    async def list_user_consume_records(self, user_id: str, limit: int = 100, offset: int = 0) -> list[ConsumeRecord]:
        """Get user consumption record list"""
        return await self.consume_repo.list_consume_records_by_user(user_id, limit, offset)


async def settle_chat_records(
    db: AsyncSession,
    user_id: str,
    auth_provider: str,
    record_ids: list[UUID],
    total_amount: int,
) -> None:
    """Settle pending ConsumeRecords: deduct from wallet (best-effort), update
    UserConsumeSummary, and bulk-mark records as success.

    When the wallet balance is insufficient the function deducts as much as
    possible instead of raising an error — the conversation is never
    interrupted at settlement time.

    Args:
        db: Database session.
        user_id: User ID.
        auth_provider: Authentication provider.
        record_ids: IDs of pending ConsumeRecords to settle.
        total_amount: Total credit amount to deduct (sum of record amounts + BASE_COST).
    """
    if total_amount <= 0:
        # Nothing to bill — still mark records as success
        repo = ConsumeRepository(db)
        if record_ids:
            await repo.bulk_update_consume_state(record_ids, "success")
        return

    repo = ConsumeRepository(db)
    redemption_repo = RedemptionRepository(db)

    # Check virtual balance (get_or_create ensures new users receive welcome bonus)
    wallet = await redemption_repo.get_or_create_user_wallet(user_id)
    virtual_balance = wallet.virtual_balance

    # Best-effort: deduct as much as possible
    actual_amount = min(total_amount, max(0, virtual_balance))

    if virtual_balance < total_amount:
        logger.warning(
            "Best-effort settlement for user %s: needed=%d, available=%d, deducting=%d",
            user_id,
            total_amount,
            virtual_balance,
            actual_amount,
        )

    if actual_amount > 0:
        await redemption_repo.deduct_wallet(user_id, actual_amount)

    # Update user consumption summary with the actual amount deducted
    await repo.increment_user_consume(
        user_id=user_id,
        auth_provider=auth_provider,
        amount=actual_amount,
        consume_state="success",
    )

    # Bulk mark records as success
    if record_ids:
        await repo.bulk_update_consume_state(record_ids, "success")
