"""Subscription API endpoints for querying user plans and available tiers."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.core.limits import LimitsEnforcer
from app.core.subscription import SubscriptionService
from app.infra.database import get_session as get_db_session
from app.middleware.auth import get_current_user
from app.models.subscription import SubscriptionRoleRead, UserSubscriptionRead
from app.schemas.plan_catalog import PlanCatalogResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["subscription"])


# ==================== Response Models ====================


class SubscriptionResponse(BaseModel):
    """Current user's subscription with resolved role."""

    subscription: UserSubscriptionRead
    role: SubscriptionRoleRead
    can_claim_credits: bool = Field(default=False, description="Whether monthly credits can be claimed now")
    effective_max_model_tier: str = Field(
        default="lite", description="Effective model tier including full-access pass override"
    )


class PlansResponse(BaseModel):
    """List of all available subscription plans."""

    plans: list[SubscriptionRoleRead] = Field(description="Available subscription tiers")


class AdminSubscriptionEntry(BaseModel):
    """A single user subscription entry for admin view."""

    subscription: UserSubscriptionRead
    role_name: str | None = None
    role_display_name: str | None = None


class AdminSubscriptionsResponse(BaseModel):
    """Admin view of all user subscriptions."""

    subscriptions: list[AdminSubscriptionEntry]
    total: int


class AdminAssignRoleRequest(BaseModel):
    """Request body for assigning a role to a user."""

    user_id: str = Field(description="Target user ID")
    role_id: UUID = Field(description="Role ID to assign")
    expires_at: datetime | None = Field(default=None, description="Expiration time (null = 30 days from now)")


class UsageBucket(BaseModel):
    used: int
    limit: int


class StorageBucket(BaseModel):
    used_bytes: int
    limit_bytes: int
    usage_percentage: float


class UsageResponse(BaseModel):
    """Current resource usage vs subscription limits."""

    role_name: str
    role_display_name: str
    chats: UsageBucket
    sandboxes: UsageBucket
    scheduled_tasks: UsageBucket
    storage: StorageBucket
    files: UsageBucket


class ClaimCreditsResponse(BaseModel):
    """Response from claiming monthly credits."""

    amount_credited: int = Field(description="Amount of credits claimed")
    message: str = Field(description="Human-readable confirmation")


# ==================== User Endpoints ====================


@router.get(
    "",
    response_model=SubscriptionResponse,
    summary="Get current user subscription",
)
async def get_subscription(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> SubscriptionResponse:
    """Get the authenticated user's subscription and role (auto-assigns default if missing)."""
    service = SubscriptionService(db)
    result = await service.get_or_create_subscription(user_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No subscription plans configured",
        )
    sub, role = result
    can_claim = service.can_claim_credits(sub, role)

    # Compute effective model tier (includes full-access pass override)
    effective_tier = role.max_model_tier
    if sub.full_model_access_expires_at and sub.full_model_access_expires_at > datetime.now(timezone.utc):
        effective_tier = "ultra"

    return SubscriptionResponse(
        subscription=UserSubscriptionRead.model_validate(sub),
        role=SubscriptionRoleRead.model_validate(role),
        can_claim_credits=can_claim,
        effective_max_model_tier=effective_tier,
    )


@router.get(
    "/plans",
    response_model=PlansResponse,
    summary="List available subscription plans",
)
async def list_plans(
    db: AsyncSession = Depends(get_db_session),
) -> PlansResponse:
    """List all available subscription plans (public endpoint)."""
    service = SubscriptionService(db)
    roles = await service.list_plans()
    return PlansResponse(
        plans=[SubscriptionRoleRead.model_validate(r) for r in roles],
    )


@router.get(
    "/plans/catalog",
    response_model=PlanCatalogResponse,
    summary="Get full plan catalog with pricing, features, and limits",
)
async def get_plan_catalog(
    db: AsyncSession = Depends(get_db_session),
) -> PlanCatalogResponse:
    """Return the full plan catalog for the current region (public endpoint)."""
    service = SubscriptionService(db)
    return await service.get_plan_catalog_response()


@router.get(
    "/usage",
    response_model=UsageResponse,
    summary="Get current resource usage vs limits",
)
async def get_usage(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> UsageResponse:
    """Get the authenticated user's current resource usage and limits."""
    enforcer = await LimitsEnforcer.create(db, user_id)
    summary = await enforcer.get_usage_summary(db)
    return UsageResponse(**summary)


@router.post(
    "/claim-credits",
    response_model=ClaimCreditsResponse,
    summary="Claim monthly subscription credits",
)
async def claim_credits(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ClaimCreditsResponse:
    """Claim monthly credits granted by the user's subscription tier."""
    service = SubscriptionService(db)
    amount = await service.claim_credits(user_id)
    return ClaimCreditsResponse(
        amount_credited=amount,
        message=f"Successfully claimed {amount:,} credits",
    )


# ==================== Admin Endpoints ====================


@router.get(
    "/admin/subscriptions",
    response_model=AdminSubscriptionsResponse,
    summary="List all user subscriptions (admin)",
)
async def admin_list_subscriptions(
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
) -> AdminSubscriptionsResponse:
    """List all user subscriptions with their roles. Requires admin secret."""
    if admin_secret != configs.Admin.secret:
        logger.warning("Invalid admin secret key provided for subscription list")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin secret key",
        )

    service = SubscriptionService(db)
    results = await service.list_all_subscriptions()
    entries = [
        AdminSubscriptionEntry(
            subscription=UserSubscriptionRead.model_validate(sub),
            role_name=role.name if role else None,
            role_display_name=role.display_name if role else None,
        )
        for sub, role in results
    ]
    return AdminSubscriptionsResponse(subscriptions=entries, total=len(entries))


@router.post(
    "/admin/assign",
    response_model=SubscriptionResponse,
    summary="Assign a role to a user (admin)",
)
async def admin_assign_role(
    request: AdminAssignRoleRequest,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
) -> SubscriptionResponse:
    """Assign or update a user's subscription role. Requires admin secret."""
    if admin_secret != configs.Admin.secret:
        logger.warning("Invalid admin secret key provided for role assignment")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin secret key",
        )

    service = SubscriptionService(db)

    # Verify role exists
    role = await service.repo.get_role_by_id(request.role_id)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    sub = await service.assign_role(request.user_id, request.role_id, request.expires_at)
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to assign role",
        )
    await db.commit()

    return SubscriptionResponse(
        subscription=UserSubscriptionRead.model_validate(sub),
        role=SubscriptionRoleRead.model_validate(role),
        can_claim_credits=service.can_claim_credits(sub, role),
    )
