import logging
from typing import Any
from uuid import UUID

from sqlalchemy import func
from sqlalchemy import select as sa_select
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.developer_earning import (
    DeveloperEarning,
    DeveloperWallet,
)

logger = logging.getLogger(__name__)


class DeveloperEarningRepository:
    """Data access layer for developer earnings and wallets."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # DeveloperEarning
    # ------------------------------------------------------------------

    async def create_earning(self, earning: DeveloperEarning) -> DeveloperEarning:
        self.db.add(earning)
        await self.db.flush()
        return earning

    async def list_earnings_by_developer(
        self,
        developer_user_id: str,
        marketplace_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[DeveloperEarning]:
        stmt = (
            select(DeveloperEarning)
            .where(DeveloperEarning.developer_user_id == developer_user_id)
            .order_by(col(DeveloperEarning.created_at).desc())
        )
        if marketplace_id:
            stmt = stmt.where(DeveloperEarning.marketplace_id == marketplace_id)
        stmt = stmt.offset(offset).limit(limit)
        result = await self.db.exec(stmt)
        return list(result.all())

    async def count_earnings_by_developer(
        self,
        developer_user_id: str,
        marketplace_id: UUID | None = None,
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(DeveloperEarning)
            .where(DeveloperEarning.developer_user_id == developer_user_id)
        )
        if marketplace_id:
            stmt = stmt.where(DeveloperEarning.marketplace_id == marketplace_id)
        result = await self.db.exec(stmt)
        return int(result.one() or 0)

    async def get_earnings_summary_by_agent(
        self,
        developer_user_id: str,
    ) -> list[dict[str, Any]]:
        """Aggregate earnings grouped by marketplace_id, enriched with agent name/avatar."""
        from app.models.agent_marketplace import AgentMarketplace

        stmt = (
            sa_select(
                DeveloperEarning.marketplace_id,
                DeveloperEarning.fork_mode,
                func.sum(DeveloperEarning.amount).label("total_earned"),
                func.sum(DeveloperEarning.total_consumed).label("total_consumed"),
                func.count().label("earning_count"),
                func.max(DeveloperEarning.created_at).label("last_earned_at"),
                AgentMarketplace.name.label("agent_name"),
                AgentMarketplace.avatar.label("agent_avatar"),
            )
            .outerjoin(
                AgentMarketplace,
                DeveloperEarning.marketplace_id == AgentMarketplace.id,
            )
            .where(DeveloperEarning.developer_user_id == developer_user_id)
            .group_by(
                DeveloperEarning.marketplace_id,
                DeveloperEarning.fork_mode,
                AgentMarketplace.name,
                AgentMarketplace.avatar,
            )
        )
        result = (await self.db.exec(stmt)).all()  # type: ignore[arg-type]
        return [
            {
                "marketplace_id": str(row.marketplace_id),
                "fork_mode": row.fork_mode,
                "total_earned": int(row.total_earned),
                "total_consumed": int(row.total_consumed),
                "earning_count": int(row.earning_count),
                "last_earned_at": row.last_earned_at.isoformat() if row.last_earned_at else None,
                "agent_name": row.agent_name,
                "agent_avatar": row.agent_avatar,
            }
            for row in result
        ]

    async def get_listing_earnings_stats(
        self,
        marketplace_id: UUID,
    ) -> dict[str, Any]:
        """Get total earnings stats for a single marketplace listing."""
        stmt = sa_select(
            func.coalesce(func.sum(DeveloperEarning.amount), 0).label("total_earned"),
            func.coalesce(func.sum(DeveloperEarning.total_consumed), 0).label("total_consumed"),
            func.count().label("earning_count"),
        ).where(DeveloperEarning.marketplace_id == marketplace_id)
        result = (await self.db.exec(stmt)).one()  # type: ignore[arg-type]
        return {
            "total_earned": int(result.total_earned),
            "total_consumed": int(result.total_consumed),
            "earning_count": int(result.earning_count),
        }

    # ------------------------------------------------------------------
    # DeveloperWallet
    # ------------------------------------------------------------------

    async def get_wallet(self, developer_user_id: str) -> DeveloperWallet | None:
        result = await self.db.exec(
            select(DeveloperWallet).where(DeveloperWallet.developer_user_id == developer_user_id)
        )
        return result.one_or_none()

    async def get_or_create_wallet(self, developer_user_id: str) -> DeveloperWallet:
        wallet = await self.get_wallet(developer_user_id)
        if wallet is None:
            wallet = DeveloperWallet(developer_user_id=developer_user_id)
            self.db.add(wallet)
            await self.db.flush()
            logger.info("Created developer wallet for user %s", developer_user_id)
        return wallet

    async def add_earning(self, developer_user_id: str, amount: int) -> DeveloperWallet:
        """Add earnings to developer wallet (increases available_balance + total_earned)."""
        wallet = await self.get_or_create_wallet(developer_user_id)
        wallet.available_balance += amount
        wallet.total_earned += amount
        self.db.add(wallet)
        await self.db.flush()
        return wallet

    async def withdraw(self, developer_user_id: str, amount: int) -> DeveloperWallet:
        """Withdraw from developer wallet to user wallet."""
        wallet = await self.get_or_create_wallet(developer_user_id)
        if wallet.available_balance < amount:
            raise ValueError(f"Insufficient developer balance: available={wallet.available_balance}, requested={amount}")
        wallet.available_balance -= amount
        wallet.total_withdrawn += amount
        self.db.add(wallet)
        await self.db.flush()
        return wallet
