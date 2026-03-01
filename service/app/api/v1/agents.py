"""
Agent API Handlers.

This module provides the following endpoints for agent management:
- POST /: Create a new agent.
- GET /: Get all agents for the current user.
- GET /{agent_id}: Get details for a specific agent.
- PATCH /{agent_id}: Update an existing agent.
- DELETE /{agent_id}: Delete an agent.
- GET /system/chat: Get the user's default chat agent.
- GET /system/all: Get all user default agents.
- GET /stats: Get aggregated stats for all agents (from sessions/messages).
- GET /{agent_id}/stats: Get aggregated stats for a specific agent.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCodeError, handle_auth_error
from app.core.auth import AuthorizationService, get_auth_service
from app.core.system_agent import SystemAgentManager
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.agent import AgentCreate, AgentRead, AgentReadWithDetails, AgentScope, AgentUpdate, ConfigVisibility
from app.models.session_stats import AgentStatsAggregated, DailyStatsResponse, YesterdaySummary
from app.repos import AgentRepository, KnowledgeSetRepository, ProviderRepository
from app.repos.agent_marketplace import AgentMarketplaceRepository
from app.repos.root_agent import RootAgentRepository
from app.repos.scheduled_task import ScheduledTaskRepository
from app.repos.session import SessionRepository
from app.repos.session_stats import SessionStatsRepository

router = APIRouter(tags=["agents"])


@router.post("/", response_model=AgentRead)
async def create_agent(
    agent_data: AgentCreate,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> AgentRead:
    """
    Create a new agent for the current authenticated user.

    Validates that the target provider exists and is accessible to the user
    before creating the agent. The agent will be created with the provided
    configuration and linked to the specified MCP servers.

    Args:
        agent_data: Agent creation data including provider_id and mcp_server_ids
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentRead: The newly created agent with generated ID and timestamps

    Raises:
        HTTPException: 400 if provider not found, 403 if provider access denied
    """
    if agent_data.provider_id:
        try:
            await auth_service.authorize_provider_read(agent_data.provider_id, user_id)
        except ErrCodeError as e:
            raise handle_auth_error(e)

    # Validate knowledge_set_id if provided
    if agent_data.knowledge_set_id:
        knowledge_set_repo = KnowledgeSetRepository(db)
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(agent_data.knowledge_set_id)
        if not knowledge_set or knowledge_set.user_id != user_id or knowledge_set.is_deleted:
            raise HTTPException(status_code=400, detail="Knowledge set not found or access denied")

    # Force scope to USER for user-created agents
    agent_data.scope = AgentScope.USER

    agent_repo = AgentRepository(db)
    created_agent = await agent_repo.create_agent(agent_data, user_id)

    await db.commit()

    # Write FGA owner tuple (best-effort, don't fail the request)
    if auth_service.fga:
        try:
            await auth_service.fga.write_tuple(user_id, "owner", "agent", str(created_agent.id))
        except Exception:
            pass

    return AgentRead(**created_agent.model_dump())


@router.get("/", response_model=list[AgentReadWithDetails])
async def get_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[AgentReadWithDetails]:
    """
    Get all agents for the current authenticated user.

    Returns all agents owned by the authenticated user, ordered by creation time.
    Each agent includes its basic configuration, metadata, and associated MCP servers.
    If the user has no agents, default agents will be initialized for them.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        list[AgentReadWithDetails]: list of agents owned by the user with MCP server details

    Raises:
        HTTPException: None - this endpoint always succeeds
    """
    # Check if user has any agents
    agent_repo = AgentRepository(db)
    agents = await agent_repo.get_agents_by_user(user, exclude_root=False)

    # Heuristic: If user has 0 agents, check if they are a new user or just deleted everything.
    # We assume "New User" has 0 Agents AND 0 Sessions.
    # If they have sessions but no agents, they likely deleted the default agent intentionally.
    if not agents:
        session_repo = SessionRepository(db)
        sessions = await session_repo.get_sessions_by_user(user)

        if not sessions:
            # New user detected (no history), restore default agents
            system_manager = SystemAgentManager(db)
            await system_manager.ensure_user_default_agents(user)
            await db.commit()
            # Refetch agents
            agents = await agent_repo.get_agents_by_user(user, exclude_root=False)

    # Load MCP servers for each agent and create AgentReadWithDetails
    agents_with_details = []
    for agent in agents:
        # Get MCP servers for this agent
        mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)

        # Create agent dict with MCP servers
        agent_dict = agent.model_dump()
        agent_dict["mcp_servers"] = mcp_servers
        agents_with_details.append(AgentReadWithDetails(**agent_dict))

    return agents_with_details


class AgentReorderRequest(BaseModel):
    """Request body for reordering agents."""

    agent_ids: list[UUID]


@router.put("/reorder", status_code=204)
async def reorder_agents(
    request: AgentReorderRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Reorder agents by providing a list of agent IDs in the desired order.

    The sort_order of each agent will be updated based on its position in the list.
    Only agents owned by the current user will be updated.

    Args:
        request: Request body containing ordered list of agent IDs
        user_id: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        None: Returns 204 No Content on success
    """
    agent_repo = AgentRepository(db)
    await agent_repo.update_agents_sort_order(user_id, request.agent_ids)
    await db.commit()


@router.get("/stats", response_model=dict[str, AgentStatsAggregated])
async def get_all_agent_stats(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, AgentStatsAggregated]:
    """
    Get aggregated stats for all agents the user has interacted with.

    Stats are computed by aggregating data from sessions, topics, and messages.
    Returns a dictionary mapping agent_id to aggregated stats.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        dict[str, AgentStatsAggregated]: Dictionary of agent_id -> aggregated stats
    """
    stats_repo = SessionStatsRepository(db)
    return await stats_repo.get_all_agent_stats_for_user(user)


@router.get("/stats/{agent_id}/daily", response_model=DailyStatsResponse)
async def get_agent_daily_stats(
    agent_id: str,
    days: int = 7,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> DailyStatsResponse:
    """
    Get daily message counts for an agent's sessions over the last N days.

    Useful for activity visualization charts. Returns counts for each day,
    including days with zero activity.

    Args:
        agent_id: Agent identifier (UUID string or builtin agent ID)
        days: Number of days to include (default: 7)
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        DailyStatsResponse: Daily message counts for the agent
    """
    from app.models.sessions import builtin_agent_id_to_uuid

    # Resolve agent ID to UUID
    if agent_id.startswith("builtin_"):
        agent_uuid = builtin_agent_id_to_uuid(agent_id)
    else:
        try:
            agent_uuid = UUID(agent_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid agent ID format: '{agent_id}'")

    stats_repo = SessionStatsRepository(db)
    return await stats_repo.get_daily_stats_for_agent(agent_uuid, user, days)


@router.get("/stats/{agent_id}/yesterday", response_model=YesterdaySummary)
async def get_agent_yesterday_summary(
    agent_id: str,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> YesterdaySummary:
    """
    Get yesterday's activity summary for an agent's sessions.

    Returns the message count and optionally a preview of the last message.
    Useful for displaying "You had X conversations yesterday" type summaries.

    Args:
        agent_id: Agent identifier (UUID string or builtin agent ID)
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        YesterdaySummary: Yesterday's activity summary
    """
    from app.models.sessions import builtin_agent_id_to_uuid

    # Resolve agent ID to UUID
    if agent_id.startswith("builtin_"):
        agent_uuid = builtin_agent_id_to_uuid(agent_id)
    else:
        try:
            agent_uuid = UUID(agent_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid agent ID format: '{agent_id}'")

    stats_repo = SessionStatsRepository(db)
    return await stats_repo.get_yesterday_summary_for_agent(agent_uuid, user)


@router.get("/system/chat", response_model=AgentReadWithDetails)
async def get_system_chat_agent(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentReadWithDetails:
    """
    Get the user's default chat agent.

    Returns the user's personal copy of the "小二" agent with MCP server details.
    If it doesn't exist, it will be initialized.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentReadWithDetails: The user's chat agent with MCP server details

    Raises:
        HTTPException: 404 if chat agent not found
    """
    agent_repo = AgentRepository(db)
    agents = await agent_repo.get_agents_by_user(user)

    chat_agent = next((a for a in agents if a.tags and "default_chat" in a.tags), None)

    if not chat_agent:
        system_manager = SystemAgentManager(db)
        new_agents = await system_manager.ensure_user_default_agents(user)
        await db.commit()
        chat_agent = next((a for a in new_agents if a.tags and "default_chat" in a.tags), None)

    if not chat_agent:
        raise HTTPException(status_code=404, detail="Chat agent not found")

    # Get MCP servers for the agent
    mcp_servers = await agent_repo.get_agent_mcp_servers(chat_agent.id)

    # Create agent dict with MCP servers
    agent_dict = chat_agent.model_dump()
    agent_dict["mcp_servers"] = mcp_servers
    return AgentReadWithDetails(**agent_dict)


@router.get("/system/all", response_model=list[AgentReadWithDetails])
async def get_all_system_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[AgentReadWithDetails]:
    """
    Get all default agents for the user.

    Returns the user's personal copies of system agents with MCP server details.
    These are the agents tagged with 'default_'.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        list[AgentReadWithDetails]: list of all user default agents with MCP server details
    """
    agent_repo = AgentRepository(db)
    agents = await agent_repo.get_agents_by_user(user)

    # Filter for default agents
    default_agents = [a for a in agents if a.tags and any(t.startswith("default_") for t in a.tags)]

    if not default_agents:
        system_manager = SystemAgentManager(db)
        default_agents = await system_manager.ensure_user_default_agents(user)
        await db.commit()

    # Load MCP servers for each system agent
    agents_with_details = []

    for agent in default_agents:
        # Get MCP servers for this agent
        mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)

        # Create agent dict with MCP servers
        agent_dict = agent.model_dump()
        agent_dict["mcp_servers"] = mcp_servers
        agents_with_details.append(AgentReadWithDetails(**agent_dict))

    return agents_with_details


@router.get("/{agent_id}", response_model=AgentReadWithDetails)
async def get_agent(
    agent_id: UUID,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> AgentReadWithDetails:
    """
    Get a single agent by ID.

    Returns the requested agent with full configuration details including MCP servers.
    Authorization ensures the user has access to the agent (owner or system agent).

    Args:
        agent_id: UUID of the agent to fetch
        user_id: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentReadWithDetails: The requested agent with MCP server details

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied
    """
    try:
        agent = await auth_service.authorize_agent_read(agent_id, user_id)

        agent_repo = AgentRepository(db)
        mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)

        # Check if user is the owner
        is_owner = agent.user_id == user_id

        # Create agent dict with MCP servers
        agent_dict = agent.model_dump()
        agent_dict["mcp_servers"] = mcp_servers

        # Hide config for non-owners when visibility is hidden
        if not is_owner and agent.config_visibility == ConfigVisibility.HIDDEN:
            agent_dict["graph_config"] = None

        return AgentReadWithDetails(**agent_dict)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.patch("/{agent_id}", response_model=AgentReadWithDetails)
async def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> AgentReadWithDetails:
    """
    Update an existing agent's properties.

    Allows modification of agent configuration including provider assignment
    and MCP server links. Authorization is handled by the dependency which
    ensures the user owns the agent.

    Args:
        agent_data: Partial update data (only provided fields will be updated)
        agent: Authorized agent instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentReadWithDetails: The updated agent with new timestamps and MCP servers

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied,
                      400 if provider not found, 500 if update operation fails unexpectedly
    """
    try:
        agent = await auth_service.authorize_agent_write(agent_id, user_id)

        if agent.scope == AgentScope.SYSTEM:
            raise HTTPException(status_code=403, detail="Cannot modify system agents")

        # Root agent: only allow name, description, avatar changes
        root_agent_repo = RootAgentRepository(db)
        if await root_agent_repo.is_root_agent(agent_id, user_id):
            _allowed = {"name", "description", "avatar", "auto_explore_enabled"}
            forbidden = {
                field
                for field, value in agent_data.model_dump(exclude_unset=True).items()
                if field not in _allowed and value is not None
            }
            if forbidden:
                raise HTTPException(
                    status_code=403,
                    detail=f"Root agent only allows editing: {', '.join(sorted(_allowed))}",
                )

        # Block config editing for non-editable agents
        if not agent.config_editable and agent_data.graph_config is not None:
            raise HTTPException(
                status_code=403,
                detail="This agent's configuration cannot be edited",
            )

        if agent_data.provider_id is not None:
            provider_repo = ProviderRepository(db)
            provider = await provider_repo.get_provider_by_id(agent_data.provider_id)
            if not provider:
                raise HTTPException(status_code=400, detail="Provider not found")
            # Check if user can access this provider (own or system)
            if provider.user_id != agent.user_id and not provider.is_system:
                raise HTTPException(status_code=403, detail="Provider access denied")

        # Validate knowledge_set_id only if it's being changed to a different value
        if agent_data.knowledge_set_id is not None and agent_data.knowledge_set_id != agent.knowledge_set_id:
            knowledge_set_repo = KnowledgeSetRepository(db)
            knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(agent_data.knowledge_set_id)
            if not knowledge_set or knowledge_set.user_id != user_id or knowledge_set.is_deleted:
                raise HTTPException(status_code=400, detail="Knowledge set not found or access denied")

        agent_repo = AgentRepository(db)
        updated_agent = await agent_repo.update_agent(agent.id, agent_data)
        if not updated_agent:
            raise HTTPException(status_code=500, detail="Failed to update agent")

        await db.commit()

        # Get MCP servers for the updated agent
        mcp_servers = await agent_repo.get_agent_mcp_servers(updated_agent.id)

        # Create agent dict with MCP servers
        agent_dict = updated_agent.model_dump()
        agent_dict["mcp_servers"] = mcp_servers
        return AgentReadWithDetails(**agent_dict)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: UUID,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete an agent and all its associated MCP server links (cascade delete).

    This operation is idempotent - it will return 204 No Content even if the agent
    doesn't exist. MCP server links are deleted first to maintain referential integrity,
    followed by the agent itself. Authorization ensures only the agent owner
    can delete agents.

    Args:
        agent: Authorized agent instance or None if not found (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        None: Always returns 204 No Content status

    Raises:
        HTTPException: 403 if access denied
        (but NOT if agent doesn't exist - returns 204 instead)
    """
    try:
        agent = await auth_service.authorize_agent_delete(agent_id, user_id)

        if agent.scope == AgentScope.SYSTEM:
            raise HTTPException(status_code=403, detail="Cannot delete system agents")

        root_agent_repo = RootAgentRepository(db)
        if await root_agent_repo.is_root_agent(agent_id, user_id):
            raise HTTPException(status_code=403, detail="Cannot delete root agent")

        # ALLOW deletion of default agents
        # if agent.tags and any(tag.startswith("default_") for tag in agent.tags):
        #     raise HTTPException(status_code=403, detail="Cannot delete default agents")

        # Cascade delete: Clean up marketplace listing if exists
        marketplace_repo = AgentMarketplaceRepository(db)
        listing = await marketplace_repo.get_by_agent_id(agent.id)
        if listing:
            await marketplace_repo.delete_listing(listing.id)

        agent_repo = AgentRepository(db)
        await agent_repo.delete_agent(agent.id)
        await db.commit()
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.get("/{agent_id}/stats", response_model=AgentStatsAggregated)
async def get_agent_stats(
    agent_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentStatsAggregated:
    """
    Get aggregated stats for a specific agent.

    Stats are computed by aggregating data from sessions, topics, and messages
    across all sessions the user has with this agent.

    Args:
        agent_id: The UUID of the agent
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentStatsAggregated: The agent's aggregated usage statistics

    Raises:
        HTTPException: 404 if agent not found or not owned by user
    """
    agent_repo = AgentRepository(db)
    agent = await agent_repo.get_agent_by_id(agent_id)

    if not agent or agent.user_id != user:
        raise HTTPException(status_code=404, detail="Agent not found")

    stats_repo = SessionStatsRepository(db)
    return await stats_repo.get_agent_stats(agent_id, user)


# ---------------------------------------------------------------------------
# Auto-Explore toggle
# ---------------------------------------------------------------------------

AUTO_EXPLORE_PROMPT = """\
[Auto-Explore Mode — Autonomous Research Session]

You are running autonomously in auto-explore mode. There is NO user present. \
Do NOT ask questions or request clarification — make reasonable assumptions.

## Instructions

1. **Read your memories**: Use `read_core_memory` and `search_memory` to recall the user's \
interests, recent topics, goals, and any exploration backlog.
2. **Choose 1–3 topics** to explore based on what you found.
3. **Research**: Use `web_search` and `literature_search` to find recent developments, \
news, papers, or tutorials related to those topics.
4. **Save findings**: Use `manage_memory` to store the most noteworthy discoveries \
so the user benefits from them in future conversations.
5. **Write a digest**: Produce a clear, concise summary of what you found. Use bullet \
points with sources.

## Schedule Your Next Exploration

After finishing, you MUST call `create_scheduled_task` to schedule your next \
auto-explore session. Guidelines for timing:
- If you found a lot of activity → schedule in 6–12 hours
- If things were quiet → schedule in 18–24 hours
- Always use `schedule_type="once"` and set `scheduled_at` to the chosen time
- Always include `metadata={"type": "auto_explore"}` so the system can track it
- Set `max_runs=1`

## Important

- Do NOT use `ask_user_question` — it is unavailable in this mode.
- Keep your digest concise (2–4 paragraphs max).
- Focus on breadth: cover multiple topics rather than going very deep on one.
"""


class AutoExploreToggleResponse(BaseModel):
    enabled: bool
    scheduled_task_id: str | None = None


@router.post("/{agent_id}/auto-explore", response_model=AutoExploreToggleResponse)
async def enable_auto_explore(
    agent_id: UUID,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> AutoExploreToggleResponse:
    """Enable auto-explore for the root agent. Creates the first scheduled task."""
    try:
        agent = await auth_service.authorize_agent_write(agent_id, user_id)
    except ErrCodeError as e:
        raise handle_auth_error(e)

    # Must be root agent
    root_agent_repo = RootAgentRepository(db)
    if not await root_agent_repo.is_root_agent(agent_id, user_id):
        raise HTTPException(status_code=403, detail="Auto-explore is only available for the root agent")

    # Check if already enabled (with FOR UPDATE to prevent race conditions)
    sched_repo = ScheduledTaskRepository(db)
    existing = await sched_repo.get_active_auto_explore(user_id, for_update=True)
    if existing:
        return AutoExploreToggleResponse(enabled=True, scheduled_task_id=str(existing.id))

    # Create the first scheduled task (run in 5 seconds to start quickly)
    from datetime import datetime, timedelta, timezone

    from app.models.scheduled_task import ScheduledTaskCreate
    from app.tasks.scheduled import execute_scheduled_chat

    first_run = datetime.now(timezone.utc) + timedelta(seconds=5)
    task = await sched_repo.create(
        ScheduledTaskCreate(
            agent_id=agent_id,
            prompt=AUTO_EXPLORE_PROMPT,
            schedule_type="once",
            scheduled_at=first_run,
            timezone="UTC",
            max_runs=1,
            metadata={"type": "auto_explore"},
        ),
        user_id,
    )

    try:
        result = execute_scheduled_chat.apply_async(args=(str(task.id),), eta=first_run)
        await sched_repo.update_celery_task_id(task.id, result.id)
    except Exception:
        # Celery dispatch failed — remove the orphan task record
        await sched_repo.mark_failed(task.id, "Failed to dispatch Celery task")
        raise HTTPException(status_code=503, detail="Task scheduler unavailable")

    # Update agent flag
    agent_repo = AgentRepository(db)
    await agent_repo.update_agent(agent.id, AgentUpdate(auto_explore_enabled=True))
    await db.commit()

    return AutoExploreToggleResponse(enabled=True, scheduled_task_id=str(task.id))


@router.delete("/{agent_id}/auto-explore", response_model=AutoExploreToggleResponse)
async def disable_auto_explore(
    agent_id: UUID,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> AutoExploreToggleResponse:
    """Disable auto-explore. Cancels pending scheduled task and breaks the loop."""
    try:
        agent = await auth_service.authorize_agent_write(agent_id, user_id)
    except ErrCodeError as e:
        raise handle_auth_error(e)

    root_agent_repo = RootAgentRepository(db)
    if not await root_agent_repo.is_root_agent(agent_id, user_id):
        raise HTTPException(status_code=403, detail="Auto-explore is only available for the root agent")

    # Find and cancel active auto-explore task
    sched_repo = ScheduledTaskRepository(db)
    existing = await sched_repo.get_active_auto_explore(user_id)
    if existing:
        if existing.celery_task_id:
            from app.core.celery_app import celery_app

            celery_app.control.revoke(existing.celery_task_id, terminate=False)
        await sched_repo.mark_cancelled(existing.id)

    # Update agent flag
    agent_repo = AgentRepository(db)
    await agent_repo.update_agent(agent.id, AgentUpdate(auto_explore_enabled=False))
    await db.commit()

    return AutoExploreToggleResponse(enabled=False)


@router.get("/{agent_id}/auto-explore", response_model=AutoExploreToggleResponse)
async def get_auto_explore_status(
    agent_id: UUID,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> AutoExploreToggleResponse:
    """Get auto-explore status for an agent."""
    try:
        await auth_service.authorize_agent_read(agent_id, user_id)
    except ErrCodeError as e:
        raise handle_auth_error(e)

    sched_repo = ScheduledTaskRepository(db)
    existing = await sched_repo.get_active_auto_explore(user_id)
    return AutoExploreToggleResponse(
        enabled=existing is not None,
        scheduled_task_id=str(existing.id) if existing else None,
    )
