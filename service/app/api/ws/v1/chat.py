import asyncio
import json
import logging
from uuid import UUID

import redis.asyncio as redis
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.common.code.error_code import ErrCode, ErrCodeError
from app.configs import configs
from app.core.chat.topic_generator import generate_and_update_topic_title
from app.core.consume import create_consume_for_chat
from app.infra.database import AsyncSessionLocal
from app.middleware.auth import AuthContext, get_auth_context_websocket
from app.models.message import MessageCreate
from app.repos import FileRepository, MessageRepository, SessionRepository, TopicRepository
from app.schemas.chat_event_types import ChatClientEventType, ChatEventType

# from app.core.celery_app import celery_app # Not needed directly if we import the task
from app.tasks.chat import process_chat_message

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
        await r.close()


@router.websocket("/sessions/{session_id}/topics/{topic_id}")
async def chat_websocket(
    websocket: WebSocket,
    session_id: UUID,
    topic_id: UUID,
    auth_ctx: AuthContext = Depends(get_auth_context_websocket),
) -> None:
    connection_id = f"{session_id}:{topic_id}"
    await manager.connect(websocket, connection_id)

    user = auth_ctx.user_id

    # Validate session and topic access
    async with AsyncSessionLocal() as db:
        topic_repo = TopicRepository(db)
        session_repo = SessionRepository(db)
        topic = await topic_repo.get_topic_with_details(topic_id)
        if not topic or topic.session_id != session_id:
            logger.error(f"DEBUG: Topic check failed. Topic: {topic}, SessionID: {session_id}")
            if topic:
                logger.error(f"DEBUG: Topic session id: {topic.session_id} vs {session_id}")
            await websocket.close(code=4004, reason="Topic not found or does not belong to the session")
            return

        session = await session_repo.get_session_by_id(session_id)
        if not session or session.user_id != user:
            logger.error(f"DEBUG: Session check failed. Session: {session}, User: {user}")
            if session:
                logger.error(f"DEBUG: Session user id: {session.user_id} vs {user}")
            await websocket.close(code=4003, reason="Session not found or access denied")
            return

    # Start Redis listener task
    listener_task = asyncio.create_task(redis_listener(websocket, connection_id))

    try:
        while True:
            data = await websocket.receive_json()

            async with AsyncSessionLocal() as db:
                message_repo = MessageRepository(db)
                topic_repo = TopicRepository(db)

                message_type = data.get("type", ChatClientEventType.MESSAGE)

                # Ignore tool confirmation for now as implicit execution is assumed/enforced
                if message_type in [ChatClientEventType.TOOL_CALL_CONFIRM, ChatClientEventType.TOOL_CALL_CANCEL]:
                    logger.warning(f"Received unused tool confirmation event: {message_type}")
                    continue

                # Handle regular chat messages
                message_text = data.get("message")
                file_ids = data.get("file_ids", [])
                context = data.get("context")

                if not message_text:
                    continue

                # 1. Save user message
                user_message_create = MessageCreate(role="user", content=message_text, topic_id=topic_id)
                user_message = await message_repo.create_message(user_message_create)

                # 2. Link files
                if file_ids:
                    file_repo = FileRepository(db)
                    await file_repo.update_files_message_id(
                        file_ids=file_ids,
                        message_id=user_message.id,
                        user_id=user,
                    )
                    await db.flush()

                # 3. Echo user message
                user_message_with_files = await message_repo.get_message_with_files(user_message.id)
                if user_message_with_files:
                    await websocket.send_text(user_message_with_files.model_dump_json())
                else:
                    await websocket.send_text(user_message.model_dump_json())

                # 4. Loading status
                loading_event = {"type": ChatEventType.LOADING, "data": {"message": "AI is thinking..."}}
                await websocket.send_text(json.dumps(loading_event))

                # 5. Pre-deduction / Balance Check
                base_cost = 3
                pre_deducted_amount = 0.0
                try:
                    access_key = None
                    if auth_ctx.auth_provider.lower() == "bohr_app":
                        access_key = auth_ctx.access_token

                    await create_consume_for_chat(
                        db=db,
                        user_id=user,
                        auth_provider=auth_ctx.auth_provider,
                        amount=base_cost,
                        access_key=access_key,
                        session_id=session_id,
                        topic_id=topic_id,
                        message_id=user_message.id,
                        description="Chat base cost (pre-deduction)",
                    )
                    pre_deducted_amount = float(base_cost)

                except ErrCodeError as e:
                    if e.code == ErrCode.INSUFFICIENT_BALANCE:
                        insufficient_balance_event = {
                            "type": "insufficient_balance",
                            "data": {
                                "error_code": "INSUFFICIENT_BALANCE",
                                "message": "Insufficient photon balance",
                                "message_cn": "光子余额不足，请充值后继续使用",
                                "details": e.as_dict(),
                                "action_required": "recharge",
                            },
                        }
                        await websocket.send_text(json.dumps(insufficient_balance_event, ensure_ascii=False))
                        continue  # Stop processing
                except Exception as e:
                    logger.error(f"Pre-deduction failed: {e}")
                    # Fail open

                # Commit user message before dispatching Celery task
                # This ensures the Celery worker can see the message in its separate DB session
                await db.commit()

                # 6. Dispatch Celery Task
                # Convert UUIDs to strings
                process_chat_message.delay(  # type: ignore
                    session_id_str=str(session_id),
                    topic_id_str=str(topic_id),
                    user_id_str=str(user),
                    auth_provider=auth_ctx.auth_provider,
                    message_text=message_text,
                    context=context,
                    pre_deducted_amount=pre_deducted_amount,
                    access_token=auth_ctx.access_token if auth_ctx.auth_provider.lower() == "bohr_app" else None,
                )

                # 7. Topic Renaming - uses Redis pub/sub for cross-pod delivery
                topic_refreshed = await topic_repo.get_topic_with_details(topic_id)
                if topic_refreshed and topic_refreshed.name in ["新的聊天", "New Chat", "New Topic"]:
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
        listener_task.cancel()
        try:
            await listener_task
        except asyncio.CancelledError:
            pass
