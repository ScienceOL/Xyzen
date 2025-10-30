from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from middleware.auth import get_current_user
from middleware.database import get_session
from models.agent import Agent as AgentModel
from models.agent import AgentCreate, AgentRead, AgentReadWithDetails, AgentUpdate
from models.mcp import McpServer  # Import McpServer to resolve forward reference

# Ensure forward references are resolved after importing both models
try:
    AgentReadWithDetails.model_rebuild()
except Exception as e:
    # If rebuild fails, log the error for debugging
    import logging

    logging.getLogger(__name__).warning(f"Failed to rebuild AgentReadWithDetails: {e}")
from repo import AgentRepository, ProviderRepository

router = APIRouter()


async def _verify_agent_authorization(
    agent_id: UUID, user: str, db: AsyncSession, allow_missing: bool = False
) -> AgentModel | None:
    """
    Core authorization logic for agent access validation.

    Args:
        agent_id: UUID of the agent to verify
        user: Authenticated user ID
        db: Database session
        allow_missing: If True, returns None for missing agents instead of raising 404

    Returns:
        Agent | None: The authorized agent instance, or None if not found and allow_missing=True

    Raises:
        HTTPException: 404 if agent not found (unless allow_missing=True),
                      403 if access denied
    """
    agent_repo = AgentRepository(db)
    agent = await agent_repo.get_agent_by_id(agent_id)

    if not agent:
        if allow_missing:
            return None
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied: You don't have permission to access this agent")

    return agent


async def get_authorized_agent(
    agent_id: UUID, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> AgentModel:
    """
    FastAPI dependency that validates agent access authorization.

    This dependency ensures the agent exists and belongs to the
    authenticated user. Used for operations that require
    the agent to exist (GET, PATCH).

    Args:
        agent_id: UUID from the path parameter
        user: Authenticated user ID from get_current_user dependency
        db: Database session from get_session dependency

    Returns:
        Agent: The authorized agent instance

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied
    """
    agent = await _verify_agent_authorization(agent_id, user, db, allow_missing=False)
    # Type checker can't infer that agent is not None here
    return agent  # type: ignore


async def get_authorized_agent_for_delete(
    agent_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentModel | None:
    """
    FastAPI dependency for delete operations with idempotent behavior.

    Unlike the standard authorization dependency, this one returns None
    when an agent doesn't exist rather than raising a 404 exception.
    This enables idempotent DELETE operations where calling DELETE
    on a non-existent resource still returns 204 No Content.

    Args:
        agent_id: UUID from the path parameter
        user: Authenticated user ID from get_current_user dependency
        db: Database session from get_session dependency

    Returns:
        Agent | None: The authorized agent instance, or None if agent doesn't exist

    Raises:
        HTTPException: 403 if access denied
        (but NOT if agent doesn't exist - returns None instead)
    """
    return await _verify_agent_authorization(agent_id, user, db, allow_missing=True)


@router.post("/", response_model=AgentRead)
async def create_agent(
    agent_data: AgentCreate,
    user: str = Depends(get_current_user),
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
        provider_repo = ProviderRepository(db)
        provider = await provider_repo.get_provider_by_id(agent_data.provider_id)
        if not provider:
            raise HTTPException(status_code=400, detail="Provider not found")
        if provider.user_id != user and not provider.is_system:
            raise HTTPException(status_code=403, detail="Provider access denied")

    agent_repo = AgentRepository(db)
    created_agent = await agent_repo.create_agent(agent_data, user)

    await db.commit()
    return AgentRead(**created_agent.model_dump())


@router.get("/", response_model=List[AgentReadWithDetails])
async def get_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> List[AgentReadWithDetails]:
    """
    Get all agents for the current authenticated user.

    Returns all agents owned by the authenticated user, ordered by creation time.
    Each agent includes its basic configuration, metadata, and associated MCP servers.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        List[AgentReadWithDetails]: List of agents owned by the user with MCP server details

    Raises:
        HTTPException: None - this endpoint always succeeds, returning empty list if no agents
    """
    agent_repo = AgentRepository(db)
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


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(
    agent: AgentModel = Depends(get_authorized_agent),
) -> AgentRead:
    """
    Get a single agent by ID.

    Returns the requested agent with full configuration details.
    Authorization is handled by the dependency which ensures the user
    owns the agent.

    Args:
        agent: Authorized agent instance (injected by dependency)

    Returns:
        AgentRead: The requested agent with full details

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied
    """
    return AgentRead(**agent.model_dump())


@router.patch("/{agent_id}", response_model=AgentRead)
async def update_agent(
    agent_data: AgentUpdate,
    agent: AgentModel = Depends(get_authorized_agent),
    db: AsyncSession = Depends(get_session),
) -> AgentRead:
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
        AgentRead: The updated agent with new timestamps

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied,
                      400 if provider not found, 500 if update operation fails unexpectedly
    """
    if agent_data.provider_id is not None:
        provider_repo = ProviderRepository(db)
        provider = await provider_repo.get_provider_by_id(agent_data.provider_id)
        if not provider:
            raise HTTPException(status_code=400, detail="Provider not found")
        # Check if user can access this provider (own or system)
        if provider.user_id != agent.user_id and not provider.is_system:
            raise HTTPException(status_code=403, detail="Provider access denied")

    agent_repo = AgentRepository(db)
    updated_agent = await agent_repo.update_agent(agent.id, agent_data)
    if not updated_agent:
        raise HTTPException(status_code=500, detail="Failed to update agent")

    await db.commit()
    return AgentRead(**updated_agent.model_dump())


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent: AgentModel | None = Depends(get_authorized_agent_for_delete),
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
    if agent is None:
        return
    agent_repo = AgentRepository(db)
    await agent_repo.delete_agent(agent.id)
    await db.commit()
    return
