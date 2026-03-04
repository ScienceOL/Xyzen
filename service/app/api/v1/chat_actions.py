"""REST endpoints for chat actions (send, abort, regenerate, question-response).

These endpoints replace the client→server half of the WebSocket protocol.
Events flow back to clients via the SSE endpoint (``events.py``).
"""

import asyncio
import json
import logging
import time
from typing import Any
from uuid import UUID, uuid4

import redis.asyncio as redis
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCode, ErrCodeError
from app.configs import configs
from app.core.chat.constants import DEFAULT_TOPIC_TITLES
from app.core.chat.topic_generator import generate_and_update_topic_title
from app.ee.lifecycle import get_chat_lifecycle
from app.infra.database import get_session
from app.middleware.auth import AuthContext, get_auth_context
from app.repos import FileRepository, MessageRepository, SessionRepository, TopicRepository
from app.schemas.chat_event_types import ChatEventType
from app.tasks.chat import process_chat_message, resume_chat_from_interrupt

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat Actions"])


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _authorize_topic(
    topic_id: UUID,
    auth_ctx: AuthContext,
    db: AsyncSession,
) -> tuple[Any, Any, str]:
    """Validate topic access and resolve developer attribution.

    Returns (topic, session, connection_id).
    """
    topic_repo = TopicRepository(db)
    session_repo = SessionRepository(db)

    topic = await topic_repo.get_topic_with_details(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    session = await session_repo.get_session_by_id(topic.session_id)
    if not session or session.user_id != auth_ctx.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    connection_id = f"{session.id}:{topic_id}"
    return topic, session, connection_id


async def _resolve_developer_attribution(
    session: Any, db: AsyncSession
) -> tuple[str | None, str | None, str | None, str | None]:
    """Resolve developer reward attribution from session agent."""
    agent_id_for_attribution: str | None = None
    marketplace_id: str | None = None
    developer_user_id: str | None = None
    developer_fork_mode: str | None = None

    if session and session.agent_id:
        from app.repos.agent import AgentRepository
        from app.repos.agent_marketplace import AgentMarketplaceRepository

        agent_repo = AgentRepository(db)
        agent = await agent_repo.get_agent_by_id(session.agent_id)
        if agent and agent.original_source_id:
            agent_id_for_attribution = str(agent.id)
            marketplace_id = str(agent.original_source_id)
            developer_fork_mode = "editable" if agent.config_editable else "locked"

            mp_repo = AgentMarketplaceRepository(db)
            listing = await mp_repo.get_by_id(agent.original_source_id)
            if listing and listing.user_id:
                developer_user_id = listing.user_id

    return agent_id_for_attribution, marketplace_id, developer_user_id, developer_fork_mode


async def _xadd(
    r: redis.Redis,
    topic_id: UUID,
    event_type: str,
    payload: dict[str, Any],
) -> str:
    """Write a single event to the topic's Redis Stream."""
    encoded = json.dumps(payload, default=str, ensure_ascii=False)
    entry_id: str = await r.xadd(
        f"events:{topic_id}",
        {"type": event_type, "payload": encoded},
        maxlen=10000,
        approximate=True,
    )
    return entry_id


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SendMessageRequest(BaseModel):
    message: str
    file_ids: list[UUID] | None = None
    context: dict[str, Any] | None = None
    client_id: str | None = None


class SendMessageResponse(BaseModel):
    message_id: str
    stream_id: str
    created_at: str


class RegenerateResponse(BaseModel):
    stream_id: str


class QuestionResponseRequest(BaseModel):
    question_id: str
    selected_options: list[Any] | None = None
    text: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/{topic_id}/messages", response_model=SendMessageResponse)
async def send_message(
    topic_id: UUID,
    body: SendMessageRequest,
    auth_ctx: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_session),
) -> SendMessageResponse:
    """Send a chat message. Returns message ID and stream ID."""
    from app.models.message import MessageCreate

    _topic, session, connection_id = await _authorize_topic(topic_id, auth_ctx, db)
    user = auth_ctx.user_id

    # Lifecycle (billing, limits)
    lifecycle = await get_chat_lifecycle(user, db)
    await lifecycle.on_connect(connection_id)

    r: redis.Redis | None = None
    try:
        limit_err = await lifecycle.check_before_message(connection_id)
        if limit_err:
            raise HTTPException(status_code=429, detail=limit_err)

        message_repo = MessageRepository(db)
        topic_repo = TopicRepository(db)

        # 1. Save user message
        user_message_create = MessageCreate(role="user", content=body.message, topic_id=topic_id)
        user_message = await message_repo.create_message(user_message_create)

        # 2. Balance check
        try:
            await lifecycle.check_balance(
                db=db,
                user_id=user,
                auth_provider=auth_ctx.auth_provider,
                session_id=session.id,
                topic_id=topic_id,
                message_id=user_message.id,
            )
        except ErrCodeError as e:
            if e.code == ErrCode.INSUFFICIENT_BALANCE:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "error_code": "INSUFFICIENT_BALANCE",
                        "message": "Insufficient photon balance",
                        "details": e.as_dict(),
                    },
                )
            raise

        # 3. Link files
        if body.file_ids:
            file_repo = FileRepository(db)
            await file_repo.update_files_message_id(
                file_ids=body.file_ids,
                message_id=user_message.id,
                user_id=user,
            )
            await db.flush()

        # Open a Redis client for stream writes
        r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)

        # 4. Echo user message to stream
        user_message_with_files = await message_repo.get_message_with_files(user_message.id)
        echo_model = user_message_with_files if user_message_with_files else user_message
        echo_data = json.loads(echo_model.model_dump_json())
        if body.client_id:
            echo_data["client_id"] = body.client_id
        await _xadd(r, topic_id, "message", echo_data)

        # 5. Generate stream_id
        stream_id = f"stream_{int(time.time() * 1000)}_{uuid4().hex[:8]}"

        # 6. Loading event
        loading_event: dict[str, Any] = {
            "type": ChatEventType.LOADING,
            "data": {"message": "AI is thinking...", "stream_id": stream_id},
        }
        await _xadd(r, topic_id, ChatEventType.LOADING, loading_event)

        # Commit before dispatching Celery task
        await db.commit()

        # 7. Dispatch Celery task
        agent_attr, mp_id, dev_uid, dev_fork = await _resolve_developer_attribution(session, db)

        process_chat_message.delay(
            session_id_str=str(session.id),
            topic_id_str=str(topic_id),
            user_id_str=str(user),
            auth_provider=auth_ctx.auth_provider,
            message_text=body.message,
            context=body.context,
            access_token=auth_ctx.access_token if auth_ctx.auth_provider.lower() == "bohr_app" else None,
            stream_id=stream_id,
            agent_id_for_attribution=agent_attr,
            marketplace_id=mp_id,
            developer_user_id=dev_uid,
            developer_fork_mode=dev_fork,
        )

        # 8. Acknowledge message receipt
        ack_data: dict[str, str | None] = {"message_id": str(user_message.id)}
        if body.client_id:
            ack_data["client_id"] = body.client_id
        ack_event: dict[str, Any] = {"type": ChatEventType.MESSAGE_ACK, "data": ack_data}
        await _xadd(r, topic_id, ChatEventType.MESSAGE_ACK, ack_event)

        # 9. Topic renaming
        topic_refreshed = await topic_repo.get_topic_with_details(topic_id)
        if topic_refreshed and topic_refreshed.name in DEFAULT_TOPIC_TITLES:
            msgs = await message_repo.get_messages_by_topic(topic_id, limit=5)
            if len(msgs) <= 3:
                asyncio.create_task(
                    generate_and_update_topic_title(
                        body.message,
                        topic_id,
                        session.id,
                        user,
                    )
                )
    finally:
        if r:
            await r.aclose()
        await lifecycle.on_disconnect(connection_id)

    return SendMessageResponse(
        message_id=str(user_message.id),
        stream_id=stream_id,
        created_at=str(user_message.created_at),
    )


@router.post("/{topic_id}/abort", status_code=204)
async def abort_generation(
    topic_id: UUID,
    auth_ctx: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Set abort signal for the active generation on this topic."""
    _topic, _session, connection_id = await _authorize_topic(topic_id, auth_ctx, db)

    r: redis.Redis | None = None
    try:
        r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
        abort_key = f"abort:{connection_id}"
        await r.setex(abort_key, 60, "1")
    except Exception as e:
        logger.error(f"Failed to set abort signal for {connection_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to abort") from e
    finally:
        if r:
            await r.aclose()


@router.post("/{topic_id}/regenerate", response_model=RegenerateResponse)
async def regenerate(
    topic_id: UUID,
    auth_ctx: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_session),
) -> RegenerateResponse:
    """Regenerate the last AI response."""
    _topic, session, connection_id = await _authorize_topic(topic_id, auth_ctx, db)
    user = auth_ctx.user_id

    message_repo = MessageRepository(db)

    # Get last user message
    messages = await message_repo.get_messages_by_topic(topic_id, order_by_created=True)
    user_messages = [m for m in messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user messages found for regeneration")
    last_user_message = user_messages[-1]
    message_text = last_user_message.content

    # Lifecycle checks
    lifecycle = await get_chat_lifecycle(user, db)
    await lifecycle.on_connect(connection_id)

    try:
        limit_err = await lifecycle.check_before_message(connection_id)
        if limit_err:
            raise HTTPException(status_code=429, detail=limit_err)

        # Balance check
        try:
            await lifecycle.check_balance(
                db=db,
                user_id=user,
                auth_provider=auth_ctx.auth_provider,
                session_id=session.id,
                topic_id=topic_id,
                message_id=last_user_message.id,
            )
        except ErrCodeError as e:
            if e.code == ErrCode.INSUFFICIENT_BALANCE:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "error_code": "INSUFFICIENT_BALANCE",
                        "message": "Insufficient photon balance",
                        "details": e.as_dict(),
                    },
                )
            raise

        stream_id = f"stream_{int(time.time() * 1000)}_{uuid4().hex[:8]}"

        # Write loading event to stream
        r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
        try:
            loading_event: dict[str, Any] = {
                "type": ChatEventType.LOADING,
                "data": {"message": "AI is thinking...", "stream_id": stream_id},
            }
            await _xadd(r, topic_id, ChatEventType.LOADING, loading_event)
        finally:
            await r.aclose()

        await db.commit()

        # Dispatch Celery task
        agent_attr, mp_id, dev_uid, dev_fork = await _resolve_developer_attribution(session, db)

        process_chat_message.delay(
            session_id_str=str(session.id),
            topic_id_str=str(topic_id),
            user_id_str=str(user),
            auth_provider=auth_ctx.auth_provider,
            message_text=message_text,
            context=None,
            access_token=auth_ctx.access_token if auth_ctx.auth_provider.lower() == "bohr_app" else None,
            stream_id=stream_id,
            agent_id_for_attribution=agent_attr,
            marketplace_id=mp_id,
            developer_user_id=dev_uid,
            developer_fork_mode=dev_fork,
        )
    finally:
        await lifecycle.on_disconnect(connection_id)

    return RegenerateResponse(stream_id=stream_id)


@router.post("/{topic_id}/question-response", status_code=204)
async def question_response(
    topic_id: UUID,
    body: QuestionResponseRequest,
    auth_ctx: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Answer an ask_user_question interrupt."""
    _topic, session, connection_id = await _authorize_topic(topic_id, auth_ctx, db)

    message_repo = MessageRepository(db)
    question_id = body.question_id

    # Look up thread_id from Redis, DB fallback
    r: redis.Redis | None = None
    thread_id: str | None = None
    try:
        r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
        thread_id = await r.get(f"question_thread:{connection_id}")

        # Validate question_id matches
        active_qid = await r.get(f"question_active:{connection_id}")
        if active_qid and active_qid != question_id:
            raise HTTPException(status_code=409, detail="Question ID mismatch")

        # Clean up Redis keys
        await r.delete(f"question_active:{connection_id}")
        await r.delete(f"question_thread:{connection_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to look up question state from Redis: {e}")
    finally:
        if r:
            await r.aclose()

    # DB fallback
    if not thread_id:
        messages = await message_repo.get_messages_by_topic(topic_id, order_by_created=True)
        for msg in reversed(messages):
            if msg.role == "assistant" and msg.user_question_data:
                qd = msg.user_question_data
                if qd.get("question_id") == question_id and qd.get("thread_id"):
                    thread_id = qd["thread_id"]
                    break

    if not thread_id:
        raise HTTPException(status_code=404, detail="No thread found for this question")

    user_response = {
        "question_id": question_id,
        "selected_options": body.selected_options,
        "text": body.text or "",
        "timed_out": False,
    }

    resume_stream_id = f"stream_{int(time.time() * 1000)}_{uuid4().hex[:8]}"

    # Write loading event to stream
    r2 = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    try:
        loading_event: dict[str, Any] = {
            "type": ChatEventType.LOADING,
            "data": {"message": "AI is thinking...", "stream_id": resume_stream_id},
        }
        await _xadd(r2, topic_id, ChatEventType.LOADING, loading_event)
    finally:
        await r2.aclose()

    # Dispatch resume task
    resume_chat_from_interrupt.delay(
        session_id_str=str(session.id),
        topic_id_str=str(topic_id),
        user_id_str=str(auth_ctx.user_id),
        auth_provider=auth_ctx.auth_provider,
        question_id=question_id,
        user_response=user_response,
        thread_id=thread_id,
        stream_id=resume_stream_id,
    )
