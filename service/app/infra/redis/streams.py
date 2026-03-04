"""Redis Streams publisher for persistent, replayable event delivery.

Writes events to topic-scoped Redis Streams (``events:{topic_id}``),
enabling SSE gap-fill on client reconnect via XRANGE / XREAD.
"""

import logging

import redis.asyncio as redis

logger = logging.getLogger(__name__)


class StreamPublisher:
    """Writes events to a Redis Stream for a specific topic."""

    def __init__(self, topic_id: str, redis_client: redis.Redis):
        self.stream_key = f"events:{topic_id}"
        self.redis = redis_client

    async def publish(self, event_type: str, payload: str) -> str:
        """XADD event to stream. Returns the auto-generated entry ID."""
        entry_id: str = await self.redis.xadd(
            self.stream_key,
            {"type": event_type, "payload": payload},
            maxlen=10000,
            approximate=True,
        )
        return entry_id

    async def set_expire(self, seconds: int = 600) -> None:
        """Set TTL on stream after task completes (10 min grace for late reconnects)."""
        await self.redis.expire(self.stream_key, seconds)
