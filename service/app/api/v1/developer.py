"""Developer earnings API — wallet, earnings, and withdrawal endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.consume.developer_reward import REWARD_RATES
from app.infra.database import get_session as get_db_session
from app.middleware.auth import get_current_user
from app.repos.developer_earning import DeveloperEarningRepository
from app.repos.redemption import RedemptionRepository

logger = logging.getLogger(__name__)
router = APIRouter(tags=["developer"])


# ==================== Response Schemas ====================


class DeveloperWalletResponse(BaseModel):
    available_balance: int
    total_earned: int
    total_withdrawn: int


class DeveloperEarningResponse(BaseModel):
    id: str
    marketplace_id: str
    consumer_user_id: str
    fork_mode: str
    rate: float
    amount: int
    total_consumed: int
    status: str
    created_at: str


class EarningsListResponse(BaseModel):
    earnings: list[DeveloperEarningResponse]
    total: int


class EarningsSummaryItem(BaseModel):
    marketplace_id: str
    fork_mode: str
    total_earned: int
    total_consumed: int
    earning_count: int
    last_earned_at: str | None
    agent_name: str | None = None
    agent_avatar: str | None = None


class EarningsSummaryResponse(BaseModel):
    items: list[EarningsSummaryItem]


class WithdrawRequest(BaseModel):
    amount: int = Field(gt=0, description="Amount to withdraw to user wallet")


class WithdrawResponse(BaseModel):
    withdrawn: int
    developer_balance: int
    user_balance: int


class RewardRatesResponse(BaseModel):
    editable: float
    locked: float


# ==================== Endpoints ====================


@router.get("/wallet", response_model=DeveloperWalletResponse)
async def get_developer_wallet(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> DeveloperWalletResponse:
    """Get current user's developer wallet."""
    repo = DeveloperEarningRepository(db)
    wallet = await repo.get_or_create_wallet(user)
    return DeveloperWalletResponse(
        available_balance=wallet.available_balance,
        total_earned=wallet.total_earned,
        total_withdrawn=wallet.total_withdrawn,
    )


@router.get("/earnings", response_model=EarningsListResponse)
async def list_developer_earnings(
    marketplace_id: UUID | None = Query(None, description="Filter by marketplace listing"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> EarningsListResponse:
    """Get developer earnings history."""
    repo = DeveloperEarningRepository(db)
    earnings = await repo.list_earnings_by_developer(user, marketplace_id=marketplace_id, limit=limit, offset=offset)
    total = await repo.count_earnings_by_developer(user, marketplace_id=marketplace_id)
    return EarningsListResponse(
        earnings=[
            DeveloperEarningResponse(
                id=str(e.id),
                marketplace_id=str(e.marketplace_id),
                consumer_user_id=e.consumer_user_id,
                fork_mode=e.fork_mode,
                rate=e.rate,
                amount=e.amount,
                total_consumed=e.total_consumed,
                status=e.status,
                created_at=e.created_at.isoformat(),
            )
            for e in earnings
        ],
        total=total,
    )


@router.get("/earnings/summary", response_model=EarningsSummaryResponse)
async def get_earnings_summary(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> EarningsSummaryResponse:
    """Get earnings summary grouped by marketplace listing."""
    repo = DeveloperEarningRepository(db)
    items = await repo.get_earnings_summary_by_agent(user)
    return EarningsSummaryResponse(
        items=[
            EarningsSummaryItem(
                marketplace_id=item["marketplace_id"],
                fork_mode=item["fork_mode"],
                total_earned=item["total_earned"],
                total_consumed=item["total_consumed"],
                earning_count=item["earning_count"],
                last_earned_at=item["last_earned_at"],
                agent_name=item.get("agent_name"),
                agent_avatar=item.get("agent_avatar"),
            )
            for item in items
        ]
    )


@router.post("/withdraw", response_model=WithdrawResponse)
async def withdraw_earnings(
    body: WithdrawRequest,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> WithdrawResponse:
    """Withdraw developer earnings to user wallet."""
    earning_repo = DeveloperEarningRepository(db)
    redemption_repo = RedemptionRepository(db)

    wallet = await earning_repo.get_or_create_wallet(user)
    if wallet.available_balance < body.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient developer balance: available={wallet.available_balance}",
        )

    await earning_repo.withdraw(user, body.amount)
    user_wallet = await redemption_repo.credit_wallet_typed(user, body.amount, "earned", "developer_withdrawal")
    await db.commit()

    # Broadcast wallet update via WS
    from app.core.user_events import broadcast_wallet_update

    await broadcast_wallet_update(user_wallet)

    # Refresh for response
    updated_dev_wallet = await earning_repo.get_wallet(user)

    return WithdrawResponse(
        withdrawn=body.amount,
        developer_balance=updated_dev_wallet.available_balance if updated_dev_wallet else 0,
        user_balance=user_wallet.virtual_balance,
    )


@router.get("/reward-rates", response_model=RewardRatesResponse)
async def get_reward_rates() -> RewardRatesResponse:
    """Get current developer reward rates."""
    return RewardRatesResponse(
        editable=REWARD_RATES.get("editable", 0.30),
        locked=REWARD_RATES.get("locked", 0.03),
    )
