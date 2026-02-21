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
    """Settle pending ConsumeRecords: deduct from wallet, update UserConsumeSummary,
    and bulk-mark records as success.

    This replaces the old create_consume_for_chat flow. By this point all
    individual ConsumeRecords have already been created during streaming;
    this function only handles the billing side.

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

    # Check virtual balance
    wallet = await redemption_repo.get_user_wallet(user_id)
    virtual_balance = wallet.virtual_balance if wallet else 0

    logger.info(f"Settlement for user {user_id}: amount={total_amount}, balance={virtual_balance}")

    if virtual_balance < total_amount:
        # Insufficient balance — mark records as failed
        if record_ids:
            await repo.bulk_update_consume_state(record_ids, "failed")

        from app.common.code.error_code import ErrCode

        raise ErrCode.INSUFFICIENT_BALANCE.with_messages(
            f"积分余额不足，当前余额: {virtual_balance}，需要: {total_amount}"
        )

    # Deduct from virtual balance
    await redemption_repo.deduct_wallet(user_id, total_amount)
    logger.info(f"Deducted {total_amount} from user {user_id} virtual balance")

    # Update user consumption summary
    await repo.increment_user_consume(
        user_id=user_id,
        auth_provider=auth_provider,
        amount=total_amount,
        consume_state="success",
    )

    # Bulk mark records as success
    if record_ids:
        await repo.bulk_update_consume_state(record_ids, "success")
