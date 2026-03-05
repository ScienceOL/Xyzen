import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any, TypeVar
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


def _suppress_closed_loop_errors(loop: asyncio.AbstractEventLoop) -> None:
    """Install an exception handler that silences 'Event loop is closed' errors.

    Libraries like httpx schedule transport cleanup via ``__del__`` / weak-ref
    callbacks.  When the Celery task's event loop is already closed at that
    point, the callback raises ``RuntimeError('Event loop is closed')``.  The
    error is harmless (the OS reclaims socket resources anyway), but it pollutes
    the worker logs.  Setting a no-op handler just before ``loop.close()``
    prevents the traceback from being printed.
    """

    def _handler(loop: asyncio.AbstractEventLoop, context: dict[str, Any]) -> None:
        exc = context.get("exception")
        if isinstance(exc, RuntimeError) and "Event loop is closed" in str(exc):
            return
        # Fall back to default handling for any other exception.
        loop.default_exception_handler(context)

    loop.set_exception_handler(_handler)


# Helper to publish events to Redis Streams
class RedisPublisher:
    def __init__(self, connection_id: str, topic_id: str | None = None):
        self.connection_id = connection_id
        self.redis_client = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
        self.abort_key = f"abort:{connection_id}"

        from app.infra.redis.streams import StreamPublisher

        self._stream: StreamPublisher | None = None
        if topic_id:
            self._stream = StreamPublisher(topic_id, self.redis_client)

    async def publish(self, message: str, max_retries: int = 3) -> str | None:
        """Publish a message to the Redis Stream with retry for transient failures.

        Returns the Stream entry ID on success, ``None`` on failure.
        """
        if self._stream is None:
            logger.error("RedisPublisher: No stream configured (missing topic_id)")
            return None

        for attempt in range(max_retries):
            try:
                parsed = json.loads(message)
                event_type = parsed.get("type", "unknown")
                entry_id = await self._stream.publish(event_type, message)
                return entry_id
            except (redis.ConnectionError, redis.TimeoutError) as e:
                if attempt < max_retries - 1:
                    delay = 0.1 * (2**attempt)  # 0.1s, 0.2s, 0.4s
                    logger.warning(
                        f"Stream XADD attempt {attempt + 1} failed for {self._stream.stream_key}, retrying in {delay}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"Stream XADD failed after {max_retries} attempts for {self._stream.stream_key}: {e}")
                    return None
            except Exception as e:
                logger.error(f"Non-retryable Stream XADD error for {self._stream.stream_key}: {e}")
                return None
        return None

    async def set_generation_cursor(self, entry_id: str) -> None:
        """Mark *entry_id* as the generation cursor for the topic stream.

        SSE first-connect clients use this cursor to skip past completed events
        (the DB already holds these messages).  TTL is slightly longer than the
        stream TTL (600 s) so late reconnects can still use the cursor.
        """
        if self._stream is None:
            return
        try:
            cursor_key = f"{self._stream.stream_key}:cursor"
            await self.redis_client.set(cursor_key, entry_id, ex=700)
        except Exception as e:
            logger.warning(f"Failed to set generation cursor: {e}")

    async def close(self) -> None:
        # Set expiry on stream so it's cleaned up after grace period
        if self._stream is not None:
            try:
                await self._stream.set_expire(600)
            except Exception as e:
                logger.warning(f"Failed to set stream expiry: {e}")
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


_T = TypeVar("_T")


async def _abortable_stream(
    stream: AsyncIterator[_T],
    publisher: RedisPublisher,
    interval: float = 0.5,
) -> AsyncIterator[tuple[_T | None, bool]]:
    """Wrap *stream* with a concurrent abort-checking background task.

    Yields ``(event, False)`` for each stream event.  When an abort signal is
    detected in Redis, yields ``(None, True)`` once and stops — even if the
    underlying stream is blocked inside a long-running tool execution.
    """
    abort_event = asyncio.Event()

    async def _poller() -> None:
        while not abort_event.is_set():
            if await publisher.check_abort():
                abort_event.set()
                return
            await asyncio.sleep(interval)

    poller = asyncio.create_task(_poller())
    stream_iter = stream.__aiter__()
    try:
        while True:
            next_task = asyncio.ensure_future(stream_iter.__anext__())
            abort_task = asyncio.ensure_future(abort_event.wait())
            done, pending = await asyncio.wait(
                {next_task, abort_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for t in pending:
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, StopAsyncIteration):
                    pass

            if abort_task in done:
                yield None, True
                return

            try:
                yield next_task.result(), False
            except StopAsyncIteration:
                return
    finally:
        poller.cancel()
        try:
            await poller
        except asyncio.CancelledError:
            pass
        # Explicitly close the wrapped async generator so its finally block
        # (e.g. checkpointer cleanup) runs immediately instead of waiting for GC.
        aclose = getattr(stream_iter, "aclose", None)
        if aclose is not None:
            try:
                await aclose()
            except Exception:
                pass


@celery_app.task(name="process_chat_message")
def process_chat_message(
    session_id_str: str,
    topic_id_str: str,
    user_id_str: str,
    auth_provider: str,
    message_text: str,
    context: dict[str, Any] | None,
    access_token: str | None = None,
    stream_id: str | None = None,
    agent_id_for_attribution: str | None = None,
    marketplace_id: str | None = None,
    developer_user_id: str | None = None,
    developer_fork_mode: str | None = None,
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
                access_token,
                stream_id,
                agent_id_for_attribution,
                marketplace_id,
                developer_user_id,
                developer_fork_mode,
            )
        )
    finally:
        try:
            # Give libraries a chance to schedule cleanup callbacks (e.g. httpx client close).
            loop.run_until_complete(asyncio.sleep(0))

            pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
            if pending:
                done, still_pending = loop.run_until_complete(asyncio.wait(pending, timeout=3.0))
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
            # Suppress "Event loop is closed" errors from httpx AsyncClient.__del__
            # running after the loop is closed. These are harmless — the OS reclaims
            # the socket resources anyway.
            _suppress_closed_loop_errors(loop)
            asyncio.set_event_loop(None)
            loop.close()


async def _process_chat_message_async(
    session_id_str: str,
    topic_id_str: str,
    user_id_str: str,
    auth_provider: str,
    message_text: str,
    context: dict[str, Any] | None,
    access_token: str | None,
    stream_id: str | None = None,
    agent_id_for_attribution: str | None = None,
    marketplace_id: str | None = None,
    developer_user_id: str | None = None,
    developer_fork_mode: str | None = None,
) -> None:
    session_id = UUID(session_id_str)
    topic_id = UUID(topic_id_str)
    connection_id = f"{session_id}:{topic_id}"

    # Reconstruct user_id - simpler handling needed based on original type
    # Assuming user_id is string or int based on auth
    user_id = user_id_str

    publisher = RedisPublisher(connection_id, topic_id=topic_id_str)

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

    # Set tracking context for consumption recording in tool implementations (EE only)

    from app.core.consume.consume_service import (
        TrackingContext,
        clear_tracking_context,
        get_tracking_context,
        set_tracking_context,
    )
    from app.ee import is_ee

    if is_ee():
        set_tracking_context(
            TrackingContext(
                user_id=user_id,
                auth_provider=auth_provider,
                session_id=session_id,
                topic_id=topic_id,
                message_id=None,  # Updated after AI message is created
                db_session_factory=TaskSessionLocal,
            )
        )

    # Record task start time for scoping exception-path settlement queries
    task_start_time = datetime.now(timezone.utc)

    # Create ctx before try so exception handler can read accumulated state directly
    ctx = ChatTaskContext(
        publisher=publisher,
        topic_id=topic_id,
        session_id=session_id,
        user_id=user_id,
        auth_provider=auth_provider,
        stream_id=stream_id,
        agent_id_for_attribution=UUID(agent_id_for_attribution) if agent_id_for_attribution else None,
        marketplace_id=UUID(marketplace_id) if marketplace_id else None,
        developer_user_id=developer_user_id,
        developer_fork_mode=developer_fork_mode,
    )

    # Backfill TrackingContext with developer attribution from WS handler
    if agent_id_for_attribution or marketplace_id or developer_user_id:
        tracking_ctx = get_tracking_context()
        if tracking_ctx is not None:
            tracking_ctx.agent_id = ctx.agent_id_for_attribution
            tracking_ctx.marketplace_id = ctx.marketplace_id
            tracking_ctx.developer_user_id = ctx.developer_user_id

    try:
        async with TaskSessionLocal() as db:
            # Inject db-dependent fields
            ctx.db = db
            ctx.message_repo = MessageRepository(db)
            ctx.topic_repo = TopicRepository(db)

            topic = await ctx.topic_repo.get_topic_with_details(topic_id)
            if not topic:
                logger.error(f"Topic {topic_id} not found in worker")
                topic_error_data: dict[str, Any] = {"error": "Chat topic not found"}
                if stream_id:
                    topic_error_data["stream_id"] = stream_id
                await publisher.publish(json.dumps({"type": ChatEventType.ERROR, "data": topic_error_data}))
                return

            # Stream response with concurrent abort checking
            async for stream_event, aborted in _abortable_stream(
                get_ai_response_stream(db, message_text, topic, user_id, None, context, stream_id=stream_id or ""),
                publisher,
            ):
                if aborted:
                    logger.info(f"Abort signal detected for {connection_id}")
                    ctx.is_aborted = True
                    break

                assert stream_event is not None
                event_type = stream_event["type"]
                handler = EVENT_HANDLERS.get(event_type)
                if handler:
                    await handler(ctx, stream_event)
                else:
                    await publisher.publish(json.dumps(stream_event))

                # Check if handler requested loop break
                if ctx.should_break:
                    break

            # --- Handle Abort ---
            if ctx.is_aborted:
                await handle_abort(ctx, access_token)
                return

            # --- Handle Interrupt (ask_user_question) ---
            # The handler already saved partial state, published the event,
            # and sent message_saved. Just exit — the resume task will continue.
            if ctx.interrupted:
                return

            # --- Skip if error was already handled (committed + message_saved sent) ---
            if ctx.error_handled:
                return

            # --- Normal Finalization (DB Updates & Settlement) ---
            await handle_normal_finalization(ctx, access_token)

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
        if ctx.agent_run_id:
            try:
                async with TaskSessionLocal() as error_db:
                    agent_run_repo = AgentRunRepository(error_db)
                    await agent_run_repo.finalize(
                        agent_run_id=ctx.agent_run_id,
                        status="failed",
                        ended_at=time.time(),
                        duration_ms=int((time.time() - (ctx.agent_run_start_time or time.time())) * 1000),
                    )
                    await error_db.commit()
                    logger.debug(f"Marked AgentRun {ctx.agent_run_id} as failed due to unhandled error")
            except Exception as finalize_error:
                logger.warning(f"Failed to finalize AgentRun on error: {finalize_error}")

        # Persist accumulated message content so it survives a page refresh.
        # Use a fresh db session since the original may be in a bad state.
        if ctx.ai_message_obj:
            try:
                async with TaskSessionLocal() as msg_db:
                    msg = await msg_db.get(MessageModel, ctx.ai_message_obj.id)
                    if msg:
                        msg.content = ctx.full_content or ""
                        if ctx.full_thinking_content:
                            msg.thinking_content = ctx.full_thinking_content
                        msg.error_code = classified.code.value
                        msg.error_category = classified.code.category
                        msg_db.add(msg)
                        await msg_db.commit()
                        logger.debug(
                            f"Saved partial message content ({len(ctx.full_content)} chars) on unhandled error"
                        )

                    # Send message_saved so frontend can reconcile the stream message with the DB record
                    if msg and ctx.active_stream_id:
                        entry_id = await publisher.publish(
                            json.dumps(
                                {
                                    "type": ChatEventType.MESSAGE_SAVED,
                                    "data": {
                                        "stream_id": ctx.active_stream_id,
                                        "db_id": str(ctx.ai_message_obj.id),
                                        "created_at": msg.created_at.isoformat() if msg.created_at else None,
                                    },
                                }
                            )
                        )
                        if entry_id:
                            await publisher.set_generation_cursor(entry_id)
            except Exception as msg_save_error:
                logger.warning(f"Failed to save message content on error: {msg_save_error}")

        # Exception-path settlement: individual ConsumeRecords were already
        # created during streaming. Query pending records and settle. (EE only)
        if is_ee():
            try:
                from app.core.consume.settlement_service import settle_chat_records
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
                        total_cost = record_amounts_sum

                        if total_cost > 0:
                            await settle_chat_records(
                                db=settle_db,
                                user_id=user_id,
                                auth_provider=auth_provider,
                                record_ids=record_ids,
                                total_amount=int(total_cost),
                                marketplace_id=ctx.marketplace_id,
                                developer_user_id=ctx.developer_user_id,
                                developer_fork_mode=ctx.developer_fork_mode,
                                session_id=session_id,
                                topic_id=topic_id,
                                message_id=ctx.ai_message_obj.id if ctx.ai_message_obj else None,
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


@celery_app.task(name="resume_chat_from_interrupt")
def resume_chat_from_interrupt(
    session_id_str: str,
    topic_id_str: str,
    user_id_str: str,
    auth_provider: str,
    question_id: str,
    user_response: dict[str, Any],
    thread_id: str,
    stream_id: str,
    pre_deducted_amount: float = 0.0,
    access_token: str | None = None,
) -> None:
    """Resume agent execution after a user answers an ask_user_question interrupt."""
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            _resume_chat_from_interrupt_async(
                session_id_str,
                topic_id_str,
                user_id_str,
                auth_provider,
                question_id,
                user_response,
                thread_id,
                stream_id,
                pre_deducted_amount,
                access_token,
            )
        )
    finally:
        try:
            loop.run_until_complete(asyncio.sleep(0))
            pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
            if pending:
                done, still_pending = loop.run_until_complete(asyncio.wait(pending, timeout=3.0))
                for task in still_pending:
                    task.cancel()
                if still_pending:
                    loop.run_until_complete(asyncio.gather(*still_pending, return_exceptions=True))
                if done:
                    loop.run_until_complete(asyncio.gather(*done, return_exceptions=True))
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.run_until_complete(loop.shutdown_default_executor())
        finally:
            _suppress_closed_loop_errors(loop)
            asyncio.set_event_loop(None)
            loop.close()


async def _resume_chat_from_interrupt_async(
    session_id_str: str,
    topic_id_str: str,
    user_id_str: str,
    auth_provider: str,
    question_id: str,
    user_response: dict[str, Any],
    thread_id: str,
    stream_id: str,
    pre_deducted_amount: float,
    access_token: str | None,
) -> None:
    """Async implementation of resume_chat_from_interrupt."""
    from app.core.chat.langchain import (
        close_checkpointer,
        create_langchain_agent,
        resume_agent_from_interrupt,
    )
    from app.core.chat.stream_handlers import StreamContext

    session_id = UUID(session_id_str)
    topic_id = UUID(topic_id_str)
    connection_id = f"{session_id}:{topic_id}"
    user_id = user_id_str

    publisher = RedisPublisher(connection_id, topic_id=topic_id_str)

    logger.info(f"Resuming chat from interrupt: connection_id={connection_id}, question_id={question_id}")

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

    from app.tools.builtin.subagent.context import set_session_factory

    set_session_factory(TaskSessionLocal)

    from app.core.consume.consume_service import TrackingContext, clear_tracking_context, set_tracking_context
    from app.ee import is_ee

    if is_ee():
        set_tracking_context(
            TrackingContext(
                user_id=user_id,
                auth_provider=auth_provider,
                session_id=session_id,
                topic_id=topic_id,
                message_id=None,
                db_session_factory=TaskSessionLocal,
            )
        )

    # Agent run tracking — declared outside db context for error handling access
    agent_run_id: UUID | None = None
    agent_run_start_time: float | None = None
    ai_message_id: UUID | None = None
    ai_message_full_content: str = ""
    ai_message_thinking_content: str = ""
    ai_message_active_stream_id: str | None = None
    task_start_time = datetime.now(timezone.utc)
    ctx_marketplace_id: UUID | None = None
    ctx_developer_user_id: str | None = None

    checkpointer = None
    try:
        async with TaskSessionLocal() as db:
            topic_repo = TopicRepository(db)
            message_repo = MessageRepository(db)

            topic = await topic_repo.get_topic_with_details(topic_id)
            if not topic:
                logger.error(f"Topic {topic_id} not found for resume")
                error_data: dict[str, Any] = {"error": "Chat topic not found", "stream_id": stream_id}
                await publisher.publish(json.dumps({"type": ChatEventType.ERROR, "data": error_data}))
                return

            # Resolve agent for this topic
            from app.repos.agent import AgentRepository
            from app.repos.session import SessionRepository

            session_repo = SessionRepository(db)
            session = await session_repo.get_session_by_id(session_id)
            agent = None
            if session and session.agent_id:
                agent_repo = AgentRepository(db)
                agent = await agent_repo.get_agent_by_id(session.agent_id)

            # Resolve developer reward attribution (same as original task)
            try:
                from app.repos.agent_marketplace import AgentMarketplaceRepository

                if agent and agent.original_source_id:
                    marketplace_repo = AgentMarketplaceRepository(db)
                    listing = await marketplace_repo.get_by_id(agent.original_source_id)
                    if listing and listing.user_id:
                        ctx_developer_user_id = listing.user_id
                    ctx_marketplace_id = agent.original_source_id
            except Exception as attr_err:
                logger.debug("Failed to resolve developer attribution (non-fatal): %s", attr_err)

            # Resolve provider and model using the same logic as the original task
            from app.core.chat.langchain import resolve_provider_and_model
            from app.core.prompts import build_system_prompt_with_provenance, fetch_memory_context

            user_pm = await _get_provider_manager(user_id, db)
            provider_id, model_name, _resolved_tier = await resolve_provider_and_model(
                db=db,
                agent=agent,
                topic=topic,
                user_provider_manager=user_pm,
            )

            # Build system prompt (with memory context)
            # Extract last user message for auto-retrieval (Layer B)
            last_user_text: str | None = None
            try:
                recent_msgs = await message_repo.get_messages_by_topic(topic_id, limit=5)
                for msg in recent_msgs:
                    if msg.role == "user" and msg.content:
                        last_user_text = msg.content
                        break
            except Exception:
                pass  # Non-fatal — auto-retrieval will just be skipped
            model_for_prompt = session.model if session else None
            memory_ctx = await fetch_memory_context(user_id, message_text=last_user_text)
            prompt_build = await build_system_prompt_with_provenance(db, agent, model_for_prompt, memory_ctx=memory_ctx)

            # Reconstruct the agent graph with the same checkpointer DB
            langchain_agent, event_ctx, checkpointer = await create_langchain_agent(
                db=db,
                agent=agent,
                topic=topic,
                user_provider_manager=user_pm,
                provider_id=provider_id,
                model_name=model_name,
                system_prompt=prompt_build.prompt,
                model_tier=_resolved_tier,
            )

            # Build stream context
            ctx = StreamContext(
                stream_id=stream_id,
                db=db,
                user_id=user_id,
                event_ctx=event_ctx,
                session_id=str(session_id),
                topic_id=str(topic_id),
                model_tier=_resolved_tier,
                provider_id=provider_id,
                model_name=model_name,
            )
            if event_ctx:
                event_ctx.stream_id = stream_id

            # Build task context for event handling
            task_ctx = ChatTaskContext(
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

            # Populate developer attribution on task context
            if ctx_marketplace_id:
                task_ctx.marketplace_id = ctx_marketplace_id
            if ctx_developer_user_id:
                task_ctx.developer_user_id = ctx_developer_user_id
            if agent:
                task_ctx.agent_id_for_attribution = agent.id

            # Find existing AI message for this topic (the one with the question)
            from sqlmodel import select

            from app.models.agent_run import AgentRun as AgentRunModel

            stmt = (
                select(MessageModel)
                .where(MessageModel.topic_id == topic_id, MessageModel.role == "assistant")
                .order_by(MessageModel.created_at.desc())
                .limit(1)
            )
            result = await db.exec(stmt)
            existing_msg = result.first()
            if existing_msg and existing_msg.user_question_data:
                task_ctx.ai_message_obj = existing_msg
                task_ctx.active_stream_id = stream_id
                task_ctx.full_content = existing_msg.content or ""

                # Look up existing AgentRun so streaming_end updates it instead of creating a duplicate
                ar_stmt = select(AgentRunModel).where(AgentRunModel.message_id == existing_msg.id).limit(1)
                ar_result = await db.exec(ar_stmt)
                existing_run = ar_result.first()
                if existing_run:
                    task_ctx.agent_run_id = existing_run.id
                    task_ctx.agent_run_start_time = existing_run.started_at

                # Mark question as answered and persist the user's response
                existing_msg.user_question_data = {
                    **existing_msg.user_question_data,
                    "status": "answered",
                    "selected_options": user_response.get("selected_options"),
                    "user_text": user_response.get("text"),
                }
                db.add(existing_msg)
                await db.commit()

            # Resume the agent with concurrent abort checking
            async for stream_event, aborted in _abortable_stream(
                resume_agent_from_interrupt(langchain_agent, user_response, thread_id, ctx),
                publisher,
            ):
                if aborted:
                    logger.info(f"Abort signal detected during resume for {connection_id}")
                    task_ctx.is_aborted = True
                    break

                assert stream_event is not None
                event_type = stream_event["type"]
                handler = EVENT_HANDLERS.get(event_type)
                if handler:
                    await handler(task_ctx, stream_event)
                else:
                    await publisher.publish(json.dumps(stream_event))

                # Sync tracking vars for outer exception handler
                agent_run_id = task_ctx.agent_run_id
                agent_run_start_time = task_ctx.agent_run_start_time
                if task_ctx.ai_message_obj:
                    ai_message_id = task_ctx.ai_message_obj.id
                ai_message_full_content = task_ctx.full_content
                ai_message_thinking_content = task_ctx.full_thinking_content
                ai_message_active_stream_id = task_ctx.active_stream_id

                if task_ctx.should_break:
                    break

            # Sync final state
            agent_run_id = task_ctx.agent_run_id
            agent_run_start_time = task_ctx.agent_run_start_time
            if task_ctx.ai_message_obj:
                ai_message_id = task_ctx.ai_message_obj.id
            ai_message_full_content = task_ctx.full_content
            ai_message_thinking_content = task_ctx.full_thinking_content
            ai_message_active_stream_id = task_ctx.active_stream_id
            ctx_marketplace_id = task_ctx.marketplace_id
            ctx_developer_user_id = task_ctx.developer_user_id

            if task_ctx.is_aborted:
                await handle_abort(task_ctx, access_token)
                return

            if task_ctx.interrupted:
                return

            if not task_ctx.error_handled:
                await handle_normal_finalization(task_ctx, access_token)

    except Exception as e:
        from app.common.code.chat_error_code import classify_exception

        classified = classify_exception(e)
        logger.error(
            f"Unhandled error [{classified.error_ref}] [{classified.code}] in resume_chat_from_interrupt: {e}",
            exc_info=True,
        )

        error_event_data: dict[str, Any] = {
            "error": classified.message,
            "error_code": classified.code.value,
            "error_category": classified.code.category,
            "recoverable": classified.code.recoverable,
            "error_ref": classified.error_ref,
            "occurred_at": classified.occurred_at,
            "stream_id": stream_id,
        }
        await publisher.publish(json.dumps({"type": ChatEventType.ERROR, "data": error_event_data}))

        # Finalize AgentRun with failed status
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
            except Exception as finalize_error:
                logger.warning(f"Failed to finalize AgentRun on error: {finalize_error}")

        # Persist accumulated message content
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

                    if msg and ai_message_active_stream_id:
                        entry_id = await publisher.publish(
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
                        if entry_id:
                            await publisher.set_generation_cursor(entry_id)
            except Exception as msg_save_error:
                logger.warning(f"Failed to save message content on error: {msg_save_error}")

        # Exception-path settlement (EE only)
        if is_ee():
            try:
                from app.core.consume.pricing import calculate_settlement_total
                from app.core.consume.settlement_service import settle_chat_records
                from app.repos.consume import ConsumeRepository

                async with TaskSessionLocal() as settle_db:
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
                            await repo.bulk_update_consume_state(record_ids, "success")

                        await settle_db.commit()
            except Exception as settle_error:
                logger.warning(f"Exception-path settlement failed (non-fatal): {settle_error}")
    finally:
        clear_tracking_context()
        if checkpointer:
            await close_checkpointer(checkpointer)
        try:
            from app.core.session_pool import mark_connection_idle

            await mark_connection_idle(publisher.redis_client, user_id, connection_id)
        except Exception as e:
            logger.warning(f"Failed to mark connection idle: {e}")
        await publisher.close()
        await task_engine.dispose()


async def _get_provider_manager(user_id: str, db: AsyncSession):
    """Get provider manager for a user."""
    from app.core.providers import get_user_provider_manager

    return await get_user_provider_manager(user_id, db)
