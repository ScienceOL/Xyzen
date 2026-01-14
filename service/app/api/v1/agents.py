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
from sqlmodel.ext.asyncio.session import AsyncSession

from app.agents.types import SystemAgentInfo
from app.common.code import ErrCodeError, handle_auth_error
from app.core.auth import AuthorizationService, get_auth_service
from app.core.system_agent import SystemAgentManager
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.agent import AgentCreate, AgentRead, AgentReadWithDetails, AgentScope, AgentUpdate
from app.models.session_stats import AgentStatsAggregated, DailyStatsResponse, YesterdaySummary
from app.repos import AgentRepository, KnowledgeSetRepository, ProviderRepository
from app.repos.agent_marketplace import AgentMarketplaceRepository
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
    agents = await agent_repo.get_agents_by_user(user)

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
            agents = await agent_repo.get_agents_by_user(user)

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


@router.get("/templates/system", response_model=list[SystemAgentInfo])
async def get_system_agent_templates(
    user: str = Depends(get_current_user),
) -> list[SystemAgentInfo]:
    """
    Get all available system agent templates that users can add.

    Returns a list of system agents (like ReAct, Deep Research) that users
    can create instances of. Each template includes metadata about the agent's
    capabilities and purpose.

    Args:
        user: Authenticated user ID (injected by dependency)

    Returns:
        list[SystemAgentInfo]: List of available system agent templates
    """
    # Lazy import to avoid circular dependency
    from app.agents.factory import list_available_system_agents

    return list_available_system_agents()


@router.post("/from-template/{system_key}", response_model=AgentRead)
async def create_agent_from_template(
    system_key: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentRead:
    """
    Create a new agent from a system agent template.

    This creates a user agent with the system agent's graph_config pre-populated,
    allowing users to use or customize system agents like Deep Research.

    Args:
        system_key: Key of the system agent template (e.g., "react", "deep_research")
        user_id: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentRead: The newly created agent with graph_config from the template

    Raises:
        HTTPException: 404 if system agent template not found
    """
    from app.agents.system import system_agent_registry

    # Get the system agent class
    agent_class = system_agent_registry.get_class(system_key)
    if not agent_class:
        raise HTTPException(status_code=404, detail=f"System agent template '{system_key}' not found")

    # Create an instance and get the forkable config (includes graph_config)
    system_agent = agent_class()
    forkable_config = system_agent.get_forkable_config()

    # Create the agent with the exported graph_config
    agent_data = AgentCreate(
        scope=AgentScope.USER,
        name=forkable_config.get("name", system_agent.name),
        description=forkable_config.get("description", system_agent.description),
        tags=forkable_config.get("tags", []),
        graph_config=forkable_config.get("graph_config"),
    )

    agent_repo = AgentRepository(db)
    created_agent = await agent_repo.create_agent(agent_data, user_id)

    await db.commit()
    return AgentRead(**created_agent.model_dump())


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

    Returns the user's personal copy of the "随便聊聊" agent with MCP server details.
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

        # Create agent dict with MCP servers
        agent_dict = agent.model_dump()
        agent_dict["mcp_servers"] = mcp_servers
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
