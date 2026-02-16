import asyncio
import json
import logging
import time
from typing import Any
from uuid import UUID

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.core.celery_app import celery_app
from app.core.chat import get_ai_response_stream
from app.infra.database import ASYNC_DATABASE_URL
from app.repos import AgentRunRepository, MessageRepository, TopicRepository
from app.schemas.chat_event_types import ChatEventType
from app.tasks.chat_event_handlers import (
    EVENT_HANDLERS,
    ChatTaskContext,
    handle_abort,
    handle_normal_finalization,
)

logger = logging.getLogger(__name__)


# Helper to publish to Redis
class RedisPublisher:
    def __init__(self, connection_id: str):
        self.connection_id = connection_id
        self.redis_client = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
        self.channel = f"chat:{connection_id}"
        self.abort_key = f"abort:{connection_id}"

    async def publish(self, message: str, max_retries: int = 3) -> bool:
        """Publish a message to the Redis channel with retry for transient failures."""
        for attempt in range(max_retries):
            try:
                await self.redis_client.publish(self.channel, message)
                return True
            except (redis.ConnectionError, redis.TimeoutError) as e:
                if attempt < max_retries - 1:
                    delay = 0.1 * (2**attempt)  # 0.1s, 0.2s, 0.4s
                    logger.warning(
                        f"Redis publish attempt {attempt + 1} failed for {self.channel}, retrying in {delay}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"Redis publish failed after {max_retries} attempts for {self.channel}: {e}")
                    return False
            except Exception as e:
                logger.error(f"Non-retryable Redis publish error for {self.channel}: {e}")
                return False
        return False

    async def close(self) -> None:
        await self.redis_client.aclose()

    async def check_abort(self) -> bool:
        """Check if abort signal has been set for this connection.

        Uses the existing Redis client for a simple GET, which is not cached
        at the client level and therefore still observes the latest value.
        This avoids the overhead of creating a new Redis connection on each
        abort check tick.
        """
        try:
            result = await self.redis_client.get(self.abort_key)
            return result is not None
        except Exception as e:
            logger.warning(f"Failed to check abort signal: {e}")
            return False

    async def clear_abort(self) -> None:
        """Clear the abort signal after handling."""
        try:
            await self.redis_client.delete(self.abort_key)
        except Exception as e:
            logger.warning(f"Failed to clear abort signal: {e}")

    # Generic method to mimic ConnectionManager.send_personal_message for compatibility
    async def send_personal_message(self, message: str, connection_id: str) -> None:
        # connection_id is ignored here as we bound to it in __init__
        # but checking it matches is good practice
        if connection_id != self.connection_id:
            logger.warning(f"Publisher connection_id mismatch: {self.connection_id} vs {connection_id}")
        await self.publish(message)


def extract_content_text(content: Any) -> str:
    """Same extraction logic as in chat.py"""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(str(item.get("text", "")))
        return "".join(text_parts)
    return str(content)


@celery_app.task(name="process_chat_message")
def process_chat_message(
    session_id_str: str,
    topic_id_str: str,
    user_id_str: str,
    auth_provider: str,
    message_text: str,
    context: dict[str, Any] | None,
    pre_deducted_amount: float,
    access_token: str | None = None,
    stream_id: str | None = None,
) -> None:
    """
    Celery task wrapper to run the async chat processing loop.
    """
    # Create a new event loop for this task since Celery tasks are synchronous by default
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            _process_chat_message_async(
                session_id_str,
                topic_id_str,
                user_id_str,
                auth_provider,
                message_text,
                context,
                pre_deducted_amount,
                access_token,
                stream_id,
            )
        )
    finally:
        try:
            # Give libraries a chance to schedule cleanup callbacks (e.g. httpx client close).
            loop.run_until_complete(asyncio.sleep(0))

            pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
            if pending:
                done, still_pending = loop.run_until_complete(asyncio.wait(pending, timeout=1.0))
                # Cancel anything still pending to avoid hanging the worker.
                for task in still_pending:
                    task.cancel()
                if still_pending:
                    loop.run_until_complete(asyncio.gather(*still_pending, return_exceptions=True))
                # Retrieve exceptions from tasks that finished during the wait.
                if done:
                    loop.run_until_complete(asyncio.gather(*done, return_exceptions=True))

            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.run_until_complete(loop.shutdown_default_executor())
        finally:
            asyncio.set_event_loop(None)
            loop.close()


async def _process_chat_message_async(
    session_id_str: str,
    topic_id_str: str,
    user_id_str: str,
    auth_provider: str,
    message_text: str,
    context: dict[str, Any] | None,
    pre_deducted_amount: float,
    access_token: str | None,
    stream_id: str | None = None,
) -> None:
    session_id = UUID(session_id_str)
    topic_id = UUID(topic_id_str)
    connection_id = f"{session_id}:{topic_id}"

    # Reconstruct user_id - simpler handling needed based on original type
    # Assuming user_id is string or int based on auth
    user_id = user_id_str

    publisher = RedisPublisher(connection_id)

    # Clear any stale abort signal from previous task (e.g., from disconnect)
    # This prevents a race condition where a reconnected user's new task
    # gets incorrectly aborted by a stale abort key from a previous disconnect
    await publisher.clear_abort()

    logger.info(f"Starting async chat processing for {connection_id}")

    # Create a fresh engine and session factory for this event loop
    # This avoids the "Future attached to a different loop" error
    task_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, future=True)
    TaskSessionLocal = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Make session factory available to subagent tool via contextvars
    from app.tools.builtin.subagent.context import set_session_factory

    set_session_factory(TaskSessionLocal)

    # Agent run tracking - declared outside db context for error handling access
    agent_run_id: UUID | None = None
    agent_run_start_time: float | None = None

    try:
        async with TaskSessionLocal() as db:
            topic_repo = TopicRepository(db)
            message_repo = MessageRepository(db)

            topic = await topic_repo.get_topic_with_details(topic_id)
            if not topic:
                logger.error(f"Topic {topic_id} not found in worker")
                topic_error_data: dict[str, Any] = {"error": "Chat topic not found"}
                if stream_id:
                    topic_error_data["stream_id"] = stream_id
                await publisher.publish(json.dumps({"type": ChatEventType.ERROR, "data": topic_error_data}))
                return

            # Build context
            ctx = ChatTaskContext(
                publisher=publisher,
                db=db,
                topic_id=topic_id,
                session_id=session_id,
                user_id=user_id,
                stream_id=stream_id,
                message_repo=message_repo,
                topic_repo=topic_repo,
            )

            # Abort checking configuration - use time-based throttling for efficiency
            ABORT_CHECK_INTERVAL_SEC = 0.5  # Check every N seconds (responsive but not too frequent)
            last_abort_check_time = time.time()

            # Stream response
            async for stream_event in get_ai_response_stream(
                db, message_text, topic, user_id, None, publisher, connection_id, context, stream_id=stream_id or ""
            ):
                event_type = stream_event["type"]

                # Time-based abort check (check every ABORT_CHECK_INTERVAL_SEC seconds)
                current_time = time.time()
                if current_time - last_abort_check_time >= ABORT_CHECK_INTERVAL_SEC:
                    abort_detected = await publisher.check_abort()
                    last_abort_check_time = current_time
                    if abort_detected:
                        logger.info(f"Abort signal detected for {connection_id}")
                        ctx.is_aborted = True
                        break

                handler = EVENT_HANDLERS.get(event_type)
                if handler:
                    await handler(ctx, stream_event)
                else:
                    await publisher.publish(json.dumps(stream_event))

                # Check if handler requested loop break
                if ctx.should_break:
                    break

            # Sync tracking vars back for outer exception handler
            agent_run_id = ctx.agent_run_id
            agent_run_start_time = ctx.agent_run_start_time

            # --- Handle Abort ---
            if ctx.is_aborted:
                await handle_abort(ctx, auth_provider, pre_deducted_amount, access_token)
                return

            # --- Skip if error was already handled (committed + message_saved sent) ---
            if ctx.error_handled:
                return

            # --- Normal Finalization (DB Updates & Settlement) ---
            await handle_normal_finalization(ctx, auth_provider, pre_deducted_amount, access_token)

    except Exception as e:
        logger.error(f"Unhandled error in process_chat_message: {e}", exc_info=True)

        from app.common.code.chat_error_code import classify_exception

        error_code_val, safe_message = classify_exception(e)
        error_event_data: dict[str, Any] = {
            "error": safe_message,
            "error_code": error_code_val.value,
            "error_category": error_code_val.category,
            "recoverable": error_code_val.recoverable,
        }
        if stream_id:
            error_event_data["stream_id"] = stream_id
        await publisher.publish(
            json.dumps(
                {
                    "type": ChatEventType.ERROR,
                    "data": error_event_data,
                }
            )
        )
        # Finalize AgentRun with failed status on unhandled exceptions
        # Use a fresh db session since the original may be in a bad state
        if agent_run_id:
            try:
                async with TaskSessionLocal() as error_db:
                    agent_run_repo = AgentRunRepository(error_db)
                    await agent_run_repo.finalize(
                        agent_run_id=agent_run_id,
                        status="failed",
                        ended_at=time.time(),
                        duration_ms=int((time.time() - (agent_run_start_time or time.time())) * 1000),
                    )
                    await error_db.commit()
                    logger.debug(f"Marked AgentRun {agent_run_id} as failed due to unhandled error")
            except Exception as finalize_error:
                logger.warning(f"Failed to finalize AgentRun on error: {finalize_error}")
    finally:
        # Mark connection as idle in session pool so the parallel chat slot is freed
        try:
            from app.core.session_pool import mark_connection_idle

            await mark_connection_idle(publisher.redis_client, user_id, connection_id)
        except Exception as e:
            logger.warning(f"Failed to mark connection idle: {e}")
        await publisher.close()
        await task_engine.dispose()
