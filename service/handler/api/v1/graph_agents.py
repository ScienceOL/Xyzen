"""
Graph Agent API endpoints for managing graph-based agents.

This module provides REST API endpoints for creating, reading, updating, deleting,
and executing graph agents. Graph agents are distinct from regular agents and use
the LangGraph execution engine with nodes and edges.
"""

from typing import Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from core.chat.langgraph import execute_graph_agent_sync
from infra.database import get_session
from middleware.auth import get_current_user
from models.graph import (
    GraphAgent,
    GraphAgentCreate,
    GraphAgentRead,
    GraphAgentUpdate,
    GraphAgentWithGraph,
    GraphExecutionResult,
)
from repos.graph import GraphRepository

router = APIRouter(tags=["graph-agents"])


async def _verify_graph_agent_authorization(
    agent_id: UUID, user: str, db: AsyncSession, allow_missing: bool = False
) -> GraphAgent | None:
    """
    Core authorization logic for graph agent access validation.

    Args:
        agent_id: UUID of the graph agent to verify
        user: Authenticated user ID
        db: Database session
        allow_missing: If True, returns None for missing agents instead of raising 404

    Returns:
        GraphAgent | None: The authorized agent instance, or None if not found and allow_missing=True

    Raises:
        HTTPException: 404 if agent not found (unless allow_missing=True),
                      403 if access denied
    """
    repo = GraphRepository(db)
    agent = await repo.get_graph_agent_by_id(agent_id)

    if not agent:
        if allow_missing:
            return None
        raise HTTPException(status_code=404, detail="Graph agent not found")

    if agent.user_id != user:
        raise HTTPException(
            status_code=403, detail="Access denied: You don't have permission to access this graph agent"
        )

    return agent


async def get_authorized_graph_agent(
    agent_id: UUID, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> GraphAgent:
    """
    FastAPI dependency that validates graph agent access authorization.

    Args:
        agent_id: UUID from the path parameter
        user: Authenticated user ID from get_current_user dependency
        db: Database session from get_session dependency

    Returns:
        GraphAgent: The authorized graph agent instance

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied
    """
    agent = await _verify_graph_agent_authorization(agent_id, user, db, allow_missing=False)
    return agent  # type: ignore


async def get_authorized_graph_agent_for_delete(
    agent_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> GraphAgent | None:
    """
    FastAPI dependency for delete operations with idempotent behavior.

    Args:
        agent_id: UUID from the path parameter
        user: Authenticated user ID from get_current_user dependency
        db: Database session from get_session dependency

    Returns:
        GraphAgent | None: The authorized agent instance, or None if agent doesn't exist

    Raises:
        HTTPException: 403 if access denied
    """
    return await _verify_graph_agent_authorization(agent_id, user, db, allow_missing=True)


@router.post("/", response_model=GraphAgentRead)
async def create_graph_agent(
    agent_data: GraphAgentCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> GraphAgentRead:
    """
    Create a new graph agent for the current authenticated user.

    Creates a graph agent with the provided state schema and initial configuration.
    The agent starts empty (no nodes/edges) and can be built using the node/edge
    management endpoints or via the MCP graph tools.

    Args:
        agent_data: Graph agent creation data
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        GraphAgentRead: The newly created graph agent with generated ID and timestamps

    Raises:
        HTTPException: 400 if invalid data provided
    """
    repo = GraphRepository(db)
    created_agent = await repo.create_graph_agent(agent_data, user)
    await db.commit()
    return GraphAgentRead(**created_agent.model_dump())


@router.get("/", response_model=List[GraphAgentRead])
async def get_graph_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> List[GraphAgentRead]:
    """
    Get all graph agents for the current authenticated user.

    Returns all graph agents owned by the authenticated user, ordered by creation time.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        List[GraphAgentRead]: List of graph agents owned by the user
    """
    repo = GraphRepository(db)
    agents = await repo.get_graph_agents_by_user(user)
    return [GraphAgentRead(**agent.model_dump()) for agent in agents]


@router.get("/published", response_model=list[GraphAgentRead])
async def get_all_published_graph_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> List[GraphAgentRead]:
    """
    Get all published graph agents from all users for Explorer discovery.

    Returns all graph agents where is_published=True, regardless of ownership.
    This allows users to discover and view published graphs from other users
    in the Explorer interface. Results are ordered by creation time (newest first).

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        List[GraphAgentRead]: List of all published graph agents from all users
    """
    repo = GraphRepository(db)
    agents = await repo.get_all_published_graph_agents()
    return [GraphAgentRead(**agent.model_dump()) for agent in agents]


@router.get("/published/my", response_model=list[GraphAgentRead])
async def get_my_published_graph_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> List[GraphAgentRead]:
    """
    Get all published graph agents owned by the current authenticated user.

    Returns only the published graph agents that belong to the authenticated user,
    ordered by creation time. Useful for users to manage their own published graphs.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        List[GraphAgentRead]: List of published graph agents owned by the user
    """
    repo = GraphRepository(db)
    agents = await repo.get_published_graph_agents_by_user(user)
    return [GraphAgentRead(**agent.model_dump()) for agent in agents]


@router.get("/official", response_model=list[GraphAgentRead])
async def get_official_graph_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> List[GraphAgentRead]:
    """
    Get all official graph agents (is_official=True).

    Returns all graph agents marked as official, regardless of published status.
    Official agents are accessible to all users and typically represent
    built-in or verified agents from the platform.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        List[GraphAgentRead]: List of all official graph agents
    """
    repo = GraphRepository(db)
    agents = await repo.get_official_graph_agents()
    return [GraphAgentRead(**agent.model_dump()) for agent in agents]


@router.get("/official/published", response_model=list[GraphAgentRead])
async def get_official_published_graph_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> List[GraphAgentRead]:
    """
    Get all official graph agents that are also published.

    Returns official graph agents where both is_official=True and is_published=True.
    This is useful for showing curated official agents in public-facing interfaces.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        List[GraphAgentRead]: List of official and published graph agents
    """
    repo = GraphRepository(db)
    agents = await repo.get_published_official_agents()
    return [GraphAgentRead(**agent.model_dump()) for agent in agents]


@router.get("/{agent_id}", response_model=GraphAgentWithGraph)
async def get_graph_agent(
    agent: GraphAgent = Depends(get_authorized_graph_agent),
    db: AsyncSession = Depends(get_session),
) -> GraphAgentWithGraph:
    """
    Get a single graph agent by ID with full graph structure (nodes and edges).

    Returns the requested graph agent with complete configuration details
    including all nodes and edges that make up the graph structure.

    Args:
        agent: Authorized graph agent instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        GraphAgentWithGraph: The requested agent with full graph structure

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied
    """
    repo = GraphRepository(db)
    agent_with_graph = await repo.get_graph_agent_with_graph(agent.id)
    if not agent_with_graph:
        raise HTTPException(status_code=404, detail="Graph agent not found")

    return agent_with_graph


@router.patch("/{agent_id}", response_model=GraphAgentRead)
async def update_graph_agent(
    agent_data: GraphAgentUpdate,
    agent: GraphAgent = Depends(get_authorized_graph_agent),
    db: AsyncSession = Depends(get_session),
) -> GraphAgentRead:
    """
    Update an existing graph agent's properties.

    Allows modification of graph agent configuration including name, description,
    and state schema. Individual nodes and edges should be managed via separate
    endpoints or MCP tools.

    Args:
        agent_data: Partial update data (only provided fields will be updated)
        agent: Authorized graph agent instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        GraphAgentRead: The updated graph agent with new timestamps

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied,
                      500 if update operation fails unexpectedly
    """
    repo = GraphRepository(db)
    updated_agent = await repo.update_graph_agent(agent.id, agent_data)
    if not updated_agent:
        raise HTTPException(status_code=500, detail="Failed to update graph agent")

    await db.commit()
    return GraphAgentRead(**updated_agent.model_dump())


@router.patch("/{agent_id}/toggle-publish", response_model=GraphAgentRead)
async def toggle_graph_agent_publish(
    agent: GraphAgent = Depends(get_authorized_graph_agent),
    db: AsyncSession = Depends(get_session),
) -> GraphAgentRead:
    """
    Toggle the publish status of a graph agent.

    Convenience endpoint to toggle is_published between True and False.
    Only the owner of the graph agent can toggle its publish status.

    Args:
        agent: Authorized graph agent instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        GraphAgentRead: The updated graph agent with toggled publish status

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied,
                      500 if update operation fails unexpectedly
    """
    repo = GraphRepository(db)
    # Toggle the current publish status
    update_data = GraphAgentUpdate(is_published=not agent.is_published)
    updated_agent = await repo.update_graph_agent(agent.id, update_data)
    if not updated_agent:
        raise HTTPException(status_code=500, detail="Failed to toggle publish status")

    await db.commit()
    return GraphAgentRead(**updated_agent.model_dump())


@router.delete("/{agent_id}", status_code=204)
async def delete_graph_agent(
    agent: GraphAgent | None = Depends(get_authorized_graph_agent_for_delete),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete a graph agent and all its associated nodes and edges (cascade delete).

    This operation is idempotent - it will return 204 No Content even if the agent
    doesn't exist. All nodes and edges are deleted first to maintain referential
    integrity, followed by the agent itself.

    Args:
        agent: Authorized graph agent instance or None if not found (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        None: Always returns 204 No Content status

    Raises:
        HTTPException: 403 if access denied
    """
    if agent is None:
        return

    repo = GraphRepository(db)
    await repo.delete_graph_agent(agent.id)
    await db.commit()
    return


@router.post("/{agent_id}/execute", response_model=dict[str, Any])
async def execute_graph_agent(
    agent_id: UUID,
    input_state: dict[str, Any],
    agent: GraphAgent = Depends(get_authorized_graph_agent),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Execute a graph agent with the provided input state.

    Runs the graph agent using the LangGraph execution engine. The agent must
    have at least a start node and some connected nodes to execute successfully.

    Args:
        agent_id: UUID of the graph agent to execute
        input_state: Initial state data for execution
        agent: Authorized graph agent instance (injected by dependency)
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        dict: Execution result including final state and execution metadata

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied,
                      400 if agent has invalid graph structure,
                      500 if execution fails
    """
    try:
        # Add user_id to input state for execution context
        enhanced_input_state: dict[str, Any] = {
            **input_state,
            "execution_context": {**input_state.get("execution_context", {}), "user_id": user},
        }

        # Execute graph agent synchronously
        result: GraphExecutionResult = await execute_graph_agent_sync(db, agent_id, enhanced_input_state, user)

        if result.success:
            return {
                "success": True,
                "message": f"Graph agent executed successfully in {result.execution_time_ms}ms",
                "agent_id": str(agent_id),
                "final_state": result.final_state,
                "execution_time_ms": result.execution_time_ms,
                "execution_steps": result.execution_steps,
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Graph agent execution failed: {result.error_message}",
            )

    except ValueError as e:
        # Handle validation errors (e.g., missing nodes, invalid graph structure)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Handle unexpected execution errors
        raise HTTPException(status_code=500, detail=f"Execution failed: {str(e)}")
