"""WebSocket endpoint for per-user real-time events.

Clients connect with ``/ws/v1/user/events?token=...`` and receive
JSON messages published via :func:`app.core.user_events.broadcast_user_event`.
"""

import asyncio
import json
import logging

import redis.asyncio as redis
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.configs import configs
from app.middleware.auth import get_current_user_websocket

logger = logging.getLogger(__name__)

router = APIRouter(tags=["UserEvents"])


@router.websocket("")
async def user_events_ws(
    websocket: WebSocket,
    current_user: str = Depends(get_current_user_websocket),
):
    """Subscribe to real-time events for the authenticated user."""
    await websocket.accept()
    channel = f"user:{current_user}:events"
    logger.info(f"User events WS connected: user={current_user}")

    r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)

    async def _reader():
        """Forward Redis pub/sub messages to the WebSocket client."""
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await websocket.send_text(message["data"])
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug(f"Redis reader stopped for user {current_user}: {e}")

    reader_task = asyncio.create_task(_reader())

    try:
        while True:
            # Read client messages (mainly for keepalive pings)
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except (json.JSONDecodeError, TypeError):
                pass
    except WebSocketDisconnect:
        logger.info(f"User events WS disconnected: user={current_user}")
    except Exception as e:
        logger.warning(f"User events WS error for user {current_user}: {e}")
    finally:
        reader_task.cancel()
        try:
            await reader_task
        except asyncio.CancelledError:
            pass
        await pubsub.unsubscribe(channel)
        await r.close()
