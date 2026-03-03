"""Background memory extraction and core memory updates.

Triggered after each chat finalization to:
1. Gate: heuristic pre-filter (zero cost) to skip trivial conversations
2. Extract semantic facts from the conversation using langmem
3. Merge with existing memories (dedup, update, create)
4. Synthesize core memory profile updates via langmem profile mode

Periodic tasks:
- daily_memory_catchup: extract from conversations skipped by the heuristic gate
- weekly_core_memory_resynthesis: refresh core memory profile from full memory corpus

The extraction uses a platform-configured model (same pattern as topic_rename).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Trilingual signal keywords (en / zh / ja)
# Presence of any keyword in user messages is a strong signal for extraction.
# ---------------------------------------------------------------------------
SIGNAL_KEYWORDS: tuple[str, ...] = (
    # English — preference / identity / instruction signals
    "i prefer",
    "i like",
    "i use",
    "i work",
    "my name",
    "always use",
    "never use",
    "remember that",
    "don't forget",
    "i'm a",
    "i am a",
    "my project",
    "my team",
    "call me",
    "i want you to",
    "from now on",
    # Chinese
    "我喜欢",
    "我偏好",
    "我用",
    "我的名字",
    "我叫",
    "记住",
    "不要忘记",
    "我是",
    "我的项目",
    "我的团队",
    "从现在开始",
    "我希望你",
    "我工作",
    "我在",
    "我习惯",
    "请记住",
    # Japanese
    "私は",
    "好きです",
    "使っています",
    "名前は",
    "覚えて",
    "忘れないで",
    "私の",
    "プロジェクト",
    "チーム",
    "これからは",
    "いつも",
    "決して",
    "お願い",
)


def _should_extract(messages: list[Any]) -> bool:
    """Zero-cost heuristic pre-filter for memory extraction.

    Returns True if the conversation is likely worth extracting memories from.
    Logic: must pass the hard gate, then any soft signal triggers extraction.

    Args:
        messages: DB message objects with .role and .content attributes.
    """
    from app.configs import configs

    gate = configs.Memory.ExtractionGate

    # Hard gate: minimum conversation substance
    user_msgs = [m for m in messages if m.role == "user"]
    if len(user_msgs) < gate.MinUserMessages:
        return False
    total_chars = sum(len(m.content or "") for m in messages)
    if total_chars < gate.MinTotalChars:
        return False

    # Soft signal 1: keyword scan on user messages
    text_lower = " ".join((m.content or "").lower() for m in messages if m.role == "user")
    if any(kw in text_lower for kw in SIGNAL_KEYWORDS):
        return True

    # Soft signal 2: long conversation fallback
    if len(messages) >= gate.LongConversationMessages and total_chars >= gate.LongConversationChars:
        return True

    return False


@celery_app.task(name="extract_and_update_memories", ignore_result=True)
def extract_and_update_memories(
    user_id: str,
    topic_id: str,
) -> None:
    """Celery task: extract memories from a completed conversation.

    Follows the same event-loop pattern as process_chat_message in tasks/chat.py.
    """
    _run_in_new_loop(_extract_and_update_memories_async(user_id, topic_id))


async def _extract_and_update_memories_async(
    user_id: str,
    topic_id: str,
) -> None:
    """Run langmem memory store manager to extract and merge memories.

    Flow:
    1. Acquire Redis idempotency lock
    2. Fetch messages from DB
    3. Heuristic gate — skip if conversation is trivial
    4. LLM extraction via langmem create_memory_store_manager
    5. Core memory synthesis via langmem profile mode (if enabled)
    """
    from uuid import UUID

    import redis.asyncio as aioredis
    from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
    from langchain_core.runnables import RunnableConfig
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.configs import configs
    from app.core.memory.service import get_or_initialize_memory_service
    from app.infra.database import ASYNC_DATABASE_URL

    # ---- Redis idempotency lock ----
    redis_client = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    lock_key = f"mem:extract:{user_id}:{topic_id}"
    lock = redis_client.lock(lock_key, timeout=300)  # 5 min TTL
    lock_acquired = False

    try:
        try:
            lock_acquired = await lock.acquire(blocking=False)
            if not lock_acquired:
                logger.info(
                    "Memory extraction already running: user=%s topic=%s, skipping",
                    user_id,
                    topic_id,
                )
                return
        except Exception:
            # Redis unavailable — proceed without lock (graceful degradation)
            logger.warning("Redis lock unavailable for memory extraction, proceeding without lock")

        memory_svc = await get_or_initialize_memory_service()
        if not memory_svc.store:
            logger.info("Memory store not available, skipping extraction")
            return

        store = memory_svc.store

        task_engine = create_async_engine(
            ASYNC_DATABASE_URL,
            echo=False,
            pool_size=2,
            max_overflow=1,
        )
        TaskSessionLocal = async_sessionmaker(
            bind=task_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

        try:
            async with TaskSessionLocal() as db:
                from app.repos.message import MessageRepository

                msg_repo = MessageRepository(db)
                messages = await msg_repo.get_messages_by_topic(UUID(topic_id), limit=30)

                if not messages:
                    logger.debug("No messages found for topic %s, skipping extraction", topic_id)
                    return

                # ---- Heuristic gate ----
                if not _should_extract(messages):
                    logger.debug(
                        "Heuristic gate: skipping extraction for topic %s (trivial conversation)",
                        topic_id,
                    )
                    return

                # Convert to LangChain messages for langmem
                lc_messages: list[AnyMessage] = []
                for msg in messages:
                    content = msg.content or ""
                    if not content.strip():
                        continue
                    if msg.role == "user":
                        lc_messages.append(HumanMessage(content=content))
                    elif msg.role == "assistant":
                        lc_messages.append(AIMessage(content=content))

                if len(lc_messages) < 2:
                    logger.debug("Fewer than 2 messages for topic %s, skipping extraction", topic_id)
                    return

                # Resolve LLM via platform provider manager (same pattern as topic_rename)
                from app.core.providers import get_user_provider_manager
                from app.schemas.model_tier import get_memory_extraction_config

                extraction_model, extraction_provider = get_memory_extraction_config()
                user_pm = await get_user_provider_manager(user_id, db)
                llm = await user_pm.create_langchain_model(
                    provider_id=extraction_provider,
                    model=extraction_model,
                )

                # Use langmem's store manager for extraction + merge
                from langmem import create_memory_store_manager

                namespace = (configs.Memory.NamespacePrefix, "{langgraph_user_id}")
                manager = create_memory_store_manager(
                    llm,
                    namespace=namespace,
                    store=store,
                    enable_inserts=True,
                    enable_deletes=False,
                )

                manager_config = RunnableConfig(
                    configurable={
                        "langgraph_user_id": user_id,
                    }
                )
                await manager.ainvoke({"messages": lc_messages, "max_steps": 1}, config=manager_config)

                logger.info(
                    "Memory extraction completed: user=%s topic=%s messages=%d",
                    user_id,
                    topic_id,
                    len(lc_messages),
                )

                # ---- Core memory synthesis via langmem profile mode ----
                if configs.Memory.CoreMemory.Enabled:
                    await _synthesize_core_memory(store, user_id, lc_messages, llm)

                # ---- Mark topic as extracted ----
                await _mark_topic_extracted(db, UUID(topic_id))

        except Exception:
            logger.warning(
                "Memory extraction failed: user=%s topic=%s (non-fatal)",
                user_id,
                topic_id,
                exc_info=True,
            )
        finally:
            await task_engine.dispose()

    finally:
        if lock_acquired:
            try:
                await lock.release()
            except Exception:
                pass  # Lock may have expired; that's fine
        await redis_client.aclose()


async def _synthesize_core_memory(
    store: Any,
    user_id: str,
    lc_messages: list[Any],
    llm: Any,
) -> None:
    """Synthesize core memory profile updates from conversation.

    Uses langmem's create_memory_store_manager in profile mode:
    - schemas=[CoreMemoryBlock] for structured output
    - enable_inserts=False so it updates in-place, never appends
    - Namespace ("core_memory", "{langgraph_user_id}")

    Fails gracefully — never raises.
    """
    try:
        from langchain_core.runnables import RunnableConfig
        from langmem import create_memory_store_manager

        from app.configs import configs
        from app.core.memory.schemas import CoreMemoryBlock

        ns_prefix = configs.Memory.CoreMemory.NamespacePrefix
        namespace = (ns_prefix, "{langgraph_user_id}")

        profile_manager = create_memory_store_manager(
            llm,
            namespace=namespace,
            store=store,
            schemas=[CoreMemoryBlock],
            instructions=(
                "Extract and update the user's core profile from the conversation. "
                "Focus on: who they are (name, role, expertise), their preferences "
                "(communication style, tools, languages), current projects and goals, "
                "and any explicit rules or constraints they stated. "
                "Only update fields where the conversation reveals new or changed information."
            ),
            enable_inserts=False,
            enable_deletes=False,
        )

        profile_config = RunnableConfig(
            configurable={
                "langgraph_user_id": user_id,
            }
        )
        await profile_manager.ainvoke({"messages": lc_messages, "max_steps": 1}, config=profile_config)

        logger.info("Core memory synthesis completed for user %s", user_id)

    except Exception:
        logger.warning(
            "Core memory synthesis failed for user %s (non-fatal)",
            user_id,
            exc_info=True,
        )


async def _mark_topic_extracted(db: Any, topic_id: Any) -> None:
    """Set memory_extracted_at timestamp on a topic. Fails gracefully."""
    try:
        from datetime import datetime, timezone

        from sqlmodel import select

        from app.models.topic import Topic

        stmt = select(Topic).where(Topic.id == topic_id)
        result = await db.exec(stmt)
        topic = result.first()
        if topic:
            topic.memory_extracted_at = datetime.now(timezone.utc)
            db.add(topic)
            await db.commit()
    except Exception:
        logger.debug("Failed to mark topic %s as extracted (non-fatal)", topic_id, exc_info=True)


# ---------------------------------------------------------------------------
# Shared helper: run async coroutine in a fresh event loop (Celery pattern)
# ---------------------------------------------------------------------------


def _run_in_new_loop(coro: Any) -> None:
    """Run an async coroutine in a new event loop, then clean up."""
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        loop.run_until_complete(coro)
    finally:
        try:
            loop.run_until_complete(asyncio.sleep(0))
            pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
            if pending:
                _done, still_pending = loop.run_until_complete(asyncio.wait(pending, timeout=3.0))
                for task in still_pending:
                    task.cancel()
                if still_pending:
                    loop.run_until_complete(asyncio.gather(*still_pending, return_exceptions=True))
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.run_until_complete(loop.shutdown_default_executor())
        finally:
            asyncio.set_event_loop(None)
            loop.close()


# ---------------------------------------------------------------------------
# Daily catch-up extraction
# ---------------------------------------------------------------------------


@celery_app.task(name="daily_memory_catchup", ignore_result=True)
def daily_memory_catchup() -> None:
    """Find unextracted topics from the last 24 hours and run memory extraction.

    Uses a relaxed gate (1 user message with any content) to catch conversations
    that were skipped by the normal heuristic gate (which requires 2 messages +
    keyword/length signals).
    """
    _run_in_new_loop(_daily_memory_catchup_async())


async def _daily_memory_catchup_async() -> None:
    from datetime import datetime, timedelta, timezone

    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.configs import configs
    from app.core.memory.service import get_or_initialize_memory_service
    from app.infra.database import ASYNC_DATABASE_URL

    if not configs.Memory.Enabled or not configs.Memory.ScheduledTasks.DailyCatchupEnabled:
        logger.info("Daily memory catchup disabled, skipping")
        return

    sched = configs.Memory.ScheduledTasks

    # ---- Redis lock to prevent overlapping runs ----
    redis_client = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    lock = redis_client.lock("mem:daily_catchup", timeout=1800)  # 30 min TTL
    lock_acquired = False

    try:
        try:
            lock_acquired = await lock.acquire(blocking=False)
            if not lock_acquired:
                logger.info("Daily memory catchup already running, skipping")
                return
        except Exception:
            logger.warning("Redis lock unavailable for daily catchup, proceeding without lock")

        memory_svc = await get_or_initialize_memory_service()
        if not memory_svc.store:
            logger.info("Memory store not available, skipping daily catchup")
            return

        store = memory_svc.store
        since = datetime.now(timezone.utc) - timedelta(hours=24)

        task_engine = create_async_engine(
            ASYNC_DATABASE_URL,
            echo=False,
            pool_size=2,
            max_overflow=1,
        )
        TaskSessionLocal = async_sessionmaker(
            bind=task_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

        try:
            async with TaskSessionLocal() as db:
                from app.repos.message import MessageRepository
                from app.repos.topic import TopicRepository

                topic_repo = TopicRepository(db)
                msg_repo = MessageRepository(db)

                user_ids = await topic_repo.get_active_user_ids_since(since)
                logger.info("Daily catchup: found %d users with unextracted topics", len(user_ids))

                for user_id in user_ids:
                    try:
                        await _catchup_user(
                            db,
                            topic_repo,
                            msg_repo,
                            store,
                            user_id,
                            since,
                            sched,
                        )
                    except Exception:
                        logger.warning(
                            "Daily catchup failed for user %s (non-fatal)",
                            user_id,
                            exc_info=True,
                        )
        finally:
            await task_engine.dispose()

    finally:
        if lock_acquired:
            try:
                await lock.release()
            except Exception:
                pass
        await redis_client.aclose()

    logger.info("Daily memory catchup completed")


async def _catchup_user(
    db: Any,
    topic_repo: Any,
    msg_repo: Any,
    store: Any,
    user_id: str,
    since: Any,
    sched: Any,
) -> None:
    """Extract memories for a single user's unextracted topics."""
    from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
    from langchain_core.runnables import RunnableConfig

    from app.configs import configs

    topics = await topic_repo.get_unextracted_topics_since(
        user_id,
        since,
        limit=sched.DailyCatchupMaxTopicsPerUser,
    )
    if not topics:
        return

    # Collect messages across topics into one batch
    lc_messages: list[AnyMessage] = []
    processed_topic_ids: list[Any] = []

    for topic in topics:
        messages = await msg_repo.get_messages_by_topic(topic.id, limit=30)

        # Relaxed gate: at least 1 user message with content
        user_msgs = [m for m in messages if m.role == "user" and (m.content or "").strip()]
        if not user_msgs:
            processed_topic_ids.append(topic.id)  # Mark empty topics too
            continue

        for msg in messages:
            content = msg.content or ""
            if not content.strip():
                continue
            if msg.role == "user":
                lc_messages.append(HumanMessage(content=content))
            elif msg.role == "assistant":
                lc_messages.append(AIMessage(content=content))

        processed_topic_ids.append(topic.id)

        if len(lc_messages) >= sched.DailyCatchupMaxMessagesPerBatch:
            break

    if not lc_messages:
        # Still mark topics with no useful content as extracted
        for tid in processed_topic_ids:
            await _mark_topic_extracted(db, tid)
        return

    # Resolve LLM
    from app.core.providers import get_user_provider_manager
    from app.schemas.model_tier import get_memory_extraction_config

    extraction_model, extraction_provider = get_memory_extraction_config()
    user_pm = await get_user_provider_manager(user_id, db)
    llm = await user_pm.create_langchain_model(
        provider_id=extraction_provider,
        model=extraction_model,
    )

    # Run langmem extraction
    from langmem import create_memory_store_manager

    namespace = (configs.Memory.NamespacePrefix, "{langgraph_user_id}")
    manager = create_memory_store_manager(
        llm,
        namespace=namespace,
        store=store,
        enable_inserts=True,
        enable_deletes=False,
    )
    manager_config = RunnableConfig(configurable={"langgraph_user_id": user_id})
    await manager.ainvoke({"messages": lc_messages, "max_steps": 1}, config=manager_config)

    logger.info(
        "Daily catchup extraction: user=%s topics=%d messages=%d",
        user_id,
        len(processed_topic_ids),
        len(lc_messages),
    )

    # Core memory synthesis
    if configs.Memory.CoreMemory.Enabled:
        await _synthesize_core_memory(store, user_id, lc_messages, llm)

    # Mark all processed topics
    for tid in processed_topic_ids:
        await _mark_topic_extracted(db, tid)


# ---------------------------------------------------------------------------
# Weekly core memory resynthesis
# ---------------------------------------------------------------------------


@celery_app.task(name="weekly_core_memory_resynthesis", ignore_result=True)
def weekly_core_memory_resynthesis() -> None:
    """Re-synthesize core memory profiles from the full memory corpus.

    Ensures core memory stays comprehensive as memories accumulate over time,
    catching drift that individual per-conversation synthesis might miss.
    """
    _run_in_new_loop(_weekly_core_memory_resynthesis_async())


async def _weekly_core_memory_resynthesis_async() -> None:
    import redis.asyncio as aioredis

    from app.configs import configs
    from app.core.memory.service import get_or_initialize_memory_service

    if not configs.Memory.Enabled or not configs.Memory.ScheduledTasks.WeeklyResynthesisEnabled:
        logger.info("Weekly core memory resynthesis disabled, skipping")
        return

    if not configs.Memory.CoreMemory.Enabled:
        logger.info("Core memory disabled, skipping weekly resynthesis")
        return

    # ---- Redis lock ----
    redis_client = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    lock = redis_client.lock("mem:weekly_resynthesis", timeout=3600)  # 60 min TTL
    lock_acquired = False

    try:
        try:
            lock_acquired = await lock.acquire(blocking=False)
            if not lock_acquired:
                logger.info("Weekly resynthesis already running, skipping")
                return
        except Exception:
            logger.warning("Redis lock unavailable for weekly resynthesis, proceeding without lock")

        memory_svc = await get_or_initialize_memory_service()
        if not memory_svc.store:
            logger.info("Memory store not available, skipping weekly resynthesis")
            return

        store = memory_svc.store

        user_ids = await memory_svc.get_user_ids_with_memories()
        logger.info("Weekly resynthesis: found %d users with memories", len(user_ids))

        for user_id in user_ids:
            try:
                await _resynthesize_user_core_memory(memory_svc, store, user_id)
            except Exception:
                logger.warning(
                    "Weekly resynthesis failed for user %s (non-fatal)",
                    user_id,
                    exc_info=True,
                )

    finally:
        if lock_acquired:
            try:
                await lock.release()
            except Exception:
                pass
        await redis_client.aclose()

    logger.info("Weekly core memory resynthesis completed")


async def _resynthesize_user_core_memory(
    memory_svc: Any,
    store: Any,
    user_id: str,
) -> None:
    """Re-synthesize core memory for a single user from their full memory corpus."""
    from langchain_core.messages import AnyMessage, HumanMessage
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.infra.database import ASYNC_DATABASE_URL

    # Fetch all memories
    all_memories = await memory_svc.list_all_memories(user_id)
    if not all_memories:
        logger.debug("No memories for user %s, skipping resynthesis", user_id)
        return

    # Format memories as synthetic messages for langmem profile mode
    # Present the full corpus as a single "conversation" for the profile manager
    memory_text = "\n".join(f"- {m}" for m in all_memories)
    synthetic_messages: list[AnyMessage] = [
        HumanMessage(
            content=(f"Here is a summary of everything known about the user from past conversations:\n\n{memory_text}")
        ),
    ]

    # Resolve LLM (use a system-level provider since this isn't per-conversation)
    task_engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=False,
        pool_size=1,
        max_overflow=1,
    )
    TaskSessionLocal = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    try:
        async with TaskSessionLocal() as db:
            from app.core.providers import get_user_provider_manager
            from app.schemas.model_tier import get_memory_extraction_config

            extraction_model, extraction_provider = get_memory_extraction_config()
            user_pm = await get_user_provider_manager(user_id, db)
            llm = await user_pm.create_langchain_model(
                provider_id=extraction_provider,
                model=extraction_model,
            )

            await _synthesize_core_memory(store, user_id, synthetic_messages, llm)

            logger.info(
                "Weekly resynthesis completed: user=%s memories=%d",
                user_id,
                len(all_memories),
            )
    finally:
        await task_engine.dispose()
