"""ConsumptionTrackingService — records LLM usage and tool calls to DB.

Each LLM API call and tool invocation is immediately persisted as a
ConsumeRecord so that consumption data survives crashes and can be audited.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.consume import ConsumeRecord

from .context import get_tracking_context
from .pricing import TIER_MODEL_CONSUMPTION_RATE, calculate_llm_cost_usd, calculate_llm_credits

from app.schemas.model_tier import ModelTier

logger = logging.getLogger(__name__)


class ConsumptionTrackingService:
    """Persists fine-grained consumption events to the database."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # LLM usage
    # ------------------------------------------------------------------

    async def record_llm_usage(
        self,
        user_id: str,
        auth_provider: str,
        model_name: str,
        model_tier: str | None,
        provider: str | None,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        amount: int = 0,
        cost_usd: float = 0.0,
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
        """Record one LLM API call as a ConsumeRecord. Writes immediately (flush, no commit)."""
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
            "Recorded LLM usage: user=%s model=%s source=%s tokens=%d/%d/%d amount=%d",
            user_id,
            model_name,
            source,
            input_tokens,
            output_tokens,
            total_tokens,
            amount,
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
# Convenience: record LLM usage from tracking context (for tools/subagents)
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
        tier_rate = TIER_MODEL_CONSUMPTION_RATE.get(ModelTier(ctx.model_tier), 1.0) if ctx.model_tier else 1.0
        amount = calculate_llm_credits(
            input_tokens,
            output_tokens,
            tier_rate,
            cache_read_input_tokens=cache_read_input_tokens,
        )
        cost_usd_val = await calculate_llm_cost_usd(
            model_name,
            input_tokens,
            output_tokens,
            cache_read_input_tokens=cache_read_input_tokens,
            provider=provider,
        )

        async with ctx.db_session_factory() as db:
            service = ConsumptionTrackingService(db)
            record = await service.record_llm_usage(
                user_id=ctx.user_id,
                auth_provider=ctx.auth_provider,
                model_name=model_name,
                model_tier=ctx.model_tier,
                provider=provider,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                amount=amount,
                cost_usd=cost_usd_val,
                source=source,
                session_id=ctx.session_id,
                topic_id=ctx.topic_id,
                message_id=ctx.message_id,
                cache_creation_input_tokens=cache_creation_input_tokens,
                cache_read_input_tokens=cache_read_input_tokens,
            )
            await db.commit()
            return record
    except Exception:
        logger.warning("Failed to record LLM usage from context (source=%s)", source, exc_info=True)
        return None


async def record_messages_usage_from_context(
    messages: list[Any],
    source: str,
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
        provider=None,
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
