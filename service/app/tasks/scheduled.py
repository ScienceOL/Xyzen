"""
Scheduled task execution.

Provides:
- HeadlessPublisher: drop-in replacement for RedisPublisher that discards events
- execute_scheduled_chat: Celery task that runs agent chat without a WebSocket listener
- recover_scheduled_tasks: re-queues active tasks after worker restart
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.celery_app import celery_app
from app.core.chat import get_ai_response_stream
from app.infra.database import ASYNC_DATABASE_URL
from app.models.message import MessageCreate
from app.repos import MessageRepository, TopicRepository
from app.repos.scheduled_task import ScheduledTaskRepository
from app.repos.session import SessionRepository
from app.tasks.chat_event_handlers import (
    EVENT_HANDLERS,
    ChatTaskContext,
    handle_normal_finalization,
)
from app.tasks.schedule_utils import calculate_next_run

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HeadlessPublisher — no-op publisher for headless execution
# ---------------------------------------------------------------------------


class HeadlessPublisher:
    """Drop-in replacement for RedisPublisher that discards all events.

    The entire streaming pipeline (event handlers, DB persistence, billing,
    push notifications) works unchanged — events are simply not broadcast
    to any WebSocket listener.
    """

    def __init__(self, connection_id: str) -> None:
        self.connection_id = connection_id

    async def publish(self, message: str, max_retries: int = 3) -> bool:  # noqa: ARG002
        logger.debug("[headless] %s", message[:120])
        return True

    async def close(self) -> None:
        pass

    async def check_abort(self) -> bool:
        return False

    async def clear_abort(self) -> None:
        pass

    async def send_personal_message(self, message: str, connection_id: str) -> None:  # noqa: ARG002
        await self.publish(message)


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------


@celery_app.task(name="execute_scheduled_chat", bind=True)
def execute_scheduled_chat(self: Any, scheduled_task_id: str) -> None:
    """Celery task wrapper to run headless chat for a scheduled task."""
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_execute_scheduled_chat_async(scheduled_task_id))
    finally:
        try:
            loop.run_until_complete(asyncio.sleep(0))
            pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
            if pending:
                done, still_pending = loop.run_until_complete(asyncio.wait(pending, timeout=1.0))
                for task in still_pending:
                    task.cancel()
                if still_pending:
                    loop.run_until_complete(asyncio.gather(*still_pending, return_exceptions=True))
                if done:
                    loop.run_until_complete(asyncio.gather(*done, return_exceptions=True))
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.run_until_complete(loop.shutdown_default_executor())
        finally:
            asyncio.set_event_loop(None)
            loop.close()


async def _execute_scheduled_chat_async(scheduled_task_id: str) -> None:
    """Acquire a per-task Redis execution lock, then delegate to the inner function.

    The lock prevents duplicate concurrent execution when multiple Celery copies
    of the same scheduled_task_id exist in the queue (e.g. after worker recovery).
    If Redis is unavailable, falls back to the DB-level status guard in the inner function.
    """
    import redis.asyncio as aioredis

    from app.configs import configs

    redis_client = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    lock_acquired = False
    exec_lock = redis_client.lock(
        f"xyzen:sched_exec:{scheduled_task_id}",
        timeout=1800,  # 30 min — covers worst-case AI streaming
    )

    try:
        try:
            lock_acquired = await exec_lock.acquire(blocking=False)
            if not lock_acquired:
                # Another worker already holds the lock — skip this duplicate
                logger.info(f"ScheduledTask {scheduled_task_id} already executing elsewhere, skipping")
                return
        except Exception:
            # Redis unavailable — proceed without lock (graceful degradation).
            # The inner function still has a DB-level status guard as safety net.
            logger.warning(f"Redis lock unavailable for {scheduled_task_id}, proceeding without lock")

        await _execute_scheduled_chat_inner(scheduled_task_id)
    finally:
        if lock_acquired:
            try:
                await exec_lock.release()
            except Exception:
                pass  # Lock may have expired; that's fine
        await redis_client.aclose()


async def _execute_scheduled_chat_inner(scheduled_task_id: str) -> None:
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

    from app.core.consume.context import TrackingContext, clear_tracking_context, set_tracking_context

    try:
        # ---- Transaction 1: Load ScheduledTask, resolve session/topic, save user message ----
        async with TaskSessionLocal() as db:
            sched_repo = ScheduledTaskRepository(db)
            sched_task = await sched_repo.get_by_id(UUID(scheduled_task_id))
            if not sched_task:
                logger.error(f"ScheduledTask {scheduled_task_id} not found")
                return
            if sched_task.status != "active":
                logger.info(f"ScheduledTask {scheduled_task_id} is {sched_task.status}, skipping")
                return
            if sched_task.max_runs and sched_task.run_count >= sched_task.max_runs:
                logger.info(f"ScheduledTask {scheduled_task_id} reached max_runs, marking completed")
                await sched_repo.mark_completed(sched_task.id)
                await db.commit()
                return

            user_id = sched_task.user_id
            agent_id = sched_task.agent_id

            # Resolve session
            session_repo = SessionRepository(db)
            session_id = sched_task.session_id
            if not session_id:
                session = await session_repo.get_session_by_user_and_agent(user_id, agent_id)
                if session:
                    session_id = session.id
                else:
                    from app.models.sessions import SessionCreate

                    new_session = await session_repo.create_session(
                        SessionCreate(name="Scheduled Task", agent_id=agent_id),
                        user_id,
                    )
                    session_id = new_session.id

            # Resolve topic
            topic_repo = TopicRepository(db)
            topic_id = sched_task.topic_id
            if not topic_id:
                from app.models.topic import TopicCreate

                new_topic = await topic_repo.create_topic(TopicCreate(name="Scheduled Chat", session_id=session_id))
                topic_id = new_topic.id

            # Save synthetic user message
            message_repo = MessageRepository(db)
            await message_repo.create_message(MessageCreate(role="user", content=sched_task.prompt, topic_id=topic_id))
            await db.commit()

        # ---- Transaction 2: Stream AI response ----
        connection_id = f"{session_id}:{topic_id}"
        publisher = HeadlessPublisher(connection_id)

        set_tracking_context(
            TrackingContext(
                user_id=user_id,
                auth_provider="system",
                session_id=session_id,
                topic_id=topic_id,
                message_id=None,
                model_tier=None,
                db_session_factory=TaskSessionLocal,
            )
        )

        async with TaskSessionLocal() as db:
            topic = await TopicRepository(db).get_topic_with_details(topic_id)
            if not topic:
                logger.error(f"Topic {topic_id} not found for scheduled task")
                return

            ctx = ChatTaskContext(
                publisher=publisher,
                db=db,
                topic_id=topic_id,
                session_id=session_id,
                user_id=user_id,
                auth_provider="system",
                stream_id=None,
                message_repo=MessageRepository(db),
                topic_repo=TopicRepository(db),
            )

            async for stream_event in get_ai_response_stream(
                db, sched_task.prompt, topic, user_id, None, publisher, connection_id, None, stream_id=""
            ):
                event_type = stream_event["type"]
                handler = EVENT_HANDLERS.get(event_type)
                if handler:
                    await handler(ctx, stream_event)
                # No Redis publish for unhandled events in headless mode

                if ctx.should_break:
                    break

            if ctx.error_handled:
                pass  # error handler already committed
            elif not ctx.is_aborted:
                await handle_normal_finalization(ctx, 0.0, None)

        # ---- Transaction 3: Update ScheduledTask + chain next run ----
        async with TaskSessionLocal() as db:
            sched_repo = ScheduledTaskRepository(db)
            now = datetime.now(timezone.utc)
            new_run_count = await sched_repo.increment_run_count(sched_task.id, now)

            # Re-read schedule_type/max_runs from the object loaded in Txn 1
            # (these fields don't change between transactions)
            if sched_task.schedule_type == "once" or (sched_task.max_runs and new_run_count >= sched_task.max_runs):
                await sched_repo.mark_completed(sched_task.id)
                await db.commit()
                logger.info(f"ScheduledTask {scheduled_task_id} completed after {new_run_count} runs")
            else:
                # Calculate and chain next run
                next_at = calculate_next_run(
                    sched_task.schedule_type,
                    sched_task.scheduled_at,
                    sched_task.cron_expression,
                    sched_task.timezone,
                )
                if next_at:
                    result = execute_scheduled_chat.apply_async(
                        args=(scheduled_task_id,),
                        eta=next_at,
                    )
                    await sched_repo.update_scheduled_at(sched_task.id, next_at)
                    await sched_repo.update_celery_task_id(sched_task.id, result.id)
                    await db.commit()
                    logger.info(f"ScheduledTask {scheduled_task_id} next run at {next_at}")
                else:
                    await sched_repo.mark_completed(sched_task.id)
                    await db.commit()
                    logger.info(f"ScheduledTask {scheduled_task_id} no next run, marking completed")

    except Exception as e:
        logger.error(f"Scheduled task {scheduled_task_id} failed: {e}", exc_info=True)
        try:
            async with TaskSessionLocal() as db:
                sched_repo = ScheduledTaskRepository(db)
                await sched_repo.mark_failed(UUID(scheduled_task_id), str(e)[:500])
                await db.commit()
        except Exception as mark_err:
            logger.warning(f"Failed to mark scheduled task as failed: {mark_err}")
    finally:
        clear_tracking_context()
        await task_engine.dispose()


# ---------------------------------------------------------------------------
# Recovery: re-queue active scheduled tasks after worker restart
# ---------------------------------------------------------------------------


async def recover_scheduled_tasks() -> None:
    """Re-queue active scheduled tasks after worker restart.

    Uses a Redis lock to prevent duplicate recovery across workers.
    """
    import redis.asyncio as aioredis

    from app.configs import configs

    redis_client = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)

    try:
        # Non-blocking lock — expires naturally after 5 min to cover
        # the entire k8s rolling-update window. Never released explicitly.
        lock = redis_client.lock("scheduled_task_recovery_lock", timeout=300)
        if not await lock.acquire(blocking=False):
            logger.info("Another worker is recovering scheduled tasks, skipping")
            return

        task_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, future=True)
        TaskSessionLocal = async_sessionmaker(bind=task_engine, class_=AsyncSession, expire_on_commit=False)

        try:
            async with TaskSessionLocal() as db:
                repo = ScheduledTaskRepository(db)
                tasks = await repo.get_active_pending_tasks()
                now = datetime.now(timezone.utc)
                recovered = 0

                for task in tasks:
                    try:
                        if task.scheduled_at > now:
                            # Future task — schedule with eta
                            result = execute_scheduled_chat.apply_async(
                                args=(str(task.id),),
                                eta=task.scheduled_at,
                            )
                        else:
                            # Missed task — execute immediately
                            result = execute_scheduled_chat.delay(str(task.id))

                        await repo.update_celery_task_id(task.id, result.id)
                        recovered += 1
                    except Exception:
                        logger.exception(f"Failed to recover task {task.id}")

                await db.commit()
                logger.info(f"Recovered {recovered} scheduled tasks")
        finally:
            await task_engine.dispose()
    finally:
        await redis_client.aclose()
