import logging
from datetime import datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from typing import cast

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

        e = DeveloperEarning.__table__
        m = AgentMarketplace.__table__

        stmt = (
            sa_select(
                e.c.marketplace_id,
                e.c.fork_mode,
                func.sum(e.c.amount).label("total_earned"),
                func.sum(e.c.total_consumed).label("total_consumed"),
                func.count().label("earning_count"),
                func.max(e.c.created_at).label("last_earned_at"),
                m.c.name.label("agent_name"),
                m.c.avatar.label("agent_avatar"),
            )
            .select_from(e)
            .outerjoin(m, e.c.marketplace_id == m.c.id)
            .where(e.c.developer_user_id == developer_user_id)
            .group_by(
                e.c.marketplace_id,
                e.c.fork_mode,
                m.c.name,
                m.c.avatar,
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
        e = DeveloperEarning.__table__
        stmt = sa_select(
            func.coalesce(func.sum(e.c.amount), 0).label("total_earned"),
            func.coalesce(func.sum(e.c.total_consumed), 0).label("total_consumed"),
            func.count().label("earning_count"),
        ).where(e.c.marketplace_id == marketplace_id)
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
            raise ValueError(
                f"Insufficient developer balance: available={wallet.available_balance}, requested={amount}"
            )
        wallet.available_balance -= amount
        wallet.total_withdrawn += amount
        self.db.add(wallet)
        await self.db.flush()
        return wallet

    # ------------------------------------------------------------------
    # Admin queries
    # ------------------------------------------------------------------

    async def admin_get_total_earnings_stats(self) -> dict[str, Any]:
        """Aggregate total developer earnings stats."""
        stmt = sa_select(
            func.coalesce(func.sum(DeveloperEarning.amount), 0).label("total_earned"),
            func.coalesce(func.sum(DeveloperEarning.total_consumed), 0).label("total_consumed"),
            func.count(func.distinct(DeveloperEarning.developer_user_id)).label("unique_developers"),
        )
        result = (await self.db.exec(stmt)).one()  # type: ignore[arg-type]
        return {
            "total_earned": int(result.total_earned),
            "total_consumed": int(result.total_consumed),
            "unique_developers": int(result.unique_developers),
        }

    async def admin_get_earnings_heatmap(
        self,
        year: int,
        tz: str = "UTC",
        subscription_tier: str | None = None,
    ) -> list[dict[str, Any]]:
        """Daily earnings heatmap for an entire year."""
        from datetime import timezone as tz_module

        zone = ZoneInfo(tz)
        start_local = datetime(year, 1, 1, tzinfo=zone)
        end_local = datetime(year, 12, 31, 23, 59, 59, 999999, tzinfo=zone)
        start_utc = start_local.astimezone(tz_module.utc)
        end_utc = end_local.astimezone(tz_module.utc)

        date_expr = func.to_char(func.timezone(tz, DeveloperEarning.created_at), "YYYY-MM-DD")

        stmt = sa_select(
            date_expr.label("date"),
            func.coalesce(func.sum(col(DeveloperEarning.amount)), 0).label("total_earned"),
            func.coalesce(func.sum(col(DeveloperEarning.total_consumed)), 0).label("total_consumed"),
            func.count().label("earning_count"),
        ).where(
            col(DeveloperEarning.created_at) >= start_utc,
            col(DeveloperEarning.created_at) <= end_utc,
        )

        if subscription_tier:
            from app.models.subscription import SubscriptionRole, UserSubscription

            tier_subq = (
                sa_select(col(UserSubscription.user_id))
                .join(SubscriptionRole, col(UserSubscription.role_id) == col(SubscriptionRole.id))
                .where(col(SubscriptionRole.name) == subscription_tier)
            ).subquery()
            stmt = stmt.where(col(DeveloperEarning.developer_user_id).in_(sa_select(tier_subq.c.user_id)))

        stmt = stmt.group_by(date_expr).order_by(date_expr)

        rows = (await self.db.exec(stmt)).all()  # type: ignore[arg-type]
        return [
            {
                "date": str(r.date),
                "total_earned": int(r.total_earned),
                "total_consumed": int(r.total_consumed),
                "earning_count": int(r.earning_count),
            }
            for r in rows
        ]

    async def admin_get_top_agents(
        self,
        sort_by: str = "earned",
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Top agents by earnings, joined with marketplace info."""
        from app.models.agent_marketplace import AgentMarketplace

        order_col = (
            func.sum(col(DeveloperEarning.amount))
            if sort_by == "earned"
            else func.sum(col(DeveloperEarning.total_consumed))
        )

        stmt = (
            sa_select(
                col(DeveloperEarning.marketplace_id).label("id"),
                col(AgentMarketplace.name),
                col(AgentMarketplace.avatar),
                col(AgentMarketplace.scope),
                col(AgentMarketplace.is_published),
                col(AgentMarketplace.forks_count),
                col(AgentMarketplace.views_count),
                col(AgentMarketplace.likes_count),
                col(AgentMarketplace.author_display_name),
                func.coalesce(func.sum(col(DeveloperEarning.amount)), 0).label("total_earned"),
                func.coalesce(func.sum(col(DeveloperEarning.total_consumed)), 0).label("total_consumed"),
            )
            .outerjoin(AgentMarketplace, col(DeveloperEarning.marketplace_id) == col(AgentMarketplace.id))
            .group_by(
                col(DeveloperEarning.marketplace_id),
                col(AgentMarketplace.name),
                col(AgentMarketplace.avatar),
                col(AgentMarketplace.scope),
                col(AgentMarketplace.is_published),
                col(AgentMarketplace.forks_count),
                col(AgentMarketplace.views_count),
                col(AgentMarketplace.likes_count),
                col(AgentMarketplace.author_display_name),
            )
            .order_by(order_col.desc())
            .limit(limit)
        )

        rows = (await self.db.exec(stmt)).all()  # type: ignore[arg-type]
        return [
            {
                "id": str(r.id),
                "name": r.name,
                "avatar": r.avatar,
                "scope": r.scope,
                "is_published": r.is_published,
                "forks_count": r.forks_count or 0,
                "views_count": r.views_count or 0,
                "likes_count": r.likes_count or 0,
                "total_earned": int(r.total_earned),
                "total_consumed": int(r.total_consumed),
                "author_display_name": r.author_display_name,
            }
            for r in rows
        ]

    async def admin_get_top_developers(
        self,
        year: int,
        tz: str = "UTC",
        date: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Top developers by total earnings, with wallet info and subscription tier."""
        from datetime import datetime as dt
        from datetime import timezone as tz_module

        zone = ZoneInfo(tz)

        if date:
            day = dt.strptime(date, "%Y-%m-%d").replace(tzinfo=zone)
            start_utc = day.astimezone(tz_module.utc)
            end_utc = day.replace(hour=23, minute=59, second=59, microsecond=999999).astimezone(tz_module.utc)
        else:
            start_utc = dt(year, 1, 1, tzinfo=zone).astimezone(tz_module.utc)
            end_utc = dt(year, 12, 31, 23, 59, 59, 999999, tzinfo=zone).astimezone(tz_module.utc)

        stmt = (
            sa_select(
                col(DeveloperEarning.developer_user_id),
                func.coalesce(func.sum(col(DeveloperEarning.amount)), 0).label("total_earned"),
                func.coalesce(func.sum(col(DeveloperEarning.total_consumed)), 0).label("total_consumed"),
                func.count().label("earning_count"),
                func.count(func.distinct(col(DeveloperEarning.marketplace_id))).label("listing_count"),
                func.coalesce(col(DeveloperWallet.available_balance), 0).label("available_balance"),
            )
            .where(
                col(DeveloperEarning.created_at) >= start_utc,
                col(DeveloperEarning.created_at) <= end_utc,
            )
            .outerjoin(
                DeveloperWallet,
                col(DeveloperEarning.developer_user_id) == col(DeveloperWallet.developer_user_id),
            )
            .group_by(
                col(DeveloperEarning.developer_user_id),
                col(DeveloperWallet.available_balance),
            )
            .order_by(func.sum(col(DeveloperEarning.amount)).desc())
            .limit(limit)
        )

        rows = (await self.db.exec(stmt)).all()  # type: ignore[arg-type]
        results: list[dict[str, Any]] = [
            {
                "developer_user_id": str(r.developer_user_id),
                "total_earned": int(r.total_earned),
                "total_consumed": int(r.total_consumed),
                "earning_count": int(r.earning_count),
                "listing_count": int(r.listing_count),
                "available_balance": int(r.available_balance),
            }
            for r in rows
        ]

        # Batch-fetch subscription tiers for result developers
        if results:
            from app.models.subscription import SubscriptionRole, UserSubscription

            user_ids = [r["developer_user_id"] for r in results]
            sub_stmt = (
                sa_select(
                    col(UserSubscription.user_id),
                    col(SubscriptionRole.name).label("subscription_tier"),
                )
                .join(SubscriptionRole, col(UserSubscription.role_id) == col(SubscriptionRole.id), isouter=True)
                .where(col(UserSubscription.user_id).in_(user_ids))
            )
            sub_rows = (await self.db.exec(cast(Any, sub_stmt))).all()
            tier_map = {str(sr.user_id): str(sr.subscription_tier) for sr in sub_rows if sr.subscription_tier}
            for r in results:
                r["subscription_tier"] = tier_map.get(r["developer_user_id"], "free")

        return results

    async def admin_get_developer_agents(
        self,
        developer_user_id: str,
    ) -> list[dict[str, Any]]:
        """Get all agents for a developer with earnings and marketplace info."""
        from app.models.agent_marketplace import AgentMarketplace

        stmt = (
            sa_select(
                col(DeveloperEarning.marketplace_id),
                col(AgentMarketplace.name),
                col(AgentMarketplace.avatar),
                col(AgentMarketplace.scope),
                col(AgentMarketplace.is_published),
                col(AgentMarketplace.forks_count),
                col(AgentMarketplace.views_count),
                col(AgentMarketplace.likes_count),
                func.coalesce(func.sum(col(DeveloperEarning.amount)), 0).label("total_earned"),
                func.coalesce(func.sum(col(DeveloperEarning.total_consumed)), 0).label("total_consumed"),
                func.count().label("earning_count"),
            )
            .outerjoin(
                AgentMarketplace,
                col(DeveloperEarning.marketplace_id) == col(AgentMarketplace.id),
            )
            .where(col(DeveloperEarning.developer_user_id) == developer_user_id)
            .group_by(
                col(DeveloperEarning.marketplace_id),
                col(AgentMarketplace.name),
                col(AgentMarketplace.avatar),
                col(AgentMarketplace.scope),
                col(AgentMarketplace.is_published),
                col(AgentMarketplace.forks_count),
                col(AgentMarketplace.views_count),
                col(AgentMarketplace.likes_count),
            )
            .order_by(func.sum(col(DeveloperEarning.amount)).desc())
        )

        rows = (await self.db.exec(stmt)).all()  # type: ignore[arg-type]
        return [
            {
                "marketplace_id": str(r.marketplace_id),
                "name": r.name,
                "avatar": r.avatar,
                "scope": r.scope,
                "is_published": r.is_published,
                "forks_count": r.forks_count or 0,
                "views_count": r.views_count or 0,
                "likes_count": r.likes_count or 0,
                "total_earned": int(r.total_earned),
                "total_consumed": int(r.total_consumed),
                "earning_count": int(r.earning_count),
            }
            for r in rows
        ]
