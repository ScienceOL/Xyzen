from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCodeError, handle_auth_error
from app.core.session import SessionService
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.sessions import SessionCreate, SessionRead, SessionReadWithTopics, SessionUpdate

# Ensure forward references are resolved after importing both models
try:
    SessionReadWithTopics.model_rebuild()
except Exception as e:
    # If rebuild fails, log the error for debugging
    import logging

    logging.getLogger(__name__).warning(f"Failed to rebuild SessionReadWithTopics: {e}")

router = APIRouter(tags=["sessions"])


# Pydantic models for search engine endpoints
class SetSearchEngineRequest(BaseModel):
    """Request model for setting session's search engine"""

    mcp_server_id: str


class SearchEngineResponse(BaseModel):
    """Response model for search engine information"""

    id: str
    name: str
    description: str | None
    status: str
    url: str
    tools: List[Dict[str, Any]] | None


@router.post("/", response_model=SessionRead)
async def create_session_with_default_topic(
    session_data: SessionCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SessionRead:
    """
    Create a new session with a default topic.

    Creates a new session for the authenticated user and automatically adds
    a default topic named "新的聊天" to get the user started. If an agent_id
    is provided, the session will be associated with that agent. Builtin agents
    are handled specially and stored with agent_id=None.

    Args:
        session_data: Session creation data including name, description, and optional agent_id
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        SessionRead: The newly created session with generated ID and timestamps

    Raises:
        HTTPException: 400 if agent validation fails, 500 if session or topic creation fails
    """
    try:
        return await SessionService(db).create_session_with_default_topic(session_data, user)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.get("/by-agent/{agent_id}", response_model=SessionRead)
async def get_session_by_agent(
    agent_id: str, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> SessionRead:
    """
    Retrieve a session for the current user with a specific agent.

    Finds a session associated with the given agent ID for the authenticated user.
    The agent_id can be "default" for sessions without an agent, a UUID string
    for sessions with a specific agent, or a builtin agent string ID.

    Args:
        agent_id: Agent identifier ("default", UUID string, or builtin agent ID)
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        SessionRead: The session associated with the user and agent

    Raises:
        HTTPException: 404 if no session found for this user-agent combination
    """
    try:
        return await SessionService(db).get_session_by_agent(user, agent_id)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.get("/", response_model=List[SessionReadWithTopics])
async def get_sessions(
    user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> List[SessionReadWithTopics]:
    """
    Retrieve all sessions for the current user with their topics, ordered by recent activity.

    Returns all sessions owned by the authenticated user, sorted by the most
    recent topic activity (based on topic updated_at timestamps). Sessions
    without topics are sorted to the end. Each session includes all its topics.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        List[SessionReadWithTopics]: List of user's sessions with topics, ordered by recent activity

    Raises:
        HTTPException: None - this endpoint always succeeds, returning empty list if no sessions
    """
    try:
        return await SessionService(db).get_sessions_with_topics(user)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.delete("/{session_id}/topics", status_code=204)
async def clear_session_topics(
    session_id: UUID, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> None:
    """
    Clear all topics in a session and create a new empty topic.

    Removes all existing topics and their associated messages from the session,
    then creates a fresh default topic. Only allows clearing if the current user
    owns the session. This is useful for starting fresh conversations.

    Args:
        session_id: UUID of the session to clear
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        None: Always returns 204 No Content status

    Raises:
        HTTPException: 404 if session not found, 403 if access denied
    """
    try:
        await SessionService(db).clear_session_topics(session_id, user)
        return
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.patch("/{session_id}", response_model=SessionRead)
async def update_session(
    session_id: UUID,
    session_data: SessionUpdate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SessionRead:
    """
    Update a session's configuration (including provider/model overrides).

    Args:
        session_id: UUID of the session to update
        session_data: Data to update
        user: Authenticated user ID
        db: Database session

    Returns:
        SessionRead: The updated session
    """
    try:
        return await SessionService(db).update_session(session_id, session_data, user)
    except ErrCodeError as e:
        raise handle_auth_error(e)
