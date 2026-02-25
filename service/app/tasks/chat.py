import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.core.celery_app import celery_app
from app.core.chat import get_ai_response_stream
from app.infra.database import ASYNC_DATABASE_URL
from app.models.message import Message as MessageModel
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
    task_engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=False,
        future=True,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=3,
        max_overflow=5,
    )
    TaskSessionLocal = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Make session factory available to subagent tool via contextvars
    from app.tools.builtin.subagent.context import set_session_factory

    set_session_factory(TaskSessionLocal)

    # Set tracking context for consumption recording in tool implementations
    from app.core.consume.context import TrackingContext, clear_tracking_context, set_tracking_context

    set_tracking_context(
        TrackingContext(
            user_id=user_id,
            auth_provider=auth_provider,
            session_id=session_id,
            topic_id=topic_id,
            message_id=None,  # Updated after AI message is created
            model_tier=None,  # Updated at settlement time
            db_session_factory=TaskSessionLocal,
        )
    )

    # Agent run tracking - declared outside db context for error handling access
    agent_run_id: UUID | None = None
    agent_run_start_time: float | None = None

    # Message tracking - declared outside db context for error handling access
    ai_message_id: UUID | None = None
    ai_message_full_content: str = ""
    ai_message_thinking_content: str = ""
    ai_message_active_stream_id: str | None = None

    # Record task start time for scoping exception-path settlement queries
    task_start_time = datetime.now(timezone.utc)

    # Developer reward attribution — synced from ctx for exception-path settlement
    ctx_marketplace_id: UUID | None = None
    ctx_developer_user_id: str | None = None

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
                auth_provider=auth_provider,
                stream_id=stream_id,
                message_repo=message_repo,
                topic_repo=topic_repo,
            )

            # Resolve developer reward attribution from agent → marketplace listing
            try:
                from app.repos.agent import AgentRepository
                from app.repos.agent_marketplace import AgentMarketplaceRepository
                from app.repos.session import SessionRepository as _SessionRepo

                _session_repo = _SessionRepo(db)
                _session = await _session_repo.get_session_by_id(session_id)
                if _session and _session.agent_id:
                    _agent_repo = AgentRepository(db)
                    _agent = await _agent_repo.get_agent_by_id(_session.agent_id)
                    if _agent and _agent.original_source_id:
                        ctx.agent_id_for_attribution = _agent.id
                        ctx.marketplace_id = _agent.original_source_id
                        _marketplace_repo = AgentMarketplaceRepository(db)
                        _listing = await _marketplace_repo.get_by_id(_agent.original_source_id)
                        if _listing and _listing.user_id:
                            ctx.developer_user_id = _listing.user_id
            except Exception as attr_err:
                logger.debug("Failed to resolve developer attribution (non-fatal): %s", attr_err)

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

                # Continuously sync tracking vars for outer exception handler
                agent_run_id = ctx.agent_run_id
                agent_run_start_time = ctx.agent_run_start_time
                if ctx.ai_message_obj:
                    ai_message_id = ctx.ai_message_obj.id
                ai_message_full_content = ctx.full_content
                ai_message_thinking_content = ctx.full_thinking_content
                ai_message_active_stream_id = ctx.active_stream_id

                # Check if handler requested loop break
                if ctx.should_break:
                    break

            # Sync final state (handles cases where loop ends normally after last event)
            agent_run_id = ctx.agent_run_id
            agent_run_start_time = ctx.agent_run_start_time
            if ctx.ai_message_obj:
                ai_message_id = ctx.ai_message_obj.id
            ai_message_full_content = ctx.full_content
            ai_message_thinking_content = ctx.full_thinking_content
            ai_message_active_stream_id = ctx.active_stream_id
            ctx_marketplace_id = ctx.marketplace_id
            ctx_developer_user_id = ctx.developer_user_id

            # --- Handle Abort ---
            if ctx.is_aborted:
                await handle_abort(ctx, pre_deducted_amount, access_token)
                return

            # --- Skip if error was already handled (committed + message_saved sent) ---
            if ctx.error_handled:
                return

            # --- Normal Finalization (DB Updates & Settlement) ---
            await handle_normal_finalization(ctx, pre_deducted_amount, access_token)

    except Exception as e:
        from app.common.code.chat_error_code import classify_exception

        classified = classify_exception(e)
        logger.error(
            f"Unhandled error [{classified.error_ref}] [{classified.code}] in process_chat_message: {e}",
            exc_info=True,
        )

        detail = f"Exception: {classified.error_type}" if classified.error_type else None
        error_event_data: dict[str, Any] = {
            "error": classified.message,
            "error_code": classified.code.value,
            "error_category": classified.code.category,
            "recoverable": classified.code.recoverable,
            "error_ref": classified.error_ref,
            "occurred_at": classified.occurred_at,
        }
        if detail is not None:
            error_event_data["detail"] = detail
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

        # Persist accumulated message content so it survives a page refresh.
        # Use a fresh db session since the original may be in a bad state.
        if ai_message_id:
            try:
                async with TaskSessionLocal() as msg_db:
                    msg = await msg_db.get(MessageModel, ai_message_id)
                    if msg:
                        msg.content = ai_message_full_content or ""
                        if ai_message_thinking_content:
                            msg.thinking_content = ai_message_thinking_content
                        msg.error_code = classified.code.value
                        msg.error_category = classified.code.category
                        msg_db.add(msg)
                        await msg_db.commit()
                        logger.debug(
                            f"Saved partial message content ({len(ai_message_full_content)} chars) on unhandled error"
                        )

                    # Send message_saved so frontend can reconcile the stream message with the DB record
                    if msg and ai_message_active_stream_id:
                        await publisher.publish(
                            json.dumps(
                                {
                                    "type": ChatEventType.MESSAGE_SAVED,
                                    "data": {
                                        "stream_id": ai_message_active_stream_id,
                                        "db_id": str(ai_message_id),
                                        "created_at": msg.created_at.isoformat() if msg.created_at else None,
                                    },
                                }
                            )
                        )
            except Exception as msg_save_error:
                logger.warning(f"Failed to save message content on error: {msg_save_error}")

        # Exception-path settlement: individual ConsumeRecords were already
        # created during streaming. Query pending records and settle.
        try:
            from app.core.consume.pricing import calculate_settlement_total
            from app.core.consume.service import settle_chat_records
            from app.repos.consume import ConsumeRepository

            async with TaskSessionLocal() as settle_db:
                # Query pending ConsumeRecords for this task
                repo = ConsumeRepository(settle_db)
                records = await repo.list_records_for_exception_settlement(
                    user_id=user_id,
                    session_id=session_id,
                    topic_id=topic_id,
                    since=task_start_time,
                )

                if records:
                    record_ids = [r.id for r in records]
                    record_amounts_sum = sum(r.amount for r in records)

                    # Total = sum of record amounts
                    total_cost = calculate_settlement_total(record_amounts_sum, 1.0)
                    remaining = total_cost - pre_deducted_amount

                    if remaining > 0:
                        await settle_chat_records(
                            db=settle_db,
                            user_id=user_id,
                            auth_provider=auth_provider,
                            record_ids=record_ids,
                            total_amount=int(remaining),
                            marketplace_id=ctx_marketplace_id,
                            developer_user_id=ctx_developer_user_id,
                            session_id=session_id,
                            topic_id=topic_id,
                            message_id=ai_message_id,
                        )
                    elif record_ids:
                        # No billing but still mark as success
                        await repo.bulk_update_consume_state(record_ids, "success")

                    logger.info("Exception-path settlement completed: %d credits", total_cost)
                    await settle_db.commit()
        except Exception as settle_error:
            logger.warning(f"Exception-path settlement failed (non-fatal): {settle_error}")
    finally:
        # Clear tracking context
        clear_tracking_context()

        # Mark connection as idle in session pool so the parallel chat slot is freed
        try:
            from app.core.session_pool import mark_connection_idle

            await mark_connection_idle(publisher.redis_client, user_id, connection_id)
        except Exception as e:
            logger.warning(f"Failed to mark connection idle: {e}")
        await publisher.close()
        await task_engine.dispose()
