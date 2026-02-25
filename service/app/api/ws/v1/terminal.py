"""
Terminal WebSocket endpoint.

Bridges a browser terminal (xterm.js) to a Runner's PTY session via WebSocket.
Supports session persistence and reconnection: if the browser disconnects,
the PTY session stays alive for 5 minutes while output is buffered in Redis.
On reconnect, the browser sends "attach" to resume the session.

Protocol:
  Browser → Cloud:
    {"type": "create", "payload": {"command": "claude", "args": [], "cols": 80, "rows": 24}}
    {"type": "attach", "payload": {"session_id": "pty_abc123"}}
    {"type": "input",  "payload": {"data": "<base64>"}}
    {"type": "resize", "payload": {"cols": 120, "rows": 40}}
    {"type": "close"}
    {"type": "ping"}

  Cloud → Browser:
    {"type": "created", "payload": {"session_id": "pty_abc123"}}
    {"type": "attached", "payload": {"session_id": "...", "buffered_count": 42}}
    {"type": "attach_failed", "payload": {"message": "..."}}
    {"type": "output", "payload": {"data": "<base64>"}}
    {"type": "exit",   "payload": {"exit_code": 0}}
    {"type": "error",  "payload": {"message": "..."}}
    {"type": "pong"}
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.configs import configs
from app.core.terminal.session_manager import session_manager
from app.middleware.auth import get_current_user_websocket

from .runner import (
    TERMINAL_OUTPUT_CHANNEL,
    send_runner_request,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Terminal"])

# Request timeout for PTY control messages (create, resize, close)
PTY_REQUEST_TIMEOUT = 30


@router.websocket("")
async def terminal_websocket(
    websocket: WebSocket,
    user_id: str = Depends(get_current_user_websocket),
) -> None:
    """
    WebSocket endpoint for browser terminal connections.

    Authentication: Standard JWT token passed as query parameter.
    Each connection manages one PTY session on the user's runner.
    Supports session persistence: on disconnect, sessions remain alive
    for a TTL period. On reconnect, the browser can reattach.
    """
    await websocket.accept()

    session_id: str | None = None
    redis_sub: aioredis.Redis | None = None
    output_task: asyncio.Task[None] | None = None
    intentional_close = False

    try:
        # Message loop
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send_error(websocket, "Invalid JSON")
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                # Refresh session TTL on ping to keep it alive
                if session_id:
                    await session_manager.refresh_ttl(session_id)
                continue

            if msg_type == "create":
                if session_id is not None:
                    await _send_error(websocket, "Session already created")
                    continue

                payload = msg.get("payload", {})
                session_id = f"pty_{uuid.uuid4().hex[:12]}"

                # Register session in Redis
                await session_manager.create_session(session_id, user_id)

                # Start subscribing to output BEFORE creating PTY
                # so we don't miss early output
                redis_sub = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
                output_task = asyncio.create_task(_output_listener(websocket, redis_sub, session_id, user_id))

                # Send pty_create to the runner
                try:
                    request_id = f"req_{uuid.uuid4().hex[:12]}"
                    await send_runner_request(
                        user_id=user_id,
                        request_type="pty_create",
                        payload={
                            "session_id": session_id,
                            "command": payload.get("command", ""),
                            "args": payload.get("args", []),
                            "cols": payload.get("cols", 80),
                            "rows": payload.get("rows", 24),
                        },
                        request_id=request_id,
                        timeout=PTY_REQUEST_TIMEOUT,
                    )
                    # Notify browser of the assigned session_id
                    await websocket.send_json(
                        {
                            "type": "created",
                            "payload": {"session_id": session_id},
                        }
                    )
                except Exception as e:
                    # Clean up subscriber on failure
                    if output_task:
                        output_task.cancel()
                    if redis_sub:
                        await redis_sub.aclose()
                    output_task = None
                    redis_sub = None
                    await session_manager.delete_session(session_id)
                    session_id = None
                    await _send_error(websocket, f"Failed to create PTY: {e}")
                continue

            if msg_type == "attach":
                if session_id is not None:
                    await _send_error(websocket, "Session already active")
                    continue

                payload = msg.get("payload", {})
                attach_sid = payload.get("session_id", "")
                if not attach_sid:
                    await websocket.send_json(
                        {
                            "type": "attach_failed",
                            "payload": {"message": "Missing session_id"},
                        }
                    )
                    continue

                # Verify session exists and belongs to this user
                session_data = await session_manager.get_session(attach_sid)
                if session_data is None:
                    await websocket.send_json(
                        {
                            "type": "attach_failed",
                            "payload": {"message": "Session expired or not found"},
                        }
                    )
                    continue

                if session_data.get("user_id") != user_id:
                    await websocket.send_json(
                        {
                            "type": "attach_failed",
                            "payload": {"message": "Session does not belong to this user"},
                        }
                    )
                    continue

                session_id = attach_sid
                assert session_id is not None  # narrowing for type checker

                # Mark as attached
                await session_manager.set_attached(session_id)

                # Subscribe to output
                redis_sub = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
                output_task = asyncio.create_task(_output_listener(websocket, redis_sub, session_id, user_id))

                # Replay buffered output
                buffered = await session_manager.flush_buffer(session_id)
                for item in buffered:
                    try:
                        parsed = json.loads(item)
                        msg_t = parsed.get("type", "")
                        p = parsed.get("payload", {})
                        if msg_t == "pty_output":
                            await websocket.send_json(
                                {
                                    "type": "output",
                                    "payload": {"data": p.get("data", "")},
                                }
                            )
                        elif msg_t == "pty_exit":
                            await websocket.send_json(
                                {
                                    "type": "exit",
                                    "payload": {"exit_code": p.get("exit_code", -1)},
                                }
                            )
                    except Exception:
                        pass

                await websocket.send_json(
                    {
                        "type": "attached",
                        "payload": {
                            "session_id": session_id,
                            "buffered_count": len(buffered),
                        },
                    }
                )
                continue

            if msg_type == "input":
                if session_id is None:
                    await _send_error(websocket, "No active session")
                    continue

                payload = msg.get("payload", {})
                try:
                    request_id = f"req_{uuid.uuid4().hex[:12]}"
                    await send_runner_request(
                        user_id=user_id,
                        request_type="pty_input",
                        payload={
                            "session_id": session_id,
                            "data": payload.get("data", ""),
                        },
                        request_id=request_id,
                        timeout=PTY_REQUEST_TIMEOUT,
                    )
                except Exception as e:
                    await _send_error(websocket, f"Input failed: {e}")
                continue

            if msg_type == "resize":
                if session_id is None:
                    await _send_error(websocket, "No active session")
                    continue

                payload = msg.get("payload", {})
                try:
                    request_id = f"req_{uuid.uuid4().hex[:12]}"
                    await send_runner_request(
                        user_id=user_id,
                        request_type="pty_resize",
                        payload={
                            "session_id": session_id,
                            "cols": payload.get("cols", 80),
                            "rows": payload.get("rows", 24),
                        },
                        request_id=request_id,
                        timeout=PTY_REQUEST_TIMEOUT,
                    )
                except Exception as e:
                    await _send_error(websocket, f"Resize failed: {e}")
                continue

            if msg_type == "close":
                intentional_close = True
                if session_id is not None:
                    try:
                        request_id = f"req_{uuid.uuid4().hex[:12]}"
                        await send_runner_request(
                            user_id=user_id,
                            request_type="pty_close",
                            payload={"session_id": session_id},
                            request_id=request_id,
                            timeout=PTY_REQUEST_TIMEOUT,
                        )
                    except Exception:
                        pass
                    await session_manager.delete_session(session_id)
                break  # Close the WebSocket

            await _send_error(websocket, f"Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"Terminal WS disconnected (user={user_id}, session={session_id})")
    except Exception as e:
        logger.error(f"Terminal WS error: {e}", exc_info=True)
    finally:
        if session_id is not None:
            if intentional_close:
                # User explicitly closed — kill PTY and clean up
                try:
                    request_id = f"req_{uuid.uuid4().hex[:12]}"
                    await send_runner_request(
                        user_id=user_id,
                        request_type="pty_close",
                        payload={"session_id": session_id},
                        request_id=request_id,
                        timeout=5,
                    )
                except Exception:
                    pass
                await session_manager.delete_session(session_id)
            else:
                # Unintentional disconnect — detach session, keep PTY alive
                await session_manager.set_detached(session_id)

        # Cancel output listener
        if output_task is not None:
            output_task.cancel()
            try:
                await output_task
            except (asyncio.CancelledError, Exception):
                pass

        # Close Redis subscriber
        if redis_sub is not None:
            await redis_sub.aclose()


async def _output_listener(
    websocket: WebSocket,
    r: aioredis.Redis,
    session_id: str,
    user_id: str,
) -> None:
    """Subscribe to PTY output/exit events from Redis and forward to the browser.

    If forwarding to the browser fails (disconnected), buffer output in Redis
    so it can be replayed on reattach.
    """
    channel = f"{TERMINAL_OUTPUT_CHANNEL}{session_id}"
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg["type"] == "message":
                data = msg["data"]
                if isinstance(data, (str, bytes)):
                    try:
                        parsed = json.loads(data)
                        msg_type = parsed.get("type", "")
                        payload = parsed.get("payload", {})

                        if msg_type == "pty_output":
                            try:
                                await websocket.send_json(
                                    {
                                        "type": "output",
                                        "payload": {"data": payload.get("data", "")},
                                    }
                                )
                            except Exception:
                                # Browser disconnected — buffer output
                                await session_manager.buffer_output(
                                    session_id, data if isinstance(data, str) else data.decode()
                                )
                        elif msg_type == "pty_exit":
                            try:
                                await websocket.send_json(
                                    {
                                        "type": "exit",
                                        "payload": {"exit_code": payload.get("exit_code", -1)},
                                    }
                                )
                            except Exception:
                                await session_manager.buffer_output(
                                    session_id, data if isinstance(data, str) else data.decode()
                                )
                    except Exception as e:
                        logger.warning(f"Failed to forward terminal output: {e}")
    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()


async def _send_error(websocket: WebSocket, message: str) -> None:
    """Send an error message to the browser."""
    try:
        await websocket.send_json({"type": "error", "payload": {"message": message}})
    except Exception:
        pass
