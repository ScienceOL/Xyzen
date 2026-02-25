import asyncio
import hashlib
import json
import logging
from dataclasses import dataclass, field
from typing import Any

import redis.asyncio as aioredis
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.configs import configs
from app.infra.database import AsyncSessionLocal
from app.repos.runner import RunnerRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Runner"])

# Redis key prefixes
RUNNER_ONLINE_PREFIX = "runner:online:"
RUNNER_REQUEST_CHANNEL = "runner:request:"
RUNNER_RESPONSE_CHANNEL = "runner:response:"
TERMINAL_OUTPUT_CHANNEL = "terminal:output:"

# Presence TTL (seconds) — refreshed by heartbeat
PRESENCE_TTL = 120
# Heartbeat interval (seconds)
HEARTBEAT_INTERVAL = 25
# Request timeout (seconds)
REQUEST_TIMEOUT = 120


@dataclass
class RunnerConnection:
    """Represents a live Runner WebSocket connection on this pod."""

    user_id: str
    runner_id: str
    websocket: WebSocket
    pending_requests: dict[str, asyncio.Future[dict[str, Any]]] = field(default_factory=dict)


class RunnerConnectionRegistry:
    """Pod-local registry of connected runners, keyed by user_id."""

    def __init__(self) -> None:
        self._connections: dict[str, RunnerConnection] = {}

    def register(self, user_id: str, conn: RunnerConnection) -> None:
        self._connections[user_id] = conn

    def unregister(self, user_id: str) -> None:
        self._connections.pop(user_id, None)

    def get(self, user_id: str) -> RunnerConnection | None:
        return self._connections.get(user_id)


# Singleton registry for this pod
runner_registry = RunnerConnectionRegistry()


async def _set_presence(r: aioredis.Redis, user_id: str, runner_id: str) -> None:
    """Set or refresh the runner presence key in Redis."""
    await r.setex(f"{RUNNER_ONLINE_PREFIX}{user_id}", PRESENCE_TTL, runner_id)


async def _clear_presence(user_id: str) -> None:
    """Remove the runner presence key from Redis."""
    r = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    try:
        await r.delete(f"{RUNNER_ONLINE_PREFIX}{user_id}")
    finally:
        await r.aclose()


async def _heartbeat_loop(
    ws: WebSocket,
    r: aioredis.Redis,
    user_id: str,
    runner_id: str,
    cancel_event: asyncio.Event,
) -> None:
    """Send pings and refresh Redis presence at regular intervals."""
    while not cancel_event.is_set():
        try:
            await asyncio.wait_for(cancel_event.wait(), timeout=HEARTBEAT_INTERVAL)
            break  # Event was set — exit
        except TimeoutError:
            pass

        try:
            await ws.send_json({"type": "ping"})
            await _set_presence(r, user_id, runner_id)
        except Exception:
            break


async def _redis_request_listener(
    conn: RunnerConnection,
    r: aioredis.Redis,
    cancel_event: asyncio.Event,
) -> None:
    """Listen for cross-pod requests forwarded via Redis Pub/Sub."""
    channel = f"{RUNNER_REQUEST_CHANNEL}{conn.user_id}"
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)
    try:
        while not cancel_event.is_set():
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg["type"] == "message":
                try:
                    data = msg["data"]
                    if isinstance(data, (str, bytes)):
                        request = json.loads(data)
                        await conn.websocket.send_json(request)
                except Exception as e:
                    logger.warning(f"Failed to forward cross-pod request to runner: {e}")
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()


async def send_runner_request(
    user_id: str,
    request_type: str,
    payload: dict[str, Any],
    request_id: str,
    timeout: float = REQUEST_TIMEOUT,
) -> dict[str, Any]:
    """
    Send a request to a connected runner and await the response.

    First checks the pod-local registry. If not found locally, publishes
    via Redis Pub/Sub for cross-pod routing.
    """
    request_msg = {
        "id": request_id,
        "type": request_type,
        "payload": payload,
    }

    conn = runner_registry.get(user_id)
    if conn:
        # Runner is on this pod — send directly
        future: asyncio.Future[dict[str, Any]] = asyncio.get_event_loop().create_future()
        conn.pending_requests[request_id] = future
        try:
            await conn.websocket.send_json(request_msg)
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            conn.pending_requests.pop(request_id, None)

    # Runner is on another pod — publish via Redis and subscribe to response
    r = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    try:
        response_channel = f"{RUNNER_RESPONSE_CHANNEL}{request_id}"
        pubsub = r.pubsub()
        await pubsub.subscribe(response_channel)
        try:
            # Publish request to the runner's channel
            await r.publish(f"{RUNNER_REQUEST_CHANNEL}{user_id}", json.dumps(request_msg))

            # Wait for response
            deadline = asyncio.get_event_loop().time() + timeout
            while True:
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    raise TimeoutError(f"Runner request {request_id} timed out")
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=min(remaining, 1.0))
                if msg and msg["type"] == "message":
                    data = msg["data"]
                    if isinstance(data, (str, bytes)):
                        return json.loads(data)
        finally:
            await pubsub.unsubscribe(response_channel)
            await pubsub.aclose()
    finally:
        await r.aclose()


@router.websocket("")
async def runner_websocket(
    websocket: WebSocket,
    token: str | None = Query(None),
) -> None:
    """
    WebSocket endpoint for Runner CLI connections.

    Authentication: Runner token passed as query parameter.
    The token is hashed with SHA-256 and looked up in the runners table.
    """
    if not token:
        await websocket.close(code=4001, reason="Missing runner token")
        return

    # Authenticate by token hash
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    async with AsyncSessionLocal() as db:
        repo = RunnerRepository(db)
        runner = await repo.get_by_token_hash(token_hash)

        if not runner:
            await websocket.close(code=4001, reason="Invalid runner token")
            return

        if not runner.is_active:
            await websocket.close(code=4003, reason="Runner token is disabled")
            return

        user_id = runner.user_id
        runner_id = str(runner.id)

    await websocket.accept()

    # Send connected acknowledgement
    await websocket.send_json(
        {
            "type": "connected",
            "runner_id": runner_id,
        }
    )

    # Set up connection
    conn = RunnerConnection(
        user_id=user_id,
        runner_id=runner_id,
        websocket=websocket,
    )
    runner_registry.register(user_id, conn)

    # Redis connection for presence and Pub/Sub
    r = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    cancel_event = asyncio.Event()
    heartbeat_task: asyncio.Task[None] | None = None
    redis_listener_task: asyncio.Task[None] | None = None

    try:
        # Set initial presence
        await _set_presence(r, user_id, runner_id)

        # Start background tasks
        heartbeat_task = asyncio.create_task(_heartbeat_loop(websocket, r, user_id, runner_id, cancel_event))
        redis_listener_task = asyncio.create_task(_redis_request_listener(conn, r, cancel_event))

        # Message loop
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from runner {runner_id}")
                continue

            msg_type = msg.get("type", "")
            msg_id = msg.get("id")

            if msg_type == "pong":
                # Heartbeat ack — no action needed
                continue

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if msg_type == "info":
                # Runner reports its environment info (and active PTY sessions)
                payload = msg.get("payload", {})
                async with AsyncSessionLocal() as db:
                    repo = RunnerRepository(db)
                    await repo.touch_last_connected(
                        runner.id,
                        os_info=payload.get("os"),
                        work_dir=payload.get("work_dir"),
                    )
                    await db.commit()
                # Log active PTY sessions surviving reconnection
                pty_sessions = payload.get("pty_sessions", [])
                if pty_sessions:
                    logger.info(
                        f"Runner {runner_id} reconnected with {len(pty_sessions)} active PTY sessions: {pty_sessions}"
                    )
                continue

            # Response to a pending request
            if msg_id and msg_type.endswith("_result"):
                # Check if there's a local pending request
                future = conn.pending_requests.get(msg_id)
                if future and not future.done():
                    future.set_result(msg)
                else:
                    # Cross-pod response — publish to Redis
                    response_channel = f"{RUNNER_RESPONSE_CHANNEL}{msg_id}"
                    await r.publish(response_channel, json.dumps(msg))
                continue

            # Proactive PTY messages (runner → cloud) — forward to terminal subscribers
            if msg_type in ("pty_output", "pty_exit"):
                payload = msg.get("payload", {})
                session_id = payload.get("session_id", "")
                if session_id:
                    channel = f"{TERMINAL_OUTPUT_CHANNEL}{session_id}"
                    await r.publish(channel, json.dumps(msg))
                continue

            logger.debug(f"Unknown message type from runner {runner_id}: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"Runner {runner_id} disconnected (user={user_id})")
    except Exception as e:
        logger.error(f"Runner {runner_id} error: {e}", exc_info=True)
    finally:
        cancel_event.set()
        runner_registry.unregister(user_id)
        await _clear_presence(user_id)

        # Cancel background tasks
        for task in [heartbeat_task, redis_listener_task]:
            if task is not None:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

        await r.aclose()
