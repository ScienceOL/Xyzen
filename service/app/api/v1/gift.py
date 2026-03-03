"""Gift campaign API endpoints."""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCodeError, handle_auth_error
from app.core.gift.service import GiftService
from app.infra.database import get_session as get_db_session
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["gifts"])


# ==================== Response Models ====================


class CampaignStatusResponse(BaseModel):
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
    next_reward_preview: dict[str, Any] | None = None


class RewardData(BaseModel):
    """Reward details."""

    credits: int = 0
    credit_type: str = "free"
    full_model_access_days: int = 0
    milestone_reached: bool = False
    milestone_name: str = ""


class ClaimResultResponse(BaseModel):
    """Result of claiming a gift."""

    day_number: int
    consecutive_days: int
    reward: RewardData


# ==================== Endpoints ====================


@router.get("/active", response_model=list[CampaignStatusResponse])
async def get_active_campaigns(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get all active gift campaigns with user-specific status."""
    try:
        service = GiftService(db)
        campaigns = await service.get_active_campaigns_for_user(current_user)
        return [CampaignStatusResponse(**c) for c in campaigns]
    except Exception as e:
        logger.error(f"Error fetching active campaigns for user {current_user}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch active campaigns",
        )


@router.post("/{campaign_id}/claim", response_model=ClaimResultResponse)
async def claim_gift(
    campaign_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Claim a gift for today in the specified campaign."""
    try:
        service = GiftService(db)
        result = await service.claim_gift(current_user, campaign_id)
        await db.commit()
        return ClaimResultResponse(
            day_number=result["day_number"],
            consecutive_days=result["consecutive_days"],
            reward=RewardData(**result["reward"]),
        )
    except ErrCodeError as e:
        await db.rollback()
        logger.warning(f"Gift claim failed for user {current_user}: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during gift claim for user {current_user}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gift claim failed",
        )
