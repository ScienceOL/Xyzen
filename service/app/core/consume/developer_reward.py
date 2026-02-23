"""Developer reward service — calculates and records revenue share for marketplace developers."""

import logging
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.developer_earning import DeveloperEarning
from app.repos.agent_marketplace import AgentMarketplaceRepository
from app.repos.developer_earning import DeveloperEarningRepository

logger = logging.getLogger(__name__)

# Revenue share rates by fork mode
REWARD_RATES: dict[str, float] = {
    "editable": 0.30,  # 30% for unlocked/editable agents
    "locked": 0.03,  # 3% for locked agents
}


class DeveloperRewardService:
    """Calculates and records developer earnings from marketplace agent usage."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.earning_repo = DeveloperEarningRepository(db)
        self.marketplace_repo = AgentMarketplaceRepository(db)

    async def process_reward(
        self,
        *,
        developer_user_id: str,
        consumer_user_id: str,
        marketplace_id: UUID,
        session_id: UUID | None = None,
        topic_id: UUID | None = None,
        message_id: UUID | None = None,
        total_consumed: int,
    ) -> DeveloperEarning | None:
        """Calculate and record developer reward for a settlement event.

        Returns the DeveloperEarning record if reward was granted, None otherwise.
        """
        # Self-usage: no reward
        if developer_user_id == consumer_user_id:
            return None

        # Zero consumption: nothing to share
        if total_consumed <= 0:
            return None

        # Look up marketplace listing to get current fork_mode
        listing = await self.marketplace_repo.get_by_id(marketplace_id)
        if not listing or not listing.is_published:
            logger.debug("Skipping reward: listing %s not found or unpublished", marketplace_id)
            return None

        # Official agents don't generate developer rewards
        if listing.user_id is None:
            return None

        fork_mode = listing.fork_mode.value if hasattr(listing.fork_mode, "value") else str(listing.fork_mode)
        rate = REWARD_RATES.get(fork_mode, 0.0)
        if rate <= 0:
            return None

        reward_amount = int(total_consumed * rate)
        if reward_amount <= 0:
            return None

        # Create earning record
        earning = DeveloperEarning(
            developer_user_id=developer_user_id,
            marketplace_id=marketplace_id,
            consumer_user_id=consumer_user_id,
            session_id=session_id,
            topic_id=topic_id,
            message_id=message_id,
            fork_mode=fork_mode,
            rate=rate,
            amount=reward_amount,
            total_consumed=total_consumed,
            status="settled",
        )
        await self.earning_repo.create_earning(earning)

        # Credit developer wallet immediately
        await self.earning_repo.add_earning(developer_user_id, reward_amount)

        logger.info(
            "Developer reward: developer=%s marketplace=%s fork_mode=%s rate=%.2f consumed=%d reward=%d",
            developer_user_id,
            marketplace_id,
            fork_mode,
            rate,
            total_consumed,
            reward_amount,
        )
        return earning
