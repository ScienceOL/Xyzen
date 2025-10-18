from typing import List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from handler.api.v1.sessions import get_current_user
from middleware.database import get_session
from models.message import Message, MessageRead
from models.sessions import Session
from models.topic import Topic, TopicCreate, TopicRead

router = APIRouter()


class TopicUpdate(BaseModel):
    name: str


@router.post("/", response_model=TopicRead)
async def create_topic(topic_data: TopicCreate, db: AsyncSession = Depends(get_session)) -> Topic:
    """
    Create a new topic in an existing session.
    """
    # Verify that the session exists
    session = await db.get(Session, topic_data.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Create the topic
    topic = Topic.model_validate(topic_data)
    topic.id = uuid4()

    db.add(topic)
    await db.commit()
    await db.refresh(topic)

    return topic


@router.put("/{topic_id}", response_model=TopicRead)
async def update_topic(topic_id: UUID, topic_data: TopicUpdate, db: AsyncSession = Depends(get_session)) -> Topic:
    """
    Update a topic's name.
    """
    topic = await db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Update the topic name
    topic.name = topic_data.name

    db.add(topic)
    await db.commit()
    await db.refresh(topic)

    return topic


@router.get("/{topic_id}/messages", response_model=List[MessageRead])
async def get_topic_messages(
    topic_id: UUID, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> list[Message]:
    """
    Get all messages for a specific topic, ordered by creation time.
    Only returns messages if the current user owns the session that contains this topic.
    """
    # Get the topic first
    topic = await db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Get the session that contains this topic
    session = await db.get(Session, topic.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify that the current user owns this session
    if session.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied: You don't have permission to access this topic")

    # Get messages for the topic
    statement = select(Message).where(Message.topic_id == topic_id).order_by(Message.created_at)  # type: ignore
    result = await db.exec(statement)
    messages = result.all()
    return list(messages)


@router.delete("/{topic_id}", status_code=204)
async def delete_topic(
    topic_id: UUID, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> None:
    """
    Delete a topic and its associated messages.
    Only allows deletion if the current user owns the session that contains this topic.
    """
    # Get the topic first
    topic = await db.get(Topic, topic_id)
    if not topic:
        # If the topic is already deleted, we can return a 204 status code.
        return

    # Get the session that contains this topic
    session = await db.get(Session, topic.session_id)
    if not session:
        # This should not happen if the topic exists, but as a safeguard
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify that the current user owns this session
    if session.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied: You don't have permission to delete this topic")

    # SQLModel does not support cascade deletes on the relationship yet,
    # so we need to delete the messages manually.
    # See: https://github.com/tiangolo/sqlmodel/issues/132
    statement = select(Message).where(Message.topic_id == topic_id)
    result = await db.exec(statement)
    messages_to_delete = result.all()
    for message in messages_to_delete:
        await db.delete(message)

    # Delete the topic itself
    await db.delete(topic)
    await db.commit()

    return
