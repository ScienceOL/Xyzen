from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.v1.sessions import get_current_user
from app.infra.database import get_session
from app.models.message import MessageReadWithFilesAndCitations
from app.models.topic import Topic as TopicModel
from app.models.topic import TopicCreate, TopicRead, TopicUpdate
from app.repos import MessageRepository, SessionRepository, TopicRepository

router = APIRouter(tags=["topics"])


async def _verify_topic_authorization(
    topic_id: UUID, user: str, db: AsyncSession, allow_missing: bool = False
) -> TopicModel | None:
    """
    Core authorization logic for topic access validation.

    Args:
        topic_id: UUID of the topic to verify
        user: Authenticated user ID
        db: Database session
        allow_missing: If True, returns None for missing topics instead of raising 404

    Returns:
        Topic | None: The authorized topic instance, or None if not found and allow_missing=True

    Raises:
        HTTPException: 404 if topic/session not found (unless allow_missing=True for topic),
                      403 if access denied
    """
    topic_repo = TopicRepository(db)
    session_repo = SessionRepository(db)

    topic = await topic_repo.get_topic_by_id(topic_id)
    if not topic:
        if allow_missing:
            return None
        raise HTTPException(status_code=404, detail="Topic not found")

    session = await session_repo.get_session_by_id(topic.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied: You don't have permission to access this topic")

    return topic


async def get_authorized_topic(
    topic_id: UUID, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> TopicModel:
    """
    FastAPI dependency that validates topic access authorization.

    This dependency ensures the topic exists and belongs to a session
    owned by the authenticated user. Used for operations that require
    the topic to exist (GET, PUT).

    Args:
        topic_id: UUID from the path parameter
        user: Authenticated user ID from get_current_user dependency
        db: Database session from get_session dependency

    Returns:
        Topic: The authorized topic instance

    Raises:
        HTTPException: 404 if topic/session not found, 403 if access denied
    """
    topic = await _verify_topic_authorization(topic_id, user, db, allow_missing=False)
    # Type checker can't infer that topic is not None here
    return topic  # type: ignore


async def get_authorized_topic_for_delete(
    topic_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> TopicModel | None:
    """
    FastAPI dependency for delete operations with idempotent behavior.

    Unlike the standard authorization dependency, this one returns None
    when a topic doesn't exist rather than raising a 404 exception.
    This enables idempotent DELETE operations where calling DELETE
    on a non-existent resource still returns 204 No Content.

    Args:
        topic_id: UUID from the path parameter
        user: Authenticated user ID from get_current_user dependency
        db: Database session from get_session dependency

    Returns:
        Topic | None: The authorized topic instance, or None if topic doesn't exist

    Raises:
        HTTPException: 404 if session not found, 403 if access denied
        (but NOT if topic doesn't exist - returns None instead)
    """
    return await _verify_topic_authorization(topic_id, user, db, allow_missing=True)


@router.post("/", response_model=TopicRead)
async def create_topic(
    topic_data: TopicCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> TopicRead:
    """
    Create a new topic within an existing session.

    Validates that the target session exists and belongs to the authenticated user
    before creating the topic. The topic will be created with the provided name,
    description, and initial active status.

    Args:
        topic_data: Topic creation data including session_id, name, and description
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        TopicRead: The newly created topic with generated ID and timestamps

    Raises:
        HTTPException: 404 if session not found, 403 if user doesn't own session
    """
    session_repo = SessionRepository(db)
    topic_repo = TopicRepository(db)
    session = await session_repo.get_session_by_id(topic_data.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user:
        raise HTTPException(
            status_code=403, detail="Access denied: You don't have permission to add topics to this session"
        )

    topic = await topic_repo.create_topic(topic_data)
    await db.commit()
    return TopicRead(**topic.model_dump())


@router.put("/{topic_id}", response_model=TopicRead)
async def update_topic(
    topic_data: TopicUpdate,
    topic: TopicModel = Depends(get_authorized_topic),
    db: AsyncSession = Depends(get_session),
) -> TopicRead:
    """
    Update an existing topic's properties.

    Allows modification of topic name, description, and active status.
    Authorization is handled by the dependency which ensures the user
    owns the session containing this topic.

    Args:
        topic_data: Partial update data (only provided fields will be updated)
        topic: Authorized topic instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        TopicRead: The updated topic with new timestamps

    Raises:
        HTTPException: 404 if topic/session not found, 403 if access denied,
                      500 if update operation fails unexpectedly
    """
    topic_repo = TopicRepository(db)
    updated_topic = await topic_repo.update_topic(topic.id, topic_data)
    if not updated_topic:
        raise HTTPException(status_code=500, detail="Failed to update topic")

    await db.commit()
    return TopicRead(**updated_topic.model_dump())


@router.get("/{topic_id}/messages", response_model=List[MessageReadWithFilesAndCitations])
async def get_topic_messages(
    topic: TopicModel = Depends(get_authorized_topic),
    db: AsyncSession = Depends(get_session),
) -> List[MessageReadWithFilesAndCitations]:
    """
        Retrieve all messages within a topic with their file attachments and citations, chronologically ordered.

        Returns messages in order of creation time (oldest first) for the specified topic.
        Each message includes its associated file attachments and search citations for multimodal support.
    </text>
        Authorization is handled by the dependency which ensures the user owns the
        session containing this topic.

        Args:
            topic: Authorized topic instance (injected by dependency)
            db: Database session (injected by dependency)

        Returns:
            List[MessageReadWithFilesAndCitations]: Chronologically ordered list of messages with attachments and citations

        Raises:
            HTTPException: 404 if topic/session not found, 403 if access denied
    """
    message_repo = MessageRepository(db)
    messages_with_files_and_citations = await message_repo.get_messages_with_files_and_citations(
        topic.id, order_by_created=True
    )
    return messages_with_files_and_citations


@router.delete("/{topic_id}", status_code=204)
async def delete_topic(
    topic: TopicModel | None = Depends(get_authorized_topic_for_delete),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete a topic and all its associated messages (cascade delete).

    This operation is idempotent - it will return 204 No Content even if the topic
    doesn't exist. Messages are deleted first to maintain referential integrity,
    followed by the topic itself. Authorization ensures only the session owner
    can delete topics.

    Args:
        topic: Authorized topic instance or None if not found (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        None: Always returns 204 No Content status

    Raises:
        HTTPException: 404 if session not found, 403 if access denied
        (but NOT if topic doesn't exist - returns 204 instead)
    """
    if topic is None:
        return

    message_repo = MessageRepository(db)
    topic_repo = TopicRepository(db)

    await message_repo.delete_messages_by_topic(topic.id)
    await topic_repo.delete_topic(topic.id)
    await db.commit()
    return
