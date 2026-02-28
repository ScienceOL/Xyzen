import asyncio
import json
import logging
import time
from uuid import UUID, uuid4

import redis.asyncio as redis
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.common.code.error_code import ErrCode, ErrCodeError
from app.configs import configs
from app.core.chat.constants import DEFAULT_TOPIC_TITLES
from app.core.chat.topic_generator import generate_and_update_topic_title
from app.ee.lifecycle import get_chat_lifecycle
from app.infra.database import AsyncSessionLocal
from app.middleware.auth import ws_authenticate_context
from app.models.message import MessageCreate
from app.repos import FileRepository, MessageRepository, SessionRepository, TopicRepository
from app.schemas.chat_event_types import ChatClientEventType, ChatEventType

# from app.core.celery_app import celery_app # Not needed directly if we import the task
from app.tasks.chat import process_chat_message, resume_chat_from_interrupt

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, connection_id: str):
        await websocket.accept()
        self.active_connections[connection_id] = websocket

    def disconnect(self, connection_id: str):
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]

    async def send_personal_message(self, message: str, connection_id: str):
        if connection_id in self.active_connections:
            await self.active_connections[connection_id].send_text(message)


manager = ConnectionManager()


async def set_abort_signal(connection_id: str, ttl_seconds: int = 60) -> None:
    """Set abort signal for a specific chat connection."""
    r = None
    try:
        r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
        abort_key = f"abort:{connection_id}"
        await r.setex(abort_key, ttl_seconds, "1")
    except Exception as e:
        logger.error(f"Failed to set abort signal for {connection_id}: {e}")
    finally:
        if r:
            await r.aclose()


async def redis_listener(websocket: WebSocket, connection_id: str):
    """
    Listens to Redis channel and forwards messages to WebSocket.
    """
    r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    channel = f"chat:{connection_id}"
    await pubsub.subscribe(channel)

    logger.info(f"Subscribed to Redis channel: {channel}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                try:
                    # Check if connection is still active before sending
                    if websocket.client_state.value == 1:  # WebSocketState.CONNECTED
                        await websocket.send_text(data)
                    else:
                        logger.warning(f"WebSocket closed, stopping listener for {connection_id}")
                        break
                except Exception as e:
                    logger.error(f"Error sending message to WebSocket: {e}")
                    break
    except asyncio.CancelledError:
        logger.info(f"Redis listener cancelled for {connection_id}")
    except Exception as e:
        logger.error(f"Redis listener error: {e}")
    finally:
        await pubsub.unsubscribe(channel)
        await r.aclose()


HEARTBEAT_INTERVAL_SECONDS = 25
WS_PRESENCE_TTL_SECONDS = 120  # Safety-net TTL for presence key (refreshed every heartbeat)


def _ws_presence_key(connection_id: str) -> str:
    """Redis key indicating an active WebSocket for a given connection."""
    return f"ws:active:{connection_id}"


async def heartbeat_sender(websocket: WebSocket, connection_id: str, presence_redis: redis.Redis) -> None:
    """Send periodic ping messages and refresh the WS presence key."""
    presence_key = _ws_presence_key(connection_id)
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)
            try:
                if websocket.client_state.value == 1:  # WebSocketState.CONNECTED
                    await websocket.send_text('{"type":"ping"}')
                    # Refresh presence TTL so it survives across heartbeat cycles
                    await presence_redis.expire(presence_key, WS_PRESENCE_TTL_SECONDS)
                else:
                    break
            except Exception:
                logger.info(f"Heartbeat send failed for {connection_id}, connection likely dead")
                break
    except asyncio.CancelledError:
        pass


@router.websocket("/sessions/{session_id}/topics/{topic_id}")
async def chat_websocket(
    websocket: WebSocket,
    session_id: UUID,
    topic_id: UUID,
    token: str | None = Query(None, alias="token"),
) -> None:
    auth_ctx = await ws_authenticate_context(websocket, token)
    if auth_ctx is None:
        return

    connection_id = f"{session_id}:{topic_id}"
    user = auth_ctx.user_id

    # Create lifecycle handler (CE = no-op, EE = billing + limits)
    async with AsyncSessionLocal() as db:
        lifecycle = await get_chat_lifecycle(user, db)

    # Validate session and topic access before tracking the connection
    async with AsyncSessionLocal() as db:
        topic_repo = TopicRepository(db)
        session_repo = SessionRepository(db)
        topic = await topic_repo.get_topic_with_details(topic_id)
        if not topic or topic.session_id != session_id:
            logger.error(f"DEBUG: Topic check failed. Topic: {topic}, SessionID: {session_id}")
            if topic:
                logger.error(f"DEBUG: Topic session id: {topic.session_id} vs {session_id}")
            await websocket.accept()
            await websocket.close(code=4004, reason="Topic not found or does not belong to the session")
            return

        session = await session_repo.get_session_by_id(session_id)
        if not session or session.user_id != user:
            logger.error(f"DEBUG: Session check failed. Session: {session}, User: {user}")
            if session:
                logger.error(f"DEBUG: Session user id: {session.user_id} vs {user}")
            await websocket.accept()
            await websocket.close(code=4003, reason="Session not found or access denied")
            return

        # Resolve developer reward attribution once at connection time
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

                # Infer fork_mode from the fork's saved config fields
                if agent.config_editable:
                    developer_fork_mode = "editable"
                else:
                    developer_fork_mode = "locked"

                mp_repo = AgentMarketplaceRepository(db)
                listing = await mp_repo.get_by_id(agent.original_source_id)
                if listing and listing.user_id:
                    developer_user_id = listing.user_id

    await manager.connect(websocket, connection_id)

    # Track this connection for limit enforcement
    await lifecycle.on_connect(connection_id)

    # Track WebSocket presence in Redis so the Celery worker can decide
    # whether to send a push notification (only when user is offline).
    presence_redis = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    presence_key = _ws_presence_key(connection_id)
    await presence_redis.set(presence_key, "1", ex=WS_PRESENCE_TTL_SECONDS)

    # Start Redis listener task
    listener_task = asyncio.create_task(redis_listener(websocket, connection_id))
    heartbeat_task = asyncio.create_task(heartbeat_sender(websocket, connection_id, presence_redis))

    try:
        while True:
            data = await websocket.receive_json()

            # Short-circuit heartbeat pongs before opening a DB session
            if data.get("type") == "pong":
                continue

            async with AsyncSessionLocal() as db:
                message_repo = MessageRepository(db)
                topic_repo = TopicRepository(db)

                message_type = data.get("type", ChatClientEventType.MESSAGE)

                # Ignore tool confirmation for now as implicit execution is assumed/enforced
                if message_type in [ChatClientEventType.TOOL_CALL_CONFIRM, ChatClientEventType.TOOL_CALL_CANCEL]:
                    logger.warning(f"Received unused tool confirmation event: {message_type}")
                    continue

                # Handle abort request - set abort signal in Redis for the worker to check
                if message_type == ChatClientEventType.ABORT:
                    logger.info(f"Received abort request for {connection_id}")
                    await set_abort_signal(connection_id)
                    continue

                # Handle user question response (answer to ask_user_question)
                if message_type == ChatClientEventType.USER_QUESTION_RESPONSE:
                    response_data = data.get("data", {})
                    question_id = response_data.get("question_id", "")
                    if not question_id:
                        logger.warning(f"Missing question_id in user question response on {connection_id}")
                        continue
                    selected_options = response_data.get("selected_options")
                    text = response_data.get("text", "")
                    timed_out = response_data.get("timed_out", False)

                    # Look up thread_id from Redis
                    r = None
                    try:
                        r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
                        thread_id = await r.get(f"question_thread:{connection_id}")
                        if not thread_id:
                            logger.warning(f"No thread_id found for question response on {connection_id}")
                            continue

                        # Validate question_id matches the active question
                        active_qid = await r.get(f"question_active:{connection_id}")
                        if active_qid and active_qid != question_id:
                            logger.warning(
                                f"question_id mismatch on {connection_id}: active={active_qid}, received={question_id}"
                            )
                            continue

                        # Check timeout
                        timeout_key = f"question_timeout:{connection_id}:{question_id}"
                        still_valid = await r.get(timeout_key)
                        if not still_valid and not timed_out:
                            logger.warning(f"Question {question_id} has timed out on {connection_id}")
                            timed_out = True

                        # Clean up Redis keys
                        await r.delete(f"question_active:{connection_id}")
                        await r.delete(timeout_key)
                        await r.delete(f"question_thread:{connection_id}")
                    except Exception as e:
                        logger.error(f"Failed to look up question state from Redis: {e}")
                        continue
                    finally:
                        if r:
                            await r.aclose()

                    user_response = {
                        "question_id": question_id,
                        "selected_options": selected_options,
                        "text": text,
                        "timed_out": timed_out,
                    }

                    # Generate new stream_id for the resumed response
                    resume_stream_id = f"stream_{int(time.time() * 1000)}_{uuid4().hex[:8]}"

                    # Emit loading event
                    loading_event = {
                        "type": ChatEventType.LOADING,
                        "data": {"message": "AI is thinking...", "stream_id": resume_stream_id},
                    }
                    await websocket.send_text(json.dumps(loading_event))

                    # Dispatch resume task
                    resume_chat_from_interrupt.delay(
                        session_id_str=str(session_id),
                        topic_id_str=str(topic_id),
                        user_id_str=str(user),
                        auth_provider=auth_ctx.auth_provider,
                        question_id=question_id,
                        user_response=user_response,
                        thread_id=thread_id,
                        stream_id=resume_stream_id,
                    )

                    logger.info(f"Resume from interrupt dispatched for {connection_id}, question_id={question_id}")
                    continue

                # Handle regeneration request (after message edit)
                if message_type == ChatClientEventType.REGENERATE:
                    # Get the last user message from the topic
                    messages = await message_repo.get_messages_by_topic(topic_id, order_by_created=True)
                    user_messages = [m for m in messages if m.role == "user"]
                    if not user_messages:
                        logger.warning(f"No user messages found for regeneration in topic {topic_id}")
                        continue

                    last_user_message = user_messages[-1]
                    message_text = last_user_message.content

                    # Note: Files attached to last_user_message are automatically included
                    # during history loading in load_conversation_history()

                    # Check parallel chat limit before processing
                    limit_err = await lifecycle.check_before_message(connection_id)
                    if limit_err:
                        await websocket.send_text(json.dumps(limit_err))
                        continue

                    # Generate stream_id for this response lifecycle
                    stream_id = f"stream_{int(time.time() * 1000)}_{uuid4().hex[:8]}"

                    # Loading status
                    loading_event = {
                        "type": ChatEventType.LOADING,
                        "data": {"message": "AI is thinking...", "stream_id": stream_id},
                    }
                    await websocket.send_text(json.dumps(loading_event))

                    # Balance Check
                    try:
                        await lifecycle.check_balance(
                            db=db,
                            user_id=user,
                            auth_provider=auth_ctx.auth_provider,
                            session_id=session_id,
                            topic_id=topic_id,
                            message_id=last_user_message.id,
                        )

                    except ErrCodeError as e:
                        if e.code == ErrCode.INSUFFICIENT_BALANCE:
                            insufficient_balance_event = {
                                "type": "insufficient_balance",
                                "data": {
                                    "error_code": "INSUFFICIENT_BALANCE",
                                    "message": "Insufficient photon balance",
                                    "message_cn": "积分余额不足，请充值后继续使用",
                                    "details": e.as_dict(),
                                    "action_required": "recharge",
                                    "stream_id": stream_id,
                                },
                            }
                            await websocket.send_text(json.dumps(insufficient_balance_event, ensure_ascii=False))
                        else:
                            logger.error(f"Balance check failed for regeneration (ErrCodeError): {e}")
                        continue
                    except Exception as e:
                        logger.error(f"Balance check failed for regeneration: {e}")
                        continue

                    await db.commit()

                    # Dispatch Celery Task for regeneration
                    process_chat_message.delay(
                        session_id_str=str(session_id),
                        topic_id_str=str(topic_id),
                        user_id_str=str(user),
                        auth_provider=auth_ctx.auth_provider,
                        message_text=message_text,
                        context=None,
                        access_token=auth_ctx.access_token if auth_ctx.auth_provider.lower() == "bohr_app" else None,
                        stream_id=stream_id,
                        agent_id_for_attribution=agent_id_for_attribution,
                        marketplace_id=marketplace_id,
                        developer_user_id=developer_user_id,
                        developer_fork_mode=developer_fork_mode,
                    )

                    logger.info(f"Regeneration dispatched for topic {topic_id}, using message: {last_user_message.id}")
                    continue

                # Handle regular chat messages
                message_text = data.get("message")
                file_ids = data.get("file_ids", [])
                context = data.get("context")
                client_id = data.get("client_id")  # For optimistic UI reconciliation

                if not message_text:
                    continue

                # Check parallel chat limit before processing
                limit_err = await lifecycle.check_before_message(connection_id)
                if limit_err:
                    await websocket.send_text(json.dumps(limit_err))
                    continue

                # 1. Save user message
                user_message_create = MessageCreate(role="user", content=message_text, topic_id=topic_id)
                user_message = await message_repo.create_message(user_message_create)

                # 2. Balance Check (with message_id available, will rollback on continue if insufficient)
                try:
                    await lifecycle.check_balance(
                        db=db,
                        user_id=user,
                        auth_provider=auth_ctx.auth_provider,
                        session_id=session_id,
                        topic_id=topic_id,
                        message_id=user_message.id,
                    )
                except ErrCodeError as e:
                    if e.code == ErrCode.INSUFFICIENT_BALANCE:
                        insufficient_balance_event = {
                            "type": "insufficient_balance",
                            "data": {
                                "error_code": "INSUFFICIENT_BALANCE",
                                "message": "Insufficient photon balance",
                                "message_cn": "积分余额不足，请充值后继续使用",
                                "details": e.as_dict(),
                                "action_required": "recharge",
                            },
                        }
                        await websocket.send_text(json.dumps(insufficient_balance_event, ensure_ascii=False))
                        continue  # Exit without commit - message will be rolled back
                except Exception as e:
                    logger.error(f"Balance check failed: {e}")
                    # Fail open - allow processing to continue

                # 3. Link files
                if file_ids:
                    file_repo = FileRepository(db)
                    await file_repo.update_files_message_id(
                        file_ids=file_ids,
                        message_id=user_message.id,
                        user_id=user,
                    )
                    await db.flush()

                # 4. Echo user message (include client_id for optimistic UI reconciliation)
                user_message_with_files = await message_repo.get_message_with_files(user_message.id)
                echo_model = user_message_with_files if user_message_with_files else user_message
                echo_data = json.loads(echo_model.model_dump_json())
                if client_id:
                    echo_data["client_id"] = client_id
                await websocket.send_text(json.dumps(echo_data, default=str))

                # 5. Generate stream_id for this response lifecycle
                stream_id = f"stream_{int(time.time() * 1000)}_{uuid4().hex[:8]}"

                # 6. Loading status
                loading_event = {
                    "type": ChatEventType.LOADING,
                    "data": {"message": "AI is thinking...", "stream_id": stream_id},
                }
                await websocket.send_text(json.dumps(loading_event))

                # Commit user message before dispatching Celery task
                # This ensures the Celery worker can see the message in its separate DB session
                await db.commit()

                # 7. Dispatch Celery Task
                # Convert UUIDs to strings
                process_chat_message.delay(
                    session_id_str=str(session_id),
                    topic_id_str=str(topic_id),
                    user_id_str=str(user),
                    auth_provider=auth_ctx.auth_provider,
                    message_text=message_text,
                    context=context,
                    access_token=auth_ctx.access_token if auth_ctx.auth_provider.lower() == "bohr_app" else None,
                    stream_id=stream_id,
                    agent_id_for_attribution=agent_id_for_attribution,
                    marketplace_id=marketplace_id,
                    developer_user_id=developer_user_id,
                    developer_fork_mode=developer_fork_mode,
                )

                # 7b. Acknowledge message receipt to client
                ack_data: dict[str, str | None] = {
                    "message_id": str(user_message.id),
                }
                if client_id:
                    ack_data["client_id"] = client_id
                ack_event = {
                    "type": ChatEventType.MESSAGE_ACK,
                    "data": ack_data,
                }
                await websocket.send_text(json.dumps(ack_event))

                # 8. Topic Renaming - uses Redis pub/sub for cross-pod delivery
                topic_refreshed = await topic_repo.get_topic_with_details(topic_id)
                if topic_refreshed and topic_refreshed.name in DEFAULT_TOPIC_TITLES:
                    msgs = await message_repo.get_messages_by_topic(topic_id, limit=5)
                    if len(msgs) <= 3:
                        asyncio.create_task(
                            generate_and_update_topic_title(
                                message_text,
                                topic_id,
                                session_id,
                                auth_ctx.user_id,
                                connection_id,
                            )
                        )

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"WebSocket handler error: {e}", exc_info=True)
    finally:
        manager.disconnect(connection_id)
        # Remove presence key immediately so the worker knows we're offline
        try:
            await presence_redis.delete(presence_key)
        except Exception:
            pass  # TTL will expire anyway
        await lifecycle.on_disconnect(connection_id)
        listener_task.cancel()
        heartbeat_task.cancel()
        try:
            await listener_task
        except asyncio.CancelledError:
            pass
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        try:
            await presence_redis.aclose()
        except Exception:
            pass
