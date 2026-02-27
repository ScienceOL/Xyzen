"""ConsumeRecord service — tracking, settlement, and queries.

Merges the former ``service.py`` (ConsumeService + settle_chat_records) and
``tracking.py`` (ConsumptionTrackingService + ContextVar helpers + convenience
record_*_from_context functions) into a single module.

Each LLM API call and tool invocation is immediately persisted as a
ConsumeRecord so that consumption data survives crashes and can be audited.

Also contains the ContextVar-based TrackingContext that is set once at the
start of a Celery chat task, then read by tool implementations (image,
subagent, delegation, topic_generator, model_selector) to obtain the
user/session/topic/message_id and a DB session factory without explicit
parameter passing.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.consume import ConsumeRecord, UserConsumeSummary
from app.repos.consume import ConsumeRepository
from app.repos.redemption import RedemptionRepository

from app.schemas.model_tier import ModelTier

from .pricing import TIER_MODEL_CONSUMPTION_RATE, calculate_llm_cost_usd, calculate_llm_credits

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# TrackingContext dataclass + ContextVar helpers
# ---------------------------------------------------------------------------


@dataclass
class TrackingContext:
    """Tracking context for the current chat task.

    Most fields are set once at task start, but ``message_id`` is mutable —
    it is set to ``None`` initially and updated after the AI message is created.
    """

    user_id: str
    auth_provider: str
    session_id: UUID | None
    topic_id: UUID | None
    message_id: UUID | None
    model_tier: str | None
    db_session_factory: Any  # async_sessionmaker
    agent_id: UUID | None = None
    marketplace_id: UUID | None = None
    developer_user_id: str | None = None


_tracking_ctx: ContextVar[TrackingContext | None] = ContextVar("tracking_ctx", default=None)


def set_tracking_context(ctx: TrackingContext) -> None:
    """Set the tracking context for the current task."""
    _tracking_ctx.set(ctx)


def get_tracking_context() -> TrackingContext | None:
    """Get the tracking context, or None if not in a tracked task."""
    return _tracking_ctx.get()


def clear_tracking_context() -> None:
    """Clear the tracking context."""
    _tracking_ctx.set(None)


# ---------------------------------------------------------------------------
# ConsumptionTrackingService
# ---------------------------------------------------------------------------


class ConsumptionTrackingService:
    """Persists fine-grained consumption events to the database."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # LLM usage
    # ------------------------------------------------------------------

    async def record_llm_usage_with_pricing(
        self,
        user_id: str,
        auth_provider: str,
        model_name: str,
        model_tier: str | None,
        provider: str | None,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        source: str = "chat",
        session_id: UUID | None = None,
        topic_id: UUID | None = None,
        message_id: UUID | None = None,
        cache_creation_input_tokens: int = 0,
        cache_read_input_tokens: int = 0,
        agent_id: UUID | None = None,
        marketplace_id: UUID | None = None,
        developer_user_id: str | None = None,
    ) -> ConsumeRecord:
        """Calculate pricing and persist LLM usage as a ConsumeRecord.

        Computes *amount* (credits) and *cost_usd* from token counts and tier,
        then writes immediately (flush, no commit).
        """
        tier_enum: ModelTier | None = None
        if model_tier:
            try:
                tier_enum = ModelTier(model_tier)
            except ValueError:
                pass
        tier_rate = TIER_MODEL_CONSUMPTION_RATE.get(tier_enum, 1.0) if tier_enum else 1.0
        amount = calculate_llm_credits(
            input_tokens,
            output_tokens,
            tier_rate,
            cache_read_input_tokens=cache_read_input_tokens,
        )
        cost_usd = await calculate_llm_cost_usd(
            model_name,
            input_tokens,
            output_tokens,
            cache_read_input_tokens=cache_read_input_tokens,
            provider=provider,
        )
        record = ConsumeRecord(
            record_type="llm",
            user_id=user_id,
            auth_provider=auth_provider,
            session_id=session_id,
            topic_id=topic_id,
            message_id=message_id,
            amount=amount,
            cost_usd=cost_usd,
            consume_state="pending",
            model_name=model_name,
            model_tier=model_tier,
            provider=provider,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cache_creation_input_tokens=cache_creation_input_tokens,
            cache_read_input_tokens=cache_read_input_tokens,
            source=source,
            agent_id=agent_id,
            marketplace_id=marketplace_id,
            developer_user_id=developer_user_id,
        )
        self.db.add(record)
        await self.db.flush()
        logger.info(
            "Recorded LLM usage: user=%s model=%s source=%s tokens=%d/%d/%d amount=%d cost_usd=%.6f",
            user_id,
            model_name,
            source,
            input_tokens,
            output_tokens,
            total_tokens,
            amount,
            cost_usd,
        )
        return record

    # ------------------------------------------------------------------
    # Tool calls
    # ------------------------------------------------------------------

    async def record_tool_call(
        self,
        user_id: str,
        auth_provider: str,
        tool_name: str,
        amount: int = 0,
        cost_usd: float = 0.0,
        tool_call_id: str | None = None,
        status: str = "success",
        model_tier: str | None = None,
        session_id: UUID | None = None,
        topic_id: UUID | None = None,
        message_id: UUID | None = None,
        agent_id: UUID | None = None,
        marketplace_id: UUID | None = None,
        developer_user_id: str | None = None,
        source: str = "chat",
    ) -> ConsumeRecord:
        """Record one tool invocation as a ConsumeRecord. Writes immediately (flush, no commit)."""
        record = ConsumeRecord(
            record_type="tool_call",
            user_id=user_id,
            auth_provider=auth_provider,
            session_id=session_id,
            topic_id=topic_id,
            message_id=message_id,
            amount=amount,
            cost_usd=cost_usd,
            consume_state="pending",
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            status=status,
            model_tier=model_tier,
            agent_id=agent_id,
            marketplace_id=marketplace_id,
            developer_user_id=developer_user_id,
            source=source,
        )
        self.db.add(record)
        await self.db.flush()
        logger.info("Recorded tool call: user=%s tool=%s status=%s amount=%d", user_id, tool_name, status, amount)
        return record

    # ------------------------------------------------------------------
    # Batch tool calls
    # ------------------------------------------------------------------

    async def record_tool_calls_batch(
        self,
        records: list[ConsumeRecord],
    ) -> None:
        """Batch-insert ConsumeRecord tool call records (for performance)."""
        if not records:
            return
        for r in records:
            self.db.add(r)
        await self.db.flush()
        logger.info("Batch-recorded %d tool call records", len(records))


# ---------------------------------------------------------------------------
# ConsumeService
# ---------------------------------------------------------------------------


class ConsumeService:
    """Core business logic layer for consumption service"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.consume_repo = ConsumeRepository(db)
        self.redemption_repo = RedemptionRepository(db)

    async def get_consume_record_by_id(self, record_id: UUID) -> ConsumeRecord | None:
        """Get consumption record"""
        return await self.consume_repo.get_consume_record_by_id(record_id)

    async def get_user_consume_summary(self, user_id: str) -> UserConsumeSummary | None:
        """Get user consumption summary"""
        return await self.consume_repo.get_user_consume_summary(user_id)

    async def list_user_consume_records(self, user_id: str, limit: int = 100, offset: int = 0) -> list[ConsumeRecord]:
        """Get user consumption record list"""
        return await self.consume_repo.list_consume_records_by_user(user_id, limit, offset)


# ---------------------------------------------------------------------------
# settle_chat_records
# ---------------------------------------------------------------------------


async def settle_chat_records(
    db: AsyncSession,
    user_id: str,
    auth_provider: str,
    record_ids: list[UUID],
    total_amount: int,
    *,
    marketplace_id: UUID | None = None,
    developer_user_id: str | None = None,
    session_id: UUID | None = None,
    topic_id: UUID | None = None,
    message_id: UUID | None = None,
) -> None:
    """Settle pending ConsumeRecords: deduct from wallet (best-effort), update
    UserConsumeSummary, bulk-mark records as success, and process developer rewards.

    When the wallet balance is insufficient the function deducts as much as
    possible instead of raising an error — the conversation is never
    interrupted at settlement time.

    Args:
        db: Database session.
        user_id: User ID.
        auth_provider: Authentication provider.
        record_ids: IDs of pending ConsumeRecords to settle.
        total_amount: Total credit amount to deduct (sum of record amounts).
        marketplace_id: Marketplace listing ID for developer reward attribution.
        developer_user_id: Developer user ID for reward attribution.
        session_id: Session ID for reward context.
        topic_id: Topic ID for reward context.
        message_id: Message ID for reward context.
    """
    if total_amount <= 0:
        # Nothing to bill — still mark records as success
        repo = ConsumeRepository(db)
        if record_ids:
            await repo.bulk_update_consume_state(record_ids, "success")
        return

    repo = ConsumeRepository(db)
    redemption_repo = RedemptionRepository(db)

    # Check virtual balance (get_or_create ensures new users receive welcome bonus)
    wallet = await redemption_repo.get_or_create_user_wallet(user_id)
    virtual_balance = wallet.virtual_balance

    # Best-effort: deduct as much as possible
    deduct_target = min(total_amount, max(0, virtual_balance))

    if virtual_balance < total_amount:
        logger.warning(
            "Best-effort settlement for user %s: needed=%d, available=%d, deducting=%d",
            user_id,
            total_amount,
            virtual_balance,
            deduct_target,
        )

    if deduct_target > 0:
        wallet, actual_amount = await redemption_repo.deduct_wallet_ordered(
            user_id,
            deduct_target,
            "chat_settlement",
            reference_id=str(message_id) if message_id else None,
        )
    else:
        actual_amount = 0

    # Update user consumption summary with the actual amount deducted
    await repo.increment_user_consume(
        user_id=user_id,
        auth_provider=auth_provider,
        amount=actual_amount,
        consume_state="success",
    )

    # Bulk mark records as success
    if record_ids:
        await repo.bulk_update_consume_state(record_ids, "success")

    # Developer reward: share a portion of actual_amount with the marketplace developer
    if marketplace_id and developer_user_id and actual_amount > 0:
        try:
            from app.core.consume.developer_reward import DeveloperRewardService

            reward_service = DeveloperRewardService(db)
            await reward_service.process_reward(
                developer_user_id=developer_user_id,
                consumer_user_id=user_id,
                marketplace_id=marketplace_id,
                session_id=session_id,
                topic_id=topic_id,
                message_id=message_id,
                total_consumed=actual_amount,
            )
        except Exception:
            logger.warning(
                "Developer reward processing failed (non-fatal): marketplace=%s developer=%s",
                marketplace_id,
                developer_user_id,
                exc_info=True,
            )

    # Broadcast wallet update after settlement
    if actual_amount > 0:
        try:
            from app.core.user_events import broadcast_wallet_update

            settled_wallet = await redemption_repo.get_user_wallet(user_id)
            if settled_wallet:
                await broadcast_wallet_update(settled_wallet)
        except Exception:
            logger.debug("Failed to broadcast wallet update after settlement", exc_info=True)


# ---------------------------------------------------------------------------
# Convenience: record LLM usage from tracking context
#
# The main streaming loop (chat.py → handle_token_usage) only captures
# TOKEN_USAGE events from the *parent* agent's LLM calls.  Several tools
# make **independent** LLM invocations that bypass the stream entirely:
#
#   • subagent   – graph.ainvoke()   → record_messages_usage_from_context
#   • delegation – graph.ainvoke()   → record_messages_usage_from_context
#   • image gen  – llm.ainvoke()     → record_response_usage_from_context
#   • read_image – llm.ainvoke()     → record_response_usage_from_context
#
# These helpers are the *only* mechanism that captures those costs.
# ---------------------------------------------------------------------------


async def record_llm_usage_from_context(
    *,
    model_name: str,
    provider: str | None,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int,
    source: str,
    cache_creation_input_tokens: int = 0,
    cache_read_input_tokens: int = 0,
) -> ConsumeRecord | None:
    """Record LLM usage using the current tracking context (ContextVar).

    Returns the record if successful, or None if no context is available.
    Failures are logged but never raised — consumption tracking must not
    break the chat flow.
    """
    ctx = get_tracking_context()
    if ctx is None:
        logger.debug("No tracking context available for source=%s, skipping LLM usage recording", source)
        return None

    try:
        async with ctx.db_session_factory() as db:
            service = ConsumptionTrackingService(db)
            record = await service.record_llm_usage_with_pricing(
                user_id=ctx.user_id,
                auth_provider=ctx.auth_provider,
                model_name=model_name,
                model_tier=ctx.model_tier,
                provider=provider,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                source=source,
                session_id=ctx.session_id,
                topic_id=ctx.topic_id,
                message_id=ctx.message_id,
                cache_creation_input_tokens=cache_creation_input_tokens,
                cache_read_input_tokens=cache_read_input_tokens,
                agent_id=ctx.agent_id,
                marketplace_id=ctx.marketplace_id,
                developer_user_id=ctx.developer_user_id,
            )
            await db.commit()
            return record
    except Exception:
        logger.warning("Failed to record LLM usage from context (source=%s)", source, exc_info=True)
        return None


async def record_messages_usage_from_context(
    messages: list[Any],
    source: str,
    provider: str | None = None,
) -> ConsumeRecord | None:
    """Sum usage_metadata across LangChain messages and record as a single entry."""
    total_input = 0
    total_output = 0
    total_total = 0
    total_cache_creation = 0
    total_cache_read = 0
    model_name = "unknown"

    for msg in messages:
        usage = getattr(msg, "usage_metadata", None)
        if usage and isinstance(usage, dict):
            total_input += usage.get("input_tokens", 0)
            total_output += usage.get("output_tokens", 0)
            total_total += usage.get("total_tokens", 0)
            details = usage.get("input_token_details") or {}
            total_cache_creation += details.get("cache_creation", 0) or 0
            total_cache_read += details.get("cache_read", 0) or 0
        resp_meta = getattr(msg, "response_metadata", None)
        if resp_meta and isinstance(resp_meta, dict):
            m = resp_meta.get("model_name") or resp_meta.get("model")
            if m:
                model_name = m

    if total_input == 0 and total_output == 0:
        return None

    return await record_llm_usage_from_context(
        model_name=model_name,
        provider=provider,
        input_tokens=total_input,
        output_tokens=total_output,
        total_tokens=total_total if total_total else total_input + total_output,
        source=source,
        cache_creation_input_tokens=total_cache_creation,
        cache_read_input_tokens=total_cache_read,
    )


async def record_response_usage_from_context(
    response: Any,
    source: str,
    model_name: str,
    provider: str | None,
) -> ConsumeRecord | None:
    """Extract usage_metadata from a single LLM response and record."""
    usage = getattr(response, "usage_metadata", None)
    if not usage or not isinstance(usage, dict):
        return None

    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    total_tokens = usage.get("total_tokens", 0)

    details = usage.get("input_token_details") or {}
    cache_creation = details.get("cache_creation", 0) or 0
    cache_read = details.get("cache_read", 0) or 0

    if input_tokens == 0 and output_tokens == 0:
        return None

    return await record_llm_usage_from_context(
        model_name=model_name,
        provider=provider,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens if total_tokens else input_tokens + output_tokens,
        source=source,
        cache_creation_input_tokens=cache_creation,
        cache_read_input_tokens=cache_read,
    )
