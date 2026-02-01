from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.v1.sessions import get_current_user
from app.infra.database import get_session
from app.models.message import Message as MessageModel
from app.models.message import MessageRead, MessageUpdate
from app.repos import MessageRepository, SessionRepository, TopicRepository

router = APIRouter(tags=["messages"])


class MessageEditRequest(BaseModel):
    """Request model for editing a message."""

    content: str = Field(..., min_length=1, max_length=100000)
    truncate_and_regenerate: bool = Field(
        default=True,
        description="If True, truncate subsequent messages and trigger regeneration. "
        "If False, only update content (no truncation, no regeneration).",
    )


class MessageEditResponse(BaseModel):
    """Response model for message edit operation."""

    message: MessageRead
    deleted_count: int = Field(..., description="Number of subsequent messages deleted")
    regenerate: bool = Field(..., description="Whether frontend should trigger regeneration")


async def _verify_message_authorization(message_id: UUID, user: str, db: AsyncSession) -> tuple[MessageModel, UUID]:
    """
    Core authorization logic for message access validation.

    Args:
        message_id: UUID of the message to verify
        user: Authenticated user ID
        db: Database session

    Returns:
        tuple[MessageModel, UUID]: The authorized message and its topic_id

    Raises:
        HTTPException: 404 if message/topic/session not found, 403 if access denied
    """
    message_repo = MessageRepository(db)
    topic_repo = TopicRepository(db)
    session_repo = SessionRepository(db)

    message = await message_repo.get_message_by_id(message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    topic = await topic_repo.get_topic_by_id(message.topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    session = await session_repo.get_session_by_id(topic.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied: You don't have permission to access this message")

    return message, topic.id


@router.patch("/{message_id}", response_model=MessageEditResponse)
async def edit_message(
    message_id: UUID,
    edit_request: MessageEditRequest,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> MessageEditResponse:
    """
    Edit a message content, optionally truncating subsequent messages.

    This operation:
    1. Verifies the message exists and belongs to the authenticated user
    2. Updates the message content
    3. If truncate_and_regenerate=True (only for user messages):
       - Deletes all messages created after this message in the same topic
       - Returns regenerate=True for frontend to trigger agent re-run
    4. If truncate_and_regenerate=False (for both user and assistant messages):
       - Only updates the message content
       - Returns regenerate=False

    Args:
        message_id: UUID of the message to edit
        edit_request: New content and truncation option
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        MessageEditResponse: Updated message, count of deleted messages, regenerate flag

    Raises:
        HTTPException: 404 if message/topic/session not found, 403 if access denied,
                       400 if trying to regenerate from non-user message
    """
    message, topic_id = await _verify_message_authorization(message_id, user, db)

    # Regeneration is only allowed for user messages
    if edit_request.truncate_and_regenerate and message.role != "user":
        raise HTTPException(
            status_code=400,
            detail="Regeneration can only be triggered from user messages",
        )

    message_repo = MessageRepository(db)

    # Update the message content
    update_data = MessageUpdate(content=edit_request.content)
    updated_message = await message_repo.update_message(message_id, update_data)
    if not updated_message:
        raise HTTPException(status_code=500, detail="Failed to update message")

    deleted_count = 0
    regenerate = False

    # Only truncate and regenerate if requested (and message is from user)
    if edit_request.truncate_and_regenerate:
        deleted_count = await message_repo.delete_messages_after(
            topic_id, updated_message.created_at, cascade_files=True
        )
        regenerate = True

    await db.commit()

    return MessageEditResponse(
        message=MessageRead(
            id=updated_message.id,
            role=updated_message.role,
            content=updated_message.content,
            topic_id=updated_message.topic_id,
            created_at=updated_message.created_at,
            thinking_content=updated_message.thinking_content,
            agent_metadata=updated_message.agent_metadata,
        ),
        deleted_count=deleted_count,
        regenerate=regenerate,
    )


@router.delete("/{message_id}", status_code=204)
async def delete_message(
    message_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete a single message.

    This operation:
    1. Verifies the message exists and belongs to the authenticated user
    2. Deletes the message with cascade (files, citations, agent_runs)

    Both user and assistant messages can be deleted.

    Args:
        message_id: UUID of the message to delete
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        None: 204 No Content on success

    Raises:
        HTTPException: 404 if message/topic/session not found, 403 if access denied
    """
    message, _ = await _verify_message_authorization(message_id, user, db)

    message_repo = MessageRepository(db)

    # Delete the message with cascade
    deleted = await message_repo.delete_message(message.id, cascade_files=True)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete message")

    await db.commit()
