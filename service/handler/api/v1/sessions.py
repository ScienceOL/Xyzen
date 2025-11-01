from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from middleware.auth import get_current_user
from middleware.database import get_session
from models.sessions import SessionCreate, SessionRead, SessionReadWithTopics
from models.topic import TopicCreate, TopicRead
from repo import MessageRepository, SessionRepository, TopicRepository

# Ensure forward references are resolved after importing both models
try:
    SessionReadWithTopics.model_rebuild()
except Exception as e:
    # If rebuild fails, log the error for debugging
    import logging

    logging.getLogger(__name__).warning(f"Failed to rebuild SessionReadWithTopics: {e}")

router = APIRouter(tags=["sessions"])


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
    is provided, the session will be associated with that agent.

    Args:
        session_data: Session creation data including name, description, and optional agent_id
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        SessionRead: The newly created session with generated ID and timestamps

    Raises:
        HTTPException: 500 if session or topic creation fails
    """
    session_repo = SessionRepository(db)
    topic_repo = TopicRepository(db)

    session = await session_repo.create_session(session_data, user)
    default_topic_data = TopicCreate(
        name="新的聊天",
        session_id=session.id,
    )
    await topic_repo.create_topic(default_topic_data)

    await db.commit()
    return SessionRead(**session.model_dump())


@router.get("/by-agent/{agent_id}", response_model=SessionRead)
async def get_session_by_agent(
    agent_id: str, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> SessionRead:
    """
    Retrieve a session for the current user with a specific agent.

    Finds a session associated with the given agent ID for the authenticated user.
    The agent_id can be "default" for sessions without an agent, or a UUID string
    for sessions with a specific agent.

    Args:
        agent_id: Agent identifier ("default" or UUID string)
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        SessionRead: The session associated with the user and agent

    Raises:
        HTTPException: 404 if no session found for this user-agent combination
    """
    session_repo = SessionRepository(db)

    # TODO: Legacy support for "default" agent
    try:
        agent_uuid = UUID(agent_id) if agent_id != "default" else None
    except ValueError:
        agent_uuid = None

    session = await session_repo.get_session_by_user_and_agent(user, agent_uuid)
    if not session:
        raise HTTPException(status_code=404, detail="No session found for this user-agent combination")

    return SessionRead(**session.model_dump())


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
    session_repo = SessionRepository(db)
    topic_repo = TopicRepository(db)
    sessions = await session_repo.get_sessions_by_user_ordered_by_activity(user)

    # Load topics for each session
    sessions_with_topics = []
    for session in sessions:
        topics = await topic_repo.get_topics_by_session(session.id, order_by_updated=True)
        topic_reads = [TopicRead(**topic.model_dump()) for topic in topics]

        session_dict = session.model_dump()
        session_dict["topics"] = topic_reads
        sessions_with_topics.append(SessionReadWithTopics(**session_dict))

    return sessions_with_topics


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
    session_repo = SessionRepository(db)
    topic_repo = TopicRepository(db)
    message_repo = MessageRepository(db)

    session = await session_repo.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied: You don't have permission to clear this session")

    topics = await topic_repo.get_topics_by_session(session_id)
    for topic in topics:
        await message_repo.delete_messages_by_topic(topic.id)
        await topic_repo.delete_topic(topic.id)

    default_topic_data = TopicCreate(
        name="新的聊天",
        session_id=session_id,
    )
    await topic_repo.create_topic(default_topic_data)

    await db.commit()
    return
