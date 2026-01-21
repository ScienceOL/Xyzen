"""
Marketplace API Handlers.

This module provides the following endpoints for agent marketplace:
- POST /publish: Publish an agent to the marketplace
- POST /unpublish/{marketplace_id}: Unpublish a marketplace listing
- POST /fork/{marketplace_id}: Fork an agent from marketplace
- GET /: Search and list marketplace agents
- GET /{marketplace_id}: Get details of a marketplace listing
- POST /{marketplace_id}/like: Toggle like on a listing
- GET /my-listings: Get current user's published listings
"""

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCodeError, handle_auth_error
from app.core.auth import AuthorizationService, get_auth_service
from app.core.marketplace import AgentMarketplaceService
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.agent import AgentRead
from app.models.agent_marketplace import (
    AgentMarketplaceRead,
    AgentMarketplaceReadWithSnapshot,
    AgentMarketplaceUpdate,
)
from app.models.agent_snapshot import AgentSnapshotRead
from app.repos import AgentMarketplaceRepository, AgentSnapshotRepository

router = APIRouter(tags=["marketplace"])


class PublishRequest(BaseModel):
    """Request model for publishing an agent"""

    agent_id: UUID
    commit_message: str
    is_published: bool = True
    readme: str | None = None


class PublishResponse(BaseModel):
    """Response model for publish operation"""

    marketplace_id: UUID
    agent_id: UUID
    snapshot_version: int
    is_published: bool
    readme: str | None = None


class UpdateListingRequest(BaseModel):
    """Request model for updating listing details"""

    readme: str | None = None
    is_published: bool | None = None


class PublishVersionRequest(BaseModel):
    """Request model for publishing a specific version"""

    version: int


class UpdateAgentRequest(BaseModel):
    """Request model for updating agent and listing"""

    name: str | None = None
    description: str | None = None
    avatar: str | None = None
    tags: list[str] | None = None
    readme: str | None = None
    commit_message: str
    graph_config: dict[str, Any] | None = None


class ForkRequest(BaseModel):
    """Request model for forking an agent"""

    custom_name: str | None = None


class ForkResponse(BaseModel):
    """Response model for fork operation"""

    agent_id: UUID
    name: str
    original_marketplace_id: UUID


class LikeResponse(BaseModel):
    """Response model for like toggle"""

    is_liked: bool
    likes_count: int


class RequirementsResponse(BaseModel):
    """Response model for agent requirements"""

    mcp_servers: list[dict[str, str]]
    knowledge_base: dict[str, str | int] | None
    provider_needed: bool


@router.post("/publish", response_model=PublishResponse)
async def publish_agent(
    request: PublishRequest,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> PublishResponse:
    """
    Publish an agent to the marketplace.

    Creates a snapshot of the agent's current configuration and creates/updates
    a marketplace listing. The agent must be owned by the current user.

    Args:
        request: Publish request with agent_id and commit message.
        user_id: Authenticated user ID (injected by dependency).
        auth_service: Authorization service (injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        PublishResponse with marketplace listing details.

    Raises:
        HTTPException: 403 if user doesn't own the agent, 404 if agent not found.
    """
    try:
        # Authorize write access (only owner can publish)
        agent = await auth_service.authorize_agent_write(request.agent_id, user_id)

        # Validate that agent has required fields (non-empty dict)
        if not agent.graph_config or not isinstance(agent.graph_config, dict):
            raise HTTPException(
                status_code=400,
                detail="Agent must have a configuration before publishing to marketplace",
            )

        # Publish the agent
        marketplace_service = AgentMarketplaceService(db)
        listing = await marketplace_service.publish_agent(
            agent=agent,
            commit_message=request.commit_message,
            is_published=request.is_published,
            readme=request.readme,
        )
        if not listing:
            raise HTTPException(status_code=404, detail="Marketplace listing not found")

        await db.commit()

        # Get the snapshot to return version info
        snapshot_repo = AgentSnapshotRepository(db)
        snapshot = await snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)

        return PublishResponse(
            marketplace_id=listing.id,
            agent_id=listing.agent_id,
            snapshot_version=snapshot.version if snapshot else 1,
            is_published=listing.is_published,
            readme=listing.readme,
        )
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.patch("/{marketplace_id}", response_model=AgentMarketplaceRead)
async def update_listing(
    marketplace_id: UUID,
    request: UpdateListingRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentMarketplaceRead:
    """
    Update details of a marketplace listing (e.g. README, publication status).
    Does NOT create a new snapshot.

    Args:
        marketplace_id: UUID of the marketplace listing.
        request: Update request with optional fields.
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        Updated marketplace listing.

    Raises:
        HTTPException: 404 if listing not found, 403 if user doesn't own it.
    """
    marketplace_repo = AgentMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Marketplace listing not found")

    if listing.user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't own this marketplace listing")

    marketplace_service = AgentMarketplaceService(db)
    update_data = AgentMarketplaceUpdate(
        readme=request.readme,
        is_published=request.is_published,
    )
    updated_listing = await marketplace_service.update_listing_details(marketplace_id, update_data)

    if not updated_listing:
        raise HTTPException(status_code=500, detail="Failed to update listing")

    await db.commit()

    return AgentMarketplaceRead(**updated_listing.model_dump())


@router.post("/unpublish/{marketplace_id}", status_code=204)
async def unpublish_agent(
    marketplace_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Unpublish a marketplace listing (hides it from public view).

    The listing and snapshots are retained but hidden. This doesn't affect
    agents that have already been forked.

    Args:
        marketplace_id: UUID of the marketplace listing to unpublish.
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Raises:
        HTTPException: 404 if listing not found, 403 if user doesn't own it.
    """
    marketplace_repo = AgentMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Marketplace listing not found")

    if listing.user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't own this marketplace listing")

    marketplace_service = AgentMarketplaceService(db)
    await marketplace_service.unpublish_agent(marketplace_id)
    await db.commit()


@router.delete("/{marketplace_id}", status_code=204)
async def delete_listing(
    marketplace_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Permanently delete a marketplace listing.

    Only the owner of the listing can delete it. This action cannot be undone.
    It does not delete the original agent or any forked agents.

    Args:
        marketplace_id: UUID of the marketplace listing to delete.
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Raises:
        HTTPException: 404 if listing not found, 403 if user doesn't own it.
    """
    marketplace_repo = AgentMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Marketplace listing not found")

    if listing.user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't own this marketplace listing")

    await marketplace_repo.delete_listing(marketplace_id)
    await db.commit()


@router.post("/fork/{marketplace_id}", response_model=ForkResponse)
async def fork_agent(
    marketplace_id: UUID,
    request: ForkRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ForkResponse:
    """
    Fork an agent from the marketplace to create your own copy.

    Creates a new agent owned by the current user based on the marketplace
    listing's active snapshot. The forked agent will have empty MCP and
    knowledge base configurations that need to be set up by the user.

    Args:
        marketplace_id: UUID of the marketplace listing to fork.
        request: Fork request with optional custom name.
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        ForkResponse with the new agent's details.

    Raises:
        HTTPException: 404 if listing not found, 400 if unpublished.
    """
    try:
        marketplace_service = AgentMarketplaceService(db)
        forked_agent = await marketplace_service.fork_agent(
            marketplace_id=marketplace_id,
            user_id=user_id,
            fork_name=request.custom_name,
        )

        await db.commit()

        return ForkResponse(
            agent_id=forked_agent.id,
            name=forked_agent.name,
            original_marketplace_id=marketplace_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[AgentMarketplaceRead])
async def search_marketplace(
    query: str | None = Query(None, description="Search query for name/description"),
    tags: list[str] | None = Query(None, description="Filter by tags"),
    sort_by: Literal["likes", "forks", "views", "recent", "oldest"] = Query("recent", description="Sort order"),
    limit: int = Query(20, ge=1, le=100, description="Number of results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    user_id: str | None = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[AgentMarketplaceRead]:
    """
    Search and list marketplace agents.

    Returns published marketplace listings with filtering, sorting, and pagination.

    Args:
        query: Optional text search query (searches name and description).
        tags: Optional list of tags to filter by (matches any).
        sort_by: Sort order (likes, forks, views, recent, oldest).
        limit: Maximum number of results (1-100).
        offset: Pagination offset.
        user_id: Authenticated user ID (optional, injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        List of marketplace listings with has_liked populated if user is authenticated.
    """
    marketplace_repo = AgentMarketplaceRepository(db)
    listings = await marketplace_repo.search_listings(
        query=query,
        tags=tags,
        only_published=True,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )

    # If user is authenticated, check which listings they've liked
    liked_map: dict[UUID, bool] = {}
    if user_id and listings:
        from app.repos.agent_like import AgentLikeRepository

        like_repo = AgentLikeRepository(db)
        listing_ids = [listing.id for listing in listings]
        liked_map = await like_repo.get_likes_for_listings(listing_ids, user_id)

    # Build response with has_liked populated
    return [
        AgentMarketplaceRead(
            **listing.model_dump(),
            has_liked=liked_map.get(listing.id, False),
        )
        for listing in listings
    ]


@router.get("/starred", response_model=list[AgentMarketplaceRead])
async def get_starred_listings(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[AgentMarketplaceRead]:
    """
    Get all marketplace listings starred by the current user.

    Args:
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        List of starred marketplace listings with has_liked=True.
    """
    marketplace_service = AgentMarketplaceService(db)
    listings = await marketplace_service.get_starred_listings(user_id)
    # All starred listings have has_liked=True by definition
    return [AgentMarketplaceRead(**listing.model_dump(), has_liked=True) for listing in listings]


@router.get("/{marketplace_id}", response_model=AgentMarketplaceReadWithSnapshot)
async def get_marketplace_listing(
    marketplace_id: UUID,
    user_id: str | None = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentMarketplaceReadWithSnapshot:
    """
    Get details of a marketplace listing with its active snapshot.

    Returns the full marketplace listing including configuration snapshot
    and requirements information.

    Args:
        marketplace_id: UUID of the marketplace listing.
        user_id: Authenticated user ID (optional, injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        Marketplace listing with snapshot details.

    Raises:
        HTTPException: 404 if listing not found or not published.
    """
    marketplace_service = AgentMarketplaceService(db)
    result = await marketplace_service.get_listing_with_snapshot(marketplace_id)

    if not result:
        raise HTTPException(status_code=404, detail="Marketplace listing not found")

    listing, snapshot = result

    # Check if published (unless it's the owner viewing it)
    if not listing.is_published and listing.user_id != user_id:
        raise HTTPException(status_code=404, detail="Marketplace listing not found")

    # Increment views if not the owner
    if user_id and listing.user_id != user_id:
        marketplace_repo = AgentMarketplaceRepository(db)
        await marketplace_repo.increment_views(marketplace_id)
        await db.commit()

    # Check if user has liked
    has_liked = False
    if user_id:
        has_liked = await marketplace_service.check_user_has_liked(marketplace_id, user_id)

    return AgentMarketplaceReadWithSnapshot(
        **listing.model_dump(),
        snapshot=AgentSnapshotRead(**snapshot.model_dump()),
        has_liked=has_liked,
    )


@router.get("/{marketplace_id}/requirements", response_model=RequirementsResponse)
async def get_listing_requirements(
    marketplace_id: UUID,
    db: AsyncSession = Depends(get_session),
) -> RequirementsResponse:
    """
    Get requirements for a marketplace listing.

    Returns information about MCP servers, knowledge base, and provider
    requirements needed to use this agent.

    Args:
        marketplace_id: UUID of the marketplace listing.
        db: Database session (injected by dependency).

    Returns:
        Requirements information.

    Raises:
        HTTPException: 404 if listing not found.
    """
    marketplace_repo = AgentMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Marketplace listing not found")

    snapshot_repo = AgentSnapshotRepository(db)
    snapshot = await snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)

    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    marketplace_service = AgentMarketplaceService(db)
    requirements = await marketplace_service.get_snapshot_requirements(snapshot)

    return RequirementsResponse(**requirements)


@router.post("/{marketplace_id}/like", response_model=LikeResponse)
async def toggle_like(
    marketplace_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> LikeResponse:
    """
    Toggle like on a marketplace listing.

    If the user has already liked the listing, it will be unliked.
    Otherwise, it will be liked.

    Args:
        marketplace_id: UUID of the marketplace listing.
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        LikeResponse with updated like status and count.

    Raises:
        HTTPException: 404 if listing not found.
    """
    marketplace_repo = AgentMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Marketplace listing not found")

    marketplace_service = AgentMarketplaceService(db)
    is_liked, likes_count = await marketplace_service.toggle_like(marketplace_id, user_id)

    await db.commit()

    return LikeResponse(is_liked=is_liked, likes_count=likes_count)


@router.get("/{marketplace_id}/history", response_model=list[AgentSnapshotRead])
async def get_listing_history(
    marketplace_id: UUID,
    db: AsyncSession = Depends(get_session),
) -> list[AgentSnapshotRead]:
    """
    Get version history of a marketplace listing.

    Args:
        marketplace_id: UUID of the marketplace listing.
        db: Database session (injected by dependency).

    Returns:
        List of agent snapshots.
    """
    marketplace_service = AgentMarketplaceService(db)
    snapshots = await marketplace_service.get_listing_history(marketplace_id)
    return [AgentSnapshotRead(**snapshot.model_dump()) for snapshot in snapshots]


@router.post("/{marketplace_id}/publish-version", response_model=AgentMarketplaceRead)
async def publish_version(
    marketplace_id: UUID,
    request: PublishVersionRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentMarketplaceRead:
    """
    Publish a specific version of the agent to the marketplace.

    Args:
        marketplace_id: UUID of the marketplace listing.
        request: Request containing the version number.
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        Updated marketplace listing.
    """
    marketplace_repo = AgentMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Marketplace listing not found")

    if listing.user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't own this marketplace listing")

    marketplace_service = AgentMarketplaceService(db)
    try:
        updated_listing = await marketplace_service.publish_specific_version(marketplace_id, request.version)
        if not updated_listing:
            raise HTTPException(status_code=404, detail="Marketplace listing not found")
        return AgentMarketplaceRead(**updated_listing.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{marketplace_id}/agent", response_model=AgentMarketplaceRead)
async def update_agent_and_listing(
    marketplace_id: UUID,
    request: UpdateAgentRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentMarketplaceRead:
    """
    Update agent details and publish a new version.

    Args:
        marketplace_id: UUID of the marketplace listing.
        request: Request containing update data and commit message.
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        Updated marketplace listing.
    """
    marketplace_repo = AgentMarketplaceRepository(db)
    listing = await marketplace_repo.get_by_id(marketplace_id)

    if not listing:
        raise HTTPException(status_code=404, detail="Marketplace listing not found")

    if listing.user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't own this marketplace listing")

    marketplace_service = AgentMarketplaceService(db)
    update_data = AgentMarketplaceUpdate(
        name=request.name,
        description=request.description,
        avatar=request.avatar,
        tags=request.tags,
        readme=request.readme,
    )

    try:
        updated_listing = await marketplace_service.update_agent_and_publish(
            marketplace_id, update_data, request.commit_message, request.graph_config
        )
        if not updated_listing:
            raise HTTPException(status_code=404, detail="Marketplace listing not found")
        return AgentMarketplaceRead(**updated_listing.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/agents/{agent_id}/pull-update", response_model=AgentRead)
async def pull_update(
    agent_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentRead:
    """
    Update a forked agent to the latest marketplace version.

    Args:
        agent_id: UUID of the forked agent.
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        Updated agent.
    """
    marketplace_service = AgentMarketplaceService(db)
    try:
        updated_agent = await marketplace_service.pull_listing_update(agent_id, user_id)
        return AgentRead(**updated_agent.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/my-listings/all", response_model=list[AgentMarketplaceRead])
async def get_my_listings(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[AgentMarketplaceRead]:
    """
    Get all marketplace listings created by the current user.

    Returns both published and unpublished listings owned by the user.

    Args:
        user_id: Authenticated user ID (injected by dependency).
        db: Database session (injected by dependency).

    Returns:
        List of user's marketplace listings.
    """
    marketplace_repo = AgentMarketplaceRepository(db)
    listings = await marketplace_repo.search_listings(
        user_id=user_id,
        only_published=False,  # Include unpublished
        sort_by="recent",
        limit=100,
    )

    return [AgentMarketplaceRead(**listing.model_dump()) for listing in listings]
