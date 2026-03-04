"""SSE endpoint for persistent, replayable event delivery via Redis Streams."""

import asyncio
import logging
from uuid import UUID

import redis.asyncio as redis
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.infra.database import get_session
from app.middleware.auth import AuthContext, get_auth_context
from app.repos import SessionRepository, TopicRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Events"])

SSE_PRESENCE_TTL = 120  # seconds
KEEPALIVE_INTERVAL = 15  # seconds
XREAD_BLOCK_MS = 2000  # 2s blocking read


@router.get("/{topic_id}/events")
async def topic_events(
    topic_id: UUID,
    request: Request,
    auth_ctx: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_session),
    last_event_id: str | None = Header(None, alias="Last-Event-ID"),
) -> StreamingResponse:
    """SSE stream of chat events for a topic.

    - On first connect: reads from ``0`` (all buffered events).
    - On reconnect: resumes from ``Last-Event-ID`` header.
    - Keepalive comments every 15 s to prevent proxy timeouts.
    """
    user = auth_ctx.user_id

    # Validate topic authorization
    topic_repo = TopicRepository(db)
    session_repo = SessionRepository(db)
    topic = await topic_repo.get_topic_by_id(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    session = await session_repo.get_session_by_id(topic.session_id)
    if not session or session.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied")

    stream_key = f"events:{topic_id}"

    async def event_generator():  # noqa: C901
        r: redis.Redis | None = None
        presence_key = f"sse:active:{topic_id}:{user}"
        try:
            r = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)

            # Set presence key
            await r.set(presence_key, "1", ex=SSE_PRESENCE_TTL)

            # Determine start position
            if last_event_id:
                start_id = last_event_id
            else:
                start_id = "0"

            # Gap-fill: replay missed events
            if last_event_id:
                # Reconnect — replay from after the last seen event
                entries = await r.xrange(stream_key, min=f"({last_event_id}", max="+")
                for entry_id, fields in entries:
                    if await request.is_disconnected():
                        return
                    event_type = fields.get("type", "message")
                    payload = fields.get("payload", "{}")
                    yield f"id: {entry_id}\nevent: {event_type}\ndata: {payload}\n\n"
                    start_id = entry_id
            else:
                # First connect — use generation cursor to skip completed events.
                # The cursor is set after each message_saved event so that DB-loaded
                # messages are not re-created by replaying their stream events.
                gen_cursor = await r.get(f"events:{topic_id}:cursor")
                replay_from = f"({gen_cursor}" if gen_cursor else "0"
                entries = await r.xrange(stream_key, min=replay_from, max="+")
                for entry_id, fields in entries:
                    if await request.is_disconnected():
                        return
                    event_type = fields.get("type", "message")
                    payload = fields.get("payload", "{}")
                    yield f"id: {entry_id}\nevent: {event_type}\ndata: {payload}\n\n"
                    start_id = entry_id

            # Live tail: XREAD BLOCK in a loop.
            # If events were replayed, continue from the last replayed entry;
            # otherwise start from "$" (only future events).
            cursor = start_id if start_id != "0" else "$"

            seconds_since_event = 0.0
            while True:
                if await request.is_disconnected():
                    return

                # XREAD returns None on timeout (no new entries)
                result = await r.xread({stream_key: cursor}, count=100, block=XREAD_BLOCK_MS)

                if result:
                    for _stream_name, entries in result:
                        for entry_id, fields in entries:
                            event_type = fields.get("type", "message")
                            payload = fields.get("payload", "{}")
                            yield f"id: {entry_id}\nevent: {event_type}\ndata: {payload}\n\n"
                            cursor = entry_id
                    seconds_since_event = 0.0
                else:
                    seconds_since_event += XREAD_BLOCK_MS / 1000

                # Keepalive comment to prevent proxy/browser timeout
                if seconds_since_event >= KEEPALIVE_INTERVAL:
                    yield ":keepalive\n\n"
                    seconds_since_event = 0.0

                # Refresh presence TTL
                try:
                    await r.expire(presence_key, SSE_PRESENCE_TTL)
                except Exception:
                    pass

        except asyncio.CancelledError:
            logger.info(f"SSE connection cancelled for topic {topic_id}")
        except Exception as e:
            logger.error(f"SSE stream error for topic {topic_id}: {e}", exc_info=True)
        finally:
            if r:
                try:
                    await r.delete(presence_key)
                except Exception:
                    pass
                try:
                    await r.aclose()
                except Exception:
                    pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
