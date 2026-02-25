"""
Skill Marketplace API Handlers.

This module provides endpoints for skill marketplace:
- POST /publish: Publish a skill to the marketplace
- POST /unpublish/{marketplace_id}: Unpublish a skill marketplace listing
- POST /fork/{marketplace_id}: Fork a skill from marketplace
- GET /: Search and list marketplace skills
- GET /{marketplace_id}: Get details of a skill marketplace listing
- POST /{marketplace_id}/like: Toggle like on a listing
- GET /my-listings/all: Get current user's published skill listings
"""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.skill_marketplace import SkillMarketplaceService
from app.infra.database import get_session
from app.middleware.auth import (
    UserInfo,
    get_current_user,
    get_current_user_info,
    get_current_user_optional,
)
from app.models.skill_marketplace import (
    SkillMarketplaceRead,
    SkillMarketplaceReadWithSnapshot,
    SkillMarketplaceUpdate,
)
from app.models.skill_snapshot import SkillSnapshotRead
from app.repos import SkillMarketplaceRepository, SkillRepository

router = APIRouter(tags=["skill-marketplace"])


# ============================================================================
# Request / Response models
# ============================================================================


class SkillPublishRequest(BaseModel):
    """Request model for publishing a skill."""

    skill_id: UUID
    commit_message: str
    is_published: bool = True
    readme: str | None = None


class SkillPublishResponse(BaseModel):
    """Response model for publish operation."""

    marketplace_id: UUID
    skill_id: UUID
    snapshot_version: int
    is_published: bool
    readme: str | None = None


class SkillUpdateListingRequest(BaseModel):
    """Request model for updating listing details."""

    readme: str | None = None
    is_published: bool | None = None


class SkillForkRequest(BaseModel):
    """Request model for forking a skill."""

    custom_name: str | None = None


class SkillForkResponse(BaseModel):
    """Response model for fork operation."""

    skill_id: UUID
    name: str
    original_marketplace_id: UUID


class SkillLikeResponse(BaseModel):
    """Response model for like toggle."""

    is_liked: bool
    likes_count: int


# ============================================================================
# Endpoints
# ============================================================================


@router.post("/publish", response_model=SkillPublishResponse)
async def publish_skill(
    request: SkillPublishRequest,
    user_info: UserInfo = Depends(get_current_user_info),
    db: AsyncSession = Depends(get_session),
) -> SkillPublishResponse:
    """Publish a skill to the marketplace."""
    user_id = user_info.id

    # Get the skill and verify ownership
    skill_repo = SkillRepository(db)
    skill = await skill_repo.get_skill_by_id(request.skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if skill.user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't own this skill")

    marketplace_service = SkillMarketplaceService(db)
    listing = await marketplace_service.publish_skill(
        skill=skill,
        commit_message=request.commit_message,
        is_published=request.is_published,
        readme=request.readme,
        author_display_name=user_info.display_name,
        author_avatar_url=user_info.avatar_url,
    )
    if not listing:
        raise HTTPException(status_code=500, detail="Failed to create marketplace listing")

    await db.commit()

    # Get snapshot version
    from app.repos import SkillSnapshotRepository

    snapshot_repo = SkillSnapshotRepository(db)
    snapshot = await snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)

    return SkillPublishResponse(
        marketplace_id=listing.id,
        skill_id=listing.skill_id,
        snapshot_version=snapshot.version if snapshot else 1,
        is_published=listing.is_published,
        readme=listing.readme,
    )


@router.patch("/{marketplace_id}", response_model=SkillMarketplaceRead)
async def update_listing(
    marketplace_id: UUID,
    request: SkillUpdateListingRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SkillMarketplaceRead:
    """Update details of a skill marketplace listing."""
    marketplace_repo = SkillMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Skill marketplace listing not found")

    if listing.scope == "official":
        raise HTTPException(status_code=403, detail="Cannot modify official marketplace listings")

    if listing.user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't own this marketplace listing")

    marketplace_service = SkillMarketplaceService(db)
    update_data = SkillMarketplaceUpdate(
        readme=request.readme,
        is_published=request.is_published,
    )
    updated_listing = await marketplace_service.update_listing_details(marketplace_id, update_data)

    if not updated_listing:
        raise HTTPException(status_code=500, detail="Failed to update listing")

    await db.commit()
    return SkillMarketplaceRead(**updated_listing.model_dump())


@router.post("/unpublish/{marketplace_id}", status_code=204)
async def unpublish_skill(
    marketplace_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Unpublish a skill marketplace listing."""
    marketplace_repo = SkillMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Skill marketplace listing not found")

    if listing.scope == "official":
        raise HTTPException(status_code=403, detail="Cannot unpublish official marketplace listings")

    if listing.user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't own this marketplace listing")

    marketplace_service = SkillMarketplaceService(db)
    await marketplace_service.unpublish_skill(marketplace_id)
    await db.commit()


@router.delete("/{marketplace_id}", status_code=204)
async def delete_listing(
    marketplace_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Permanently delete a skill marketplace listing."""
    marketplace_repo = SkillMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Skill marketplace listing not found")

    if listing.scope == "official":
        raise HTTPException(status_code=403, detail="Cannot delete official marketplace listings")

    if listing.user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't own this marketplace listing")

    await marketplace_repo.delete_listing(marketplace_id)
    await db.commit()


@router.post("/fork/{marketplace_id}", response_model=SkillForkResponse)
async def fork_skill(
    marketplace_id: UUID,
    request: SkillForkRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SkillForkResponse:
    """Fork a skill from the marketplace to create your own copy."""
    try:
        marketplace_service = SkillMarketplaceService(db)
        forked_skill = await marketplace_service.fork_skill(
            marketplace_id=marketplace_id,
            user_id=user_id,
            fork_name=request.custom_name,
        )

        await db.commit()

        return SkillForkResponse(
            skill_id=forked_skill.id,
            name=forked_skill.name,
            original_marketplace_id=marketplace_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[SkillMarketplaceRead])
async def search_skill_marketplace(
    query: str | None = Query(None, description="Search query for name/description"),
    tags: list[str] | None = Query(None, description="Filter by tags"),
    scope: str | None = Query(None, description="Filter by scope (official/community)"),
    sort_by: Literal["likes", "forks", "views", "recent", "oldest"] = Query("recent", description="Sort order"),
    limit: int = Query(20, ge=1, le=100, description="Number of results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    user_id: str | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> list[SkillMarketplaceRead]:
    """Search and list marketplace skills."""
    marketplace_repo = SkillMarketplaceRepository(db)
    listings = await marketplace_repo.search_listings(
        query=query,
        tags=tags,
        only_published=True,
        scope=scope,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )

    liked_map: dict[UUID, bool] = {}
    if user_id and listings:
        from app.repos.skill_like import SkillLikeRepository

        like_repo = SkillLikeRepository(db)
        listing_ids = [listing.id for listing in listings]
        liked_map = await like_repo.get_likes_for_listings(listing_ids, user_id)

    return [
        SkillMarketplaceRead(
            **listing.model_dump(),
            has_liked=liked_map.get(listing.id, False),
        )
        for listing in listings
    ]


@router.get("/starred", response_model=list[SkillMarketplaceRead])
async def get_starred_skill_listings(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SkillMarketplaceRead]:
    """Get all skill marketplace listings starred by the current user."""
    marketplace_service = SkillMarketplaceService(db)
    listings = await marketplace_service.get_starred_listings(user_id)
    return [SkillMarketplaceRead(**listing.model_dump(), has_liked=True) for listing in listings]


@router.get("/trending", response_model=list[SkillMarketplaceRead])
async def get_trending_skill_listings(
    limit: int = Query(10, ge=1, le=20),
    user_id: str | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> list[SkillMarketplaceRead]:
    """Get trending skill marketplace listings."""
    marketplace_repo = SkillMarketplaceRepository(db)
    listings = await marketplace_repo.get_trending_listings(limit=limit)

    liked_map: dict[UUID, bool] = {}
    if user_id and listings:
        from app.repos.skill_like import SkillLikeRepository

        like_repo = SkillLikeRepository(db)
        listing_ids = [listing.id for listing in listings]
        liked_map = await like_repo.get_likes_for_listings(listing_ids, user_id)

    return [
        SkillMarketplaceRead(
            **listing.model_dump(),
            has_liked=liked_map.get(listing.id, False),
        )
        for listing in listings
    ]


@router.get("/recently-published", response_model=list[SkillMarketplaceRead])
async def get_recently_published_skill_listings(
    limit: int = Query(6, ge=1, le=20),
    user_id: str | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> list[SkillMarketplaceRead]:
    """Get recently published skill marketplace listings."""
    marketplace_repo = SkillMarketplaceRepository(db)
    listings = await marketplace_repo.get_recently_published_listings(limit=limit)

    liked_map: dict[UUID, bool] = {}
    if user_id and listings:
        from app.repos.skill_like import SkillLikeRepository

        like_repo = SkillLikeRepository(db)
        listing_ids = [listing.id for listing in listings]
        liked_map = await like_repo.get_likes_for_listings(listing_ids, user_id)

    return [
        SkillMarketplaceRead(
            **listing.model_dump(),
            has_liked=liked_map.get(listing.id, False),
        )
        for listing in listings
    ]


@router.get("/my-listings/all", response_model=list[SkillMarketplaceRead])
async def get_my_skill_listings(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SkillMarketplaceRead]:
    """Get all skill marketplace listings created by the current user."""
    marketplace_repo = SkillMarketplaceRepository(db)
    listings = await marketplace_repo.search_listings(
        user_id=user_id,
        only_published=False,
        sort_by="recent",
        limit=100,
    )
    return [SkillMarketplaceRead(**listing.model_dump()) for listing in listings]


@router.get("/{marketplace_id}", response_model=SkillMarketplaceReadWithSnapshot)
async def get_skill_marketplace_listing(
    marketplace_id: UUID,
    user_id: str | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> SkillMarketplaceReadWithSnapshot:
    """Get details of a skill marketplace listing with its active snapshot."""
    marketplace_service = SkillMarketplaceService(db)
    result = await marketplace_service.get_listing_with_snapshot(marketplace_id)

    if not result:
        raise HTTPException(status_code=404, detail="Skill marketplace listing not found")

    listing, snapshot = result

    is_owner = listing.user_id is not None and listing.user_id == user_id
    if not listing.is_published and not is_owner:
        raise HTTPException(status_code=404, detail="Skill marketplace listing not found")

    # Increment views if not the owner
    if user_id and not is_owner:
        marketplace_repo = SkillMarketplaceRepository(db)
        await marketplace_repo.increment_views(marketplace_id)
        await db.commit()

    has_liked = False
    if user_id:
        has_liked = await marketplace_service.check_user_has_liked(marketplace_id, user_id)

    return SkillMarketplaceReadWithSnapshot(
        **listing.model_dump(),
        snapshot=SkillSnapshotRead(**snapshot.model_dump()),
        has_liked=has_liked,
    )


@router.post("/{marketplace_id}/like", response_model=SkillLikeResponse)
async def toggle_skill_like(
    marketplace_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SkillLikeResponse:
    """Toggle like on a skill marketplace listing."""
    marketplace_repo = SkillMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Skill marketplace listing not found")

    marketplace_service = SkillMarketplaceService(db)
    is_liked, likes_count = await marketplace_service.toggle_like(marketplace_id, user_id)

    await db.commit()

    return SkillLikeResponse(is_liked=is_liked, likes_count=likes_count)


@router.get("/{marketplace_id}/history", response_model=list[SkillSnapshotRead])
async def get_skill_listing_history(
    marketplace_id: UUID,
    db: AsyncSession = Depends(get_session),
) -> list[SkillSnapshotRead]:
    """Get version history of a skill marketplace listing."""
    marketplace_service = SkillMarketplaceService(db)
    snapshots = await marketplace_service.get_listing_history(marketplace_id)
    return [SkillSnapshotRead(**snapshot.model_dump()) for snapshot in snapshots]
