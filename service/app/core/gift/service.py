"""Gift campaign service for handling campaign logic and rewards."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, TypedDict
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCode, ErrCodeError
from app.core.gift.modes import MODE_REGISTRY
from app.models.gift import GiftClaimCreate
from app.repos.gift import GiftRepository
from app.repos.redemption import RedemptionRepository
from app.repos.subscription import SubscriptionRepository

logger = logging.getLogger(__name__)

# Normalize dates to CST (UTC+8), matching check-in logic
GIFT_TZ = timezone(timedelta(hours=8))


class CampaignStatus(TypedDict):
    """Status of a campaign for a specific user."""

    id: str
    name: str
    display_name_key: str
    description_key: str
    mode: str
    total_days: int
    claimed_today: bool
    consecutive_days: int
    total_claims: int
    completed: bool
    next_reward_preview: dict[str, Any] | None


class ClaimResult(TypedDict):
    """Result of claiming a gift."""

    day_number: int
    consecutive_days: int
    reward: dict[str, Any]


class GiftService:
    """Service layer for gift campaign operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.gift_repo = GiftRepository(db)
        self.redemption_repo = RedemptionRepository(db)
        self.subscription_repo = SubscriptionRepository(db)

    @staticmethod
    def _today_start() -> datetime:
        """Get start of today in GIFT_TZ."""
        now = datetime.now(GIFT_TZ)
        return now.replace(hour=0, minute=0, second=0, microsecond=0)

    async def get_active_campaigns_for_user(self, user_id: str) -> list[CampaignStatus]:
        """Get all active campaigns with user-specific status."""
        now = datetime.now(timezone.utc)
        campaigns = await self.gift_repo.list_active_campaigns(now)
        today_start = self._today_start()

        result: list[CampaignStatus] = []
        for campaign in campaigns:
            claimed_today = await self.gift_repo.has_claimed_today(user_id, campaign.id, today_start)
            total_claims = await self.gift_repo.count_claims(user_id, campaign.id)
            completed = total_claims >= campaign.total_days

            # Calculate current consecutive days
            consecutive_days = 0
            latest_claim = await self.gift_repo.get_latest_claim(user_id, campaign.id)
            if latest_claim:
                consecutive_days = latest_claim.consecutive_days

            # Preview next reward
            next_reward_preview: dict[str, Any] | None = None
            if not completed and not claimed_today:
                handler = MODE_REGISTRY.get(campaign.mode)
                if handler:
                    next_day = total_claims + 1
                    # If claiming today would be consecutive, preview with streak+1
                    preview_streak = self._compute_next_consecutive(latest_claim, today_start)
                    preview = handler.compute_reward(next_day, preview_streak, campaign.config)
                    next_reward_preview = preview.to_dict()

            result.append(
                CampaignStatus(
                    id=str(campaign.id),
                    name=campaign.name,
                    display_name_key=campaign.display_name_key,
                    description_key=campaign.description_key,
                    mode=campaign.mode,
                    total_days=campaign.total_days,
                    claimed_today=claimed_today,
                    consecutive_days=consecutive_days,
                    total_claims=total_claims,
                    completed=completed,
                    next_reward_preview=next_reward_preview,
                )
            )
        return result

    def _compute_next_consecutive(self, latest_claim: Any, today_start: datetime) -> int:
        """Compute what the consecutive days would be if user claims now."""
        if not latest_claim:
            return 1
        claim_date = latest_claim.claimed_at.astimezone(GIFT_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = today_start - timedelta(days=1)
        if claim_date == yesterday:
            return latest_claim.consecutive_days + 1
        if claim_date == today_start:
            # Already claimed today — this shouldn't happen in preview path
            return latest_claim.consecutive_days
        # Streak broken
        return 1

    async def claim_gift(self, user_id: str, campaign_id: UUID) -> ClaimResult:
        """Claim a gift for today.

        Validates eligibility, computes reward, applies credits/unlocks, records claim.
        Does NOT commit — caller is responsible for committing.
        """
        campaign = await self.gift_repo.get_campaign_by_id(campaign_id)
        if not campaign:
            raise ErrCodeError(ErrCode.GIFT_CAMPAIGN_NOT_FOUND)

        now = datetime.now(timezone.utc)
        if not campaign.is_active or now < campaign.starts_at or now > campaign.ends_at:
            raise ErrCodeError(ErrCode.GIFT_CAMPAIGN_INACTIVE)

        handler = MODE_REGISTRY.get(campaign.mode)
        if not handler:
            raise ErrCodeError(ErrCode.GIFT_INVALID_MODE)

        today_start = self._today_start()

        # Check already claimed today
        if await self.gift_repo.has_claimed_today(user_id, campaign_id, today_start):
            raise ErrCodeError(ErrCode.GIFT_ALREADY_CLAIMED_TODAY)

        # Check campaign completion
        total_claims = await self.gift_repo.count_claims(user_id, campaign_id)
        if total_claims >= campaign.total_days:
            raise ErrCodeError(ErrCode.GIFT_CAMPAIGN_COMPLETED)

        # Calculate consecutive days (mirror check-in logic)
        latest_claim = await self.gift_repo.get_latest_claim(user_id, campaign_id)
        consecutive_days = self._compute_next_consecutive(latest_claim, today_start)

        day_number = total_claims + 1

        # Compute reward
        reward = handler.compute_reward(day_number, consecutive_days, campaign.config)

        # Apply credits
        if reward.credits > 0:
            await self.redemption_repo.credit_wallet_typed(
                user_id=user_id,
                amount=reward.credits,
                credit_type=reward.credit_type,
                source=f"gift_{campaign.name}",
                reference_id=str(campaign_id),
            )

        # Apply full model access on milestone
        if reward.milestone_reached and reward.full_model_access_days > 0:
            await self.subscription_repo.extend_full_model_access(user_id, reward.full_model_access_days)
            logger.info(
                f"User {user_id} unlocked full model access for {reward.full_model_access_days} days "
                f"via gift campaign {campaign.name}"
            )

        # Record claim
        claim_data = GiftClaimCreate(
            user_id=user_id,
            campaign_id=campaign_id,
            day_number=day_number,
            consecutive_days=consecutive_days,
            reward_data=reward.to_dict(),
        )
        await self.gift_repo.create_claim(claim_data)

        logger.info(
            f"Gift claimed: user={user_id}, campaign={campaign.name}, "
            f"day={day_number}, streak={consecutive_days}, credits={reward.credits}"
        )

        return ClaimResult(
            day_number=day_number,
            consecutive_days=consecutive_days,
            reward=reward.to_dict(),
        )
