"""
WebSocket connection management for broadcasting updates.
This module provides a centralized way to manage WebSocket connections
and broadcast messages to connected clients.

For multi-pod deployments, broadcasts are sent via Redis pub/sub to ensure
all connected clients receive updates regardless of which pod they're connected to.
"""

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection and add it to active connections."""
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection from active connections."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: Any) -> None:
        """Broadcasts a message to all connected clients."""
        if not self.active_connections:
            return

        # Use default=str to handle non-serializable types like datetime
        message = json.dumps(data, default=str)

        # Create a copy of the list to avoid modification during iteration
        connections = self.active_connections.copy()

        for connection in connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Remove the connection if sending fails (connection might be closed)
                self.disconnect(connection)


class RedisBroadcastManager(ConnectionManager):
    """
    WebSocket connection manager with Redis pub/sub support for multi-pod deployments.

    - Local connections are managed in-memory (same as ConnectionManager)
    - Broadcasts are published to Redis and received by all pods
    - Each pod subscribes to the Redis channel and forwards to local connections
    """

    def __init__(self, channel: str) -> None:
        super().__init__()
        self.channel = channel
        self._subscriber_task: asyncio.Task | None = None
        self._redis: Any = None

    async def _get_redis(self) -> Any:
        """Get async Redis client."""
        if self._redis is None:
            from app.infra.redis import get_redis_client

            self._redis = await get_redis_client()
        return self._redis

    async def start_subscriber(self) -> None:
        """Start the Redis subscriber task to receive broadcasts from other pods."""
        if self._subscriber_task is not None:
            return

        async def _subscriber_loop() -> None:
            import redis.asyncio as redis

            from app.configs import configs

            r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
            pubsub = r.pubsub()
            await pubsub.subscribe(self.channel)
            logger.info(f"MCP WebSocket manager subscribed to Redis channel: {self.channel}")

            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        # Forward the message to all local connections
                        data = message["data"]
                        await self._broadcast_local(data)
            except asyncio.CancelledError:
                logger.info(f"Redis subscriber cancelled for channel: {self.channel}")
            except Exception as e:
                logger.error(f"Redis subscriber error: {e}")
            finally:
                await pubsub.unsubscribe(self.channel)
                await r.close()

        self._subscriber_task = asyncio.create_task(_subscriber_loop())

    async def stop_subscriber(self) -> None:
        """Stop the Redis subscriber task."""
        if self._subscriber_task is not None:
            self._subscriber_task.cancel()
            try:
                await self._subscriber_task
            except asyncio.CancelledError:
                pass
            self._subscriber_task = None

    async def _broadcast_local(self, message: str) -> None:
        """Broadcast a message to local connections only."""
        if not self.active_connections:
            return

        connections = self.active_connections.copy()
        for connection in connections:
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect(connection)

    async def broadcast(self, data: Any) -> None:
        """
        Broadcast a message to all connected clients across all pods.

        Publishes to Redis, which will be received by all pods
        (including this one via the subscriber).
        """
        message = json.dumps(data, default=str)

        try:
            redis_client = await self._get_redis()
            await redis_client.publish(self.channel, message)
            logger.debug(f"Published MCP status update to Redis channel: {self.channel}")
        except Exception as e:
            logger.error(f"Failed to publish to Redis, falling back to local broadcast: {e}")
            # Fallback to local broadcast if Redis fails
            await self._broadcast_local(message)


# Global instance for MCP server status broadcasts
# Use Redis-backed manager for multi-pod support
mcp_websocket_manager = RedisBroadcastManager(channel="mcp:status")
