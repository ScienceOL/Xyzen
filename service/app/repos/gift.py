"""Gift campaign repository for managing campaigns and claims."""

import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.gift import GiftCampaign, GiftClaim, GiftClaimCreate

logger = logging.getLogger(__name__)


class GiftRepository:
    """Gift campaign data access layer."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_active_campaigns(self, now: datetime) -> list[GiftCampaign]:
        """List campaigns that are active and within date range."""
        statement = select(GiftCampaign).where(
            col(GiftCampaign.is_active) == True,  # noqa: E712
            col(GiftCampaign.starts_at) <= now,
            col(GiftCampaign.ends_at) >= now,
        )
        result = await self.db.exec(statement)
        return list(result.all())

    async def get_campaign_by_id(self, campaign_id: UUID) -> GiftCampaign | None:
        """Get a campaign by ID."""
        statement = select(GiftCampaign).where(col(GiftCampaign.id) == campaign_id)
        result = await self.db.exec(statement)
        return result.first()

    async def get_campaign_by_name(self, name: str) -> GiftCampaign | None:
        """Get a campaign by unique name."""
        statement = select(GiftCampaign).where(col(GiftCampaign.name) == name)
        result = await self.db.exec(statement)
        return result.first()

    async def get_latest_claim(self, user_id: str, campaign_id: UUID) -> GiftClaim | None:
        """Get the most recent claim for a user in a campaign."""
        statement = (
            select(GiftClaim)
            .where(
                col(GiftClaim.user_id) == user_id,
                col(GiftClaim.campaign_id) == campaign_id,
            )
            .order_by(col(GiftClaim.claimed_at).desc())
            .limit(1)
        )
        result = await self.db.exec(statement)
        return result.first()

    async def has_claimed_today(self, user_id: str, campaign_id: UUID, today_start: datetime) -> bool:
        """Check if user has already claimed today."""
        statement = select(GiftClaim).where(
            col(GiftClaim.user_id) == user_id,
            col(GiftClaim.campaign_id) == campaign_id,
            col(GiftClaim.claimed_at) >= today_start,
        )
        result = await self.db.exec(statement)
        return result.first() is not None

    async def count_claims(self, user_id: str, campaign_id: UUID) -> int:
        """Count total claims for a user in a campaign."""
        statement = select(func.count(GiftClaim.id)).where(  # type: ignore
            col(GiftClaim.user_id) == user_id,
            col(GiftClaim.campaign_id) == campaign_id,
        )
        result = await self.db.exec(statement)
        return result.one()

    async def create_claim(self, data: GiftClaimCreate) -> GiftClaim:
        """Create a new claim record. Does NOT commit."""
        claim = GiftClaim(**data.model_dump())
        self.db.add(claim)
        await self.db.flush()
        await self.db.refresh(claim)
        logger.info(
            f"Created gift claim: user={data.user_id}, campaign={data.campaign_id}, "
            f"day={data.day_number}, consecutive={data.consecutive_days}"
        )
        return claim

    async def upsert_campaign(self, name: str, **fields: object) -> GiftCampaign:
        """Create or update a campaign by name. For seeding."""
        existing = await self.get_campaign_by_name(name)
        if existing:
            for key, value in fields.items():
                setattr(existing, key, value)
            self.db.add(existing)
            await self.db.flush()
            await self.db.refresh(existing)
            return existing
        campaign = GiftCampaign(name=name, **fields)  # type: ignore
        self.db.add(campaign)
        await self.db.flush()
        await self.db.refresh(campaign)
        return campaign
