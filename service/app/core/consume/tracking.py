"""ConsumptionTrackingService — records LLM usage and tool calls to DB.

Each LLM API call and tool invocation is immediately persisted to the
database so that consumption data survives crashes and can be audited.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.consume import DailyConsumeSummary, LLMUsageRecord, ToolCallRecord

from .context import get_tracking_context

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
    ) -> LLMUsageRecord:
        """Record one LLM API call. Writes immediately (flush, no commit)."""
        record = LLMUsageRecord(
            user_id=user_id,
            session_id=session_id,
            topic_id=topic_id,
            message_id=message_id,
            model_name=model_name,
            model_tier=model_tier,
            provider=provider,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cache_creation_input_tokens=cache_creation_input_tokens,
            cache_read_input_tokens=cache_read_input_tokens,
            source=source,
        )
        self.db.add(record)
        await self.db.flush()
        logger.info(
            "Recorded LLM usage: user=%s model=%s source=%s tokens=%d/%d/%d",
            user_id,
            model_name,
            source,
            input_tokens,
            output_tokens,
            total_tokens,
        )
        return record

    # ------------------------------------------------------------------
    # Tool calls
    # ------------------------------------------------------------------

    async def record_tool_call(
        self,
        user_id: str,
        tool_name: str,
        tool_call_id: str | None = None,
        status: str = "success",
        model_tier: str | None = None,
        session_id: UUID | None = None,
        topic_id: UUID | None = None,
        message_id: UUID | None = None,
    ) -> ToolCallRecord:
        """Record one tool invocation. Writes immediately (flush, no commit)."""
        record = ToolCallRecord(
            user_id=user_id,
            session_id=session_id,
            topic_id=topic_id,
            message_id=message_id,
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            status=status,
            model_tier=model_tier,
        )
        self.db.add(record)
        await self.db.flush()
        logger.info("Recorded tool call: user=%s tool=%s status=%s", user_id, tool_name, status)
        return record

    # ------------------------------------------------------------------
    # Batch tool calls (accumulated in memory, flushed at settlement)
    # ------------------------------------------------------------------

    async def record_tool_calls_batch(
        self,
        records: list[ToolCallRecord],
    ) -> None:
        """Batch-insert tool call records (for performance)."""
        if not records:
            return
        for r in records:
            self.db.add(r)
        await self.db.flush()
        logger.info("Batch-recorded %d tool call records", len(records))

    # ------------------------------------------------------------------
    # Daily summary upsert
    # ------------------------------------------------------------------

    async def upsert_daily_summary(
        self,
        user_id: str,
        date_str: str,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        credits: int,
        llm_calls: int,
        tool_calls: int,
        cost_cents: int = 0,
        model_tier: str | None = None,
        model_name: str | None = None,
        tz: str = "Asia/Shanghai",
    ) -> None:
        """Upsert the DailyConsumeSummary row for the given user+date.

        Uses SELECT-then-UPDATE/INSERT pattern (safe within a single transaction).
        """
        from sqlmodel import select

        stmt = select(DailyConsumeSummary).where(
            DailyConsumeSummary.user_id == user_id,
            DailyConsumeSummary.date == date_str,
        )
        result = await self.db.exec(stmt)
        summary = result.one_or_none()

        if summary is None:
            by_tier: dict[str, Any] = {}
            by_model: dict[str, Any] = {}
            if model_tier:
                by_tier[model_tier] = {
                    "tokens": total_tokens,
                    "credits": credits,
                    "cost_cents": cost_cents,
                    "count": llm_calls,
                }
            if model_name:
                by_model[model_name] = {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cost_cents": cost_cents,
                    "count": llm_calls,
                }
            summary = DailyConsumeSummary(
                user_id=user_id,
                date=date_str,
                tz=tz,
                total_input_tokens=input_tokens,
                total_output_tokens=output_tokens,
                total_tokens=total_tokens,
                total_credits=credits,
                llm_call_count=llm_calls,
                tool_call_count=tool_calls,
                total_cost_cents=cost_cents,
                by_tier=by_tier or None,
                by_model=by_model or None,
            )
            self.db.add(summary)
            try:
                async with self.db.begin_nested():
                    await self.db.flush()
            except IntegrityError:
                # Another transaction inserted first — only the savepoint
                # rolled back; earlier flushes in this transaction survive.
                result = await self.db.exec(stmt)
                summary = result.one()
                self._merge_into_summary(
                    summary,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    credits=credits,
                    llm_calls=llm_calls,
                    tool_calls=tool_calls,
                    cost_cents=cost_cents,
                    model_tier=model_tier,
                    model_name=model_name,
                )
                self.db.add(summary)
                await self.db.flush()
        else:
            self._merge_into_summary(
                summary,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                credits=credits,
                llm_calls=llm_calls,
                tool_calls=tool_calls,
                cost_cents=cost_cents,
                model_tier=model_tier,
                model_name=model_name,
            )
            self.db.add(summary)
            await self.db.flush()
        logger.debug("Upserted daily summary: user=%s date=%s", user_id, date_str)

    def _merge_into_summary(
        self,
        summary: DailyConsumeSummary,
        *,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        credits: int,
        llm_calls: int,
        tool_calls: int,
        cost_cents: int,
        model_tier: str | None,
        model_name: str | None,
    ) -> None:
        """Merge incremental usage into an existing DailyConsumeSummary row."""
        summary.total_input_tokens += input_tokens
        summary.total_output_tokens += output_tokens
        summary.total_tokens += total_tokens
        summary.total_credits += credits
        summary.llm_call_count += llm_calls
        summary.tool_call_count += tool_calls
        summary.total_cost_cents += cost_cents
        summary.updated_at = datetime.now(timezone.utc)

        if model_tier:
            tier_data = summary.by_tier or {}
            if model_tier in tier_data:
                tier_data[model_tier]["tokens"] = tier_data[model_tier].get("tokens", 0) + total_tokens
                tier_data[model_tier]["credits"] = tier_data[model_tier].get("credits", 0) + credits
                tier_data[model_tier]["cost_cents"] = tier_data[model_tier].get("cost_cents", 0) + cost_cents
                tier_data[model_tier]["count"] = tier_data[model_tier].get("count", 0) + llm_calls
            else:
                tier_data[model_tier] = {
                    "tokens": total_tokens,
                    "credits": credits,
                    "cost_cents": cost_cents,
                    "count": llm_calls,
                }
            summary.by_tier = tier_data

        if model_name:
            model_data = summary.by_model or {}
            if model_name in model_data:
                model_data[model_name]["input_tokens"] = model_data[model_name].get("input_tokens", 0) + input_tokens
                model_data[model_name]["output_tokens"] = model_data[model_name].get("output_tokens", 0) + output_tokens
                model_data[model_name]["cost_cents"] = model_data[model_name].get("cost_cents", 0) + cost_cents
                model_data[model_name]["count"] = model_data[model_name].get("count", 0) + llm_calls
            else:
                model_data[model_name] = {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cost_cents": cost_cents,
                    "count": llm_calls,
                }
            summary.by_model = model_data


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
) -> LLMUsageRecord | None:
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
            record = await service.record_llm_usage(
                user_id=ctx.user_id,
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
            )
            await db.commit()
            return record
    except Exception:
        logger.warning("Failed to record LLM usage from context (source=%s)", source, exc_info=True)
        return None


async def record_messages_usage_from_context(
    messages: list[Any],
    source: str,
) -> LLMUsageRecord | None:
    """Sum usage_metadata across LangChain messages and record as a single entry.

    Designed for the subagent/delegation pattern where a graph run produces
    a list of messages each carrying ``usage_metadata`` and ``response_metadata``.

    Returns the record if successful, or None on failure / no tokens.
    """
    total_input = 0
    total_output = 0
    total_total = 0
    model_name = "unknown"

    for msg in messages:
        usage = getattr(msg, "usage_metadata", None)
        if usage and isinstance(usage, dict):
            total_input += usage.get("input_tokens", 0)
            total_output += usage.get("output_tokens", 0)
            total_total += usage.get("total_tokens", 0)
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
    )


async def record_response_usage_from_context(
    response: Any,
    source: str,
    model_name: str,
    provider: str | None,
) -> LLMUsageRecord | None:
    """Extract usage_metadata from a single LLM response and record.

    Designed for the single-response pattern (image tools, model_selector,
    topic_generator) where one ``response`` object carries ``usage_metadata``.

    Returns the record if successful, or None on failure / no tokens.
    """
    usage = getattr(response, "usage_metadata", None)
    if not usage or not isinstance(usage, dict):
        return None

    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    total_tokens = usage.get("total_tokens", 0)

    if input_tokens == 0 and output_tokens == 0:
        return None

    return await record_llm_usage_from_context(
        model_name=model_name,
        provider=provider,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens if total_tokens else input_tokens + output_tokens,
        source=source,
    )
