"""Admin API endpoints for marketplace management."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.infra.database import get_session as get_db_session
from app.models.agent_marketplace import MarketplaceScope
from app.repos.agent_marketplace import AgentMarketplaceRepository
from app.repos.developer_earning import DeveloperEarningRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-marketplace"])


# ==================== Response Models ====================


class MarketplaceOverviewResponse(BaseModel):
    total_listings: int
    published_listings: int
    unpublished_listings: int
    official_listings: int
    community_listings: int
    total_forks: int
    total_views: int
    total_likes: int
    total_developer_earnings: int
    total_developer_consumed: int
    unique_developers: int


class AdminMarketplaceListingEntry(BaseModel):
    id: str
    name: str
    description: str | None
    avatar: str | None
    scope: str
    is_published: bool
    fork_mode: str
    user_id: str | None
    author_display_name: str | None
    tags: list[str]
    likes_count: int
    forks_count: int
    views_count: int
    total_earned: int
    total_consumed: int
    created_at: str
    updated_at: str
    first_published_at: str | None


class AdminListingsResponse(BaseModel):
    listings: list[AdminMarketplaceListingEntry]
    total: int


class EarningsHeatmapEntry(BaseModel):
    date: str
    total_earned: int
    total_consumed: int
    earning_count: int


class TopAgentEntry(BaseModel):
    id: str
    name: str | None
    avatar: str | None
    scope: str | None
    is_published: bool | None
    forks_count: int
    views_count: int
    likes_count: int
    total_earned: int
    total_consumed: int
    author_display_name: str | None


class TopDeveloperEntry(BaseModel):
    developer_user_id: str
    total_earned: int
    total_consumed: int
    earning_count: int
    listing_count: int
    available_balance: int
    subscription_tier: str = "free"


class DeveloperAgentEntry(BaseModel):
    marketplace_id: str
    name: str | None
    avatar: str | None
    scope: str | None
    is_published: bool | None
    forks_count: int
    views_count: int
    likes_count: int
    total_earned: int
    total_consumed: int
    earning_count: int


# ==================== Helper ====================


def _verify_admin(admin_secret: str) -> None:
    if admin_secret != configs.Admin.secret:
        logger.warning("Invalid admin secret key provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin secret key",
        )


# ==================== Endpoints ====================


@router.get("/overview", response_model=MarketplaceOverviewResponse)
async def get_marketplace_overview(
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """Aggregated marketplace overview (listings + earnings)."""
    _verify_admin(admin_secret)

    mp_repo = AgentMarketplaceRepository(db)
    earn_repo = DeveloperEarningRepository(db)

    listing_stats = await mp_repo.admin_get_overview_stats()
    earning_stats = await earn_repo.admin_get_total_earnings_stats()

    return MarketplaceOverviewResponse(
        total_listings=listing_stats["total_listings"],
        published_listings=listing_stats["published"],
        unpublished_listings=listing_stats["unpublished"],
        official_listings=listing_stats["official"],
        community_listings=listing_stats["community"],
        total_forks=listing_stats["total_forks"],
        total_views=listing_stats["total_views"],
        total_likes=listing_stats["total_likes"],
        total_developer_earnings=earning_stats["total_earned"],
        total_developer_consumed=earning_stats["total_consumed"],
        unique_developers=earning_stats["unique_developers"],
    )


@router.get("/listings", response_model=AdminListingsResponse)
async def get_marketplace_listings(
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    search: Optional[str] = Query(None),
    scope: Optional[str] = Query(None),
    is_published: Optional[bool] = Query(None),
    sort_by: str = Query("recent"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db_session),
):
    """Paginated marketplace listing search with earnings data."""
    _verify_admin(admin_secret)

    scope_enum = None
    if scope:
        try:
            scope_enum = MarketplaceScope(scope)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid scope: {scope}")

    repo = AgentMarketplaceRepository(db)
    listings, total = await repo.admin_search_listings(
        search=search,
        scope=scope_enum,
        is_published=is_published,
        sort_by=sort_by,  # type: ignore
        limit=limit,
        offset=offset,
    )

    return AdminListingsResponse(
        listings=[AdminMarketplaceListingEntry(**item) for item in listings],
        total=total,
    )


@router.get("/listings/{listing_id}")
async def get_marketplace_listing_detail(
    listing_id: UUID,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get single listing detail with earnings stats."""
    _verify_admin(admin_secret)

    mp_repo = AgentMarketplaceRepository(db)
    listing = await mp_repo.get_by_id(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    earn_repo = DeveloperEarningRepository(db)
    earnings = await earn_repo.get_listing_earnings_stats(listing_id)

    return {
        "id": str(listing.id),
        "name": listing.name,
        "description": listing.description,
        "avatar": listing.avatar,
        "scope": listing.scope,
        "is_published": listing.is_published,
        "fork_mode": listing.fork_mode,
        "user_id": listing.user_id,
        "author_display_name": listing.author_display_name,
        "tags": listing.tags or [],
        "likes_count": listing.likes_count,
        "forks_count": listing.forks_count,
        "views_count": listing.views_count,
        "readme": listing.readme,
        "created_at": listing.created_at.isoformat(),
        "updated_at": listing.updated_at.isoformat(),
        "first_published_at": listing.first_published_at.isoformat() if listing.first_published_at else None,
        **earnings,
    }


@router.post("/listings/{listing_id}/toggle-publish")
async def toggle_listing_publish(
    listing_id: UUID,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """Toggle is_published status for a listing."""
    _verify_admin(admin_secret)

    repo = AgentMarketplaceRepository(db)
    listing = await repo.get_by_id(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    from app.models.agent_marketplace import AgentMarketplaceUpdate

    new_published = not listing.is_published
    update_data = AgentMarketplaceUpdate(is_published=new_published)
    updated = await repo.update_listing(listing_id, update_data)
    await db.commit()

    return {
        "id": str(listing_id),
        "is_published": updated.is_published if updated else new_published,
    }


@router.delete("/listings/{listing_id}")
async def delete_listing(
    listing_id: UUID,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """Hard-delete a marketplace listing."""
    _verify_admin(admin_secret)

    repo = AgentMarketplaceRepository(db)
    deleted = await repo.delete_listing(listing_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Listing not found")

    await db.commit()
    return {"success": True}


@router.get("/heatmap/earnings", response_model=list[EarningsHeatmapEntry])
async def get_earnings_heatmap(
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    year: int = Query(...),
    tz: str = Query("UTC"),
    subscription_tier: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db_session),
):
    """Daily developer earnings heatmap."""
    _verify_admin(admin_secret)

    repo = DeveloperEarningRepository(db)
    data = await repo.admin_get_earnings_heatmap(year=year, tz=tz, subscription_tier=subscription_tier)
    return [EarningsHeatmapEntry(**entry) for entry in data]


@router.get("/top-agents", response_model=list[TopAgentEntry])
async def get_top_agents(
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    sort_by: str = Query("earned"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
):
    """Top agents by earnings."""
    _verify_admin(admin_secret)

    repo = DeveloperEarningRepository(db)
    data = await repo.admin_get_top_agents(sort_by=sort_by, limit=limit)
    return [TopAgentEntry(**entry) for entry in data]


@router.get("/top-developers", response_model=list[TopDeveloperEntry])
async def get_top_developers(
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    year: int = Query(...),
    tz: Optional[str] = Query("UTC"),
    date: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
):
    """Top developers by total earnings."""
    _verify_admin(admin_secret)

    repo = DeveloperEarningRepository(db)
    data = await repo.admin_get_top_developers(year=year, tz=tz or "UTC", date=date, limit=limit)
    return [TopDeveloperEntry(**entry) for entry in data]


@router.get("/developers/{developer_user_id}/agents", response_model=list[DeveloperAgentEntry])
async def get_developer_agents(
    developer_user_id: str,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get all agents for a specific developer with earnings data."""
    _verify_admin(admin_secret)

    repo = DeveloperEarningRepository(db)
    data = await repo.admin_get_developer_agents(developer_user_id=developer_user_id)
    return [DeveloperAgentEntry(**entry) for entry in data]
