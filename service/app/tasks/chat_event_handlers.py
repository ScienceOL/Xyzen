"""
Extracted event handlers for the chat task processing loop.

Each handler corresponds to a ChatEventType and operates on a shared
ChatTaskContext dataclass that holds all mutable state for a single
chat task execution.
"""

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCode, ErrCodeError
from app.core.chat.token_usage import normalize_token_usage
from app.core.consume.pricing import (
    TIER_MODEL_CONSUMPTION_RATE,
    calculate_llm_cost_usd,
    calculate_llm_credits,
    calculate_settlement_total,
    calculate_tool_cost,
)
from app.core.consume.service import settle_chat_records
from app.core.consume.tracking import ConsumptionTrackingService
from app.models.agent_run import AgentRunCreate
from app.models.citation import CitationCreate
from app.models.message import Message, MessageCreate
from app.repos import AgentRunRepository, CitationRepository, FileRepository, MessageRepository, TopicRepository
from app.repos.consume import ConsumeRepository
from app.repos.session import SessionRepository
from app.schemas.chat_event_payloads import CitationData
from app.schemas.chat_event_types import ChatEventType

logger = logging.getLogger(__name__)

# Incremental save interval: periodically flush partial content to DB during streaming
INCREMENTAL_SAVE_INTERVAL = 3.0  # seconds


# ---------------------------------------------------------------------------
# ChatTaskContext - mutable state bag for a single chat task execution
# ---------------------------------------------------------------------------


@dataclass
class ChatTaskContext:
    """Mutable state bag for a single chat task execution."""

    publisher: Any  # RedisPublisher - use Any to avoid circular import
    db: AsyncSession
    topic_id: UUID
    session_id: UUID
    user_id: str
    auth_provider: str
    stream_id: str | None
    message_repo: MessageRepository
    topic_repo: TopicRepository

    # Message tracking
    ai_message_obj: Message | None = None
    active_stream_id: str | None = None
    full_content: str = ""
    full_thinking_content: str = ""

    # Agent tracking
    agent_run_id: UUID | None = None
    agent_run_start_time: float | None = None
    active_node_id: str | None = None
    tool_calls_by_node: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    tool_call_data: dict[str, dict[str, Any]] = field(default_factory=dict)
    agent_name: str = ""
    agent_avatar: str = ""

    # Token tracking
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0

    # Misc
    citations_data: list[CitationData] = field(default_factory=list)
    generated_files_count: int = 0
    last_save_time: float = field(default_factory=time.time)
    is_aborted: bool = False
    error_handled: bool = False
    should_break: bool = False
    interrupted: bool = False  # Set when ask_user_question interrupt is detected

    # Cached session info (loaded once, reused by handle_token_usage & finalize_and_settle)
    session_info_loaded: bool = False
    cached_model_tier: Any = None  # ModelTier enum or None
    cached_model_name: str | None = None
    cached_provider_id: str | None = None

    # Developer reward attribution (resolved from agent.original_source_id at task start)
    agent_id_for_attribution: UUID | None = None
    marketplace_id: UUID | None = None
    developer_user_id: str | None = None


# ---------------------------------------------------------------------------
# Helper: extract_content_text (re-exported so chat.py can still import it)
# ---------------------------------------------------------------------------


def extract_content_text(content: Any) -> str:
    """Extract plain text from various content formats."""
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


# ---------------------------------------------------------------------------
# Helper: send_message_saved
# ---------------------------------------------------------------------------


async def send_message_saved(ctx: ChatTaskContext) -> None:
    """Publish MESSAGE_SAVED event with stream_id, db_id, created_at."""
    if ctx.ai_message_obj and ctx.active_stream_id:
        await ctx.publisher.publish(
            json.dumps(
                {
                    "type": ChatEventType.MESSAGE_SAVED,
                    "data": {
                        "stream_id": ctx.active_stream_id,
                        "db_id": str(ctx.ai_message_obj.id),
                        "created_at": ctx.ai_message_obj.created_at.isoformat()
                        if ctx.ai_message_obj.created_at
                        else None,
                    },
                }
            )
        )


# ---------------------------------------------------------------------------
# Helper: _ensure_session_info (cached session query)
# ---------------------------------------------------------------------------


async def _ensure_session_info(ctx: ChatTaskContext) -> None:
    """Load session info once and cache on *ctx*."""
    if ctx.session_info_loaded:
        return

    session_repo = SessionRepository(ctx.db)
    session = await session_repo.get_session_by_id(ctx.session_id)

    if session and not session.model_tier:
        from app.core.session.service import SessionService

        svc = SessionService(ctx.db)
        await svc.clamp_session_model_tier(session, ctx.user_id)

    ctx.cached_model_tier = session.model_tier if session else None
    ctx.cached_model_name = session.model if session else None
    ctx.cached_provider_id = str(session.provider_id) if session and session.provider_id else None
    ctx.session_info_loaded = True

    # Propagate model_tier to TrackingContext for auxiliary recording
    from app.core.consume.context import get_tracking_context

    tracking_ctx = get_tracking_context()
    if tracking_ctx is not None:
        tracking_ctx.model_tier = ctx.cached_model_tier.value if ctx.cached_model_tier else None


# ---------------------------------------------------------------------------
# Helper: finalize_and_settle
# ---------------------------------------------------------------------------


async def finalize_and_settle(
    ctx: ChatTaskContext,
    pre_deducted_amount: float,
    access_token: str | None,
    description_suffix: str = "settlement",
) -> None:
    """Consolidate settlement: query pending ConsumeRecords, sum amounts,
    deduct from wallet via settle_chat_records, and bulk-mark as success.
    """
    if not ctx.ai_message_obj:
        return

    try:
        # Query all pending records for this message
        repo = ConsumeRepository(ctx.db)
        records = await repo.list_records_for_settlement(ctx.session_id, ctx.topic_id, ctx.ai_message_obj.id)
        if not records:
            return

        record_ids = [r.id for r in records]
        record_amounts_sum = sum(r.amount for r in records)

        # Total = sum of individual record amounts
        total_cost = calculate_settlement_total(record_amounts_sum, 1.0)

        remaining_amount = total_cost - pre_deducted_amount

        if remaining_amount > 0:
            await settle_chat_records(
                db=ctx.db,
                user_id=ctx.user_id,
                auth_provider=ctx.auth_provider,
                record_ids=record_ids,
                total_amount=int(remaining_amount),
                marketplace_id=ctx.marketplace_id,
                developer_user_id=ctx.developer_user_id,
                session_id=ctx.session_id,
                topic_id=ctx.topic_id,
                message_id=ctx.ai_message_obj.id if ctx.ai_message_obj else None,
            )
        elif record_ids:
            # No billing needed but still mark records as success
            await repo.bulk_update_consume_state(record_ids, "success")

    except Exception as e:
        logger.error(f"Settlement failed ({description_suffix}): {e}")
        raise


# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------


async def handle_streaming_start(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    ctx.active_stream_id = stream_event["data"]["stream_id"]
    ctx.agent_run_start_time = time.time()
    if not ctx.ai_message_obj:
        ai_message_create = MessageCreate(role="assistant", content="", topic_id=ctx.topic_id)
        ctx.ai_message_obj = await ctx.message_repo.create_message(ai_message_create)

        # Update tracking context with the message_id for tool/subagent usage recording
        from app.core.consume.context import get_tracking_context

        tracking_ctx = get_tracking_context()
        if tracking_ctx is not None:
            tracking_ctx.message_id = ctx.ai_message_obj.id

    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_streaming_chunk(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    if not ctx.active_stream_id:
        return

    chunk_content = stream_event["data"]["content"]
    text_content = extract_content_text(chunk_content)
    ctx.full_content += text_content
    stream_event["data"]["content"] = text_content
    await ctx.publisher.publish(json.dumps(stream_event))

    # Incremental save: periodically update DB with partial content
    current_time = time.time()
    if ctx.ai_message_obj and (current_time - ctx.last_save_time) >= INCREMENTAL_SAVE_INTERVAL:
        ctx.ai_message_obj.content = ctx.full_content
        ctx.db.add(ctx.ai_message_obj)
        await ctx.db.commit()
        ctx.last_save_time = current_time
        logger.debug(f"Incremental save: {len(ctx.full_content)} chars")


async def handle_streaming_end(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    ctx.full_content = stream_event["data"].get("content", ctx.full_content)
    # Extract agent_state for persistence to message agent_metadata
    agent_state_data = stream_event["data"].get("agent_state")

    # For graph-based agents, use final node output as message content
    # instead of concatenated content from all nodes
    if agent_state_data and "node_outputs" in agent_state_data:
        node_outputs = agent_state_data["node_outputs"]
        # Priority: final_report_generation > agent > model > fallback to streamed
        final_content = (
            node_outputs.get("final_report_generation") or node_outputs.get("agent") or node_outputs.get("model")
        )
        if final_content:
            if isinstance(final_content, str):
                ctx.full_content = final_content
            elif isinstance(final_content, dict):
                # Handle structured output - extract text content
                ctx.full_content = final_content.get("content", str(final_content))

    # Only create AgentRun from streaming_end if not already created via AGENT_START
    # This maintains backward compatibility with agents that don't emit lifecycle events
    if agent_state_data and ctx.ai_message_obj and not ctx.agent_run_id:
        # Save AgentRun record (agent_metadata is now stored in AgentRun table)
        try:
            agent_run_end_time = time.time()
            agent_run_repo = AgentRunRepository(ctx.db)
            agent_run_create = AgentRunCreate(
                message_id=ctx.ai_message_obj.id,
                execution_id=agent_state_data.get("execution_id", ctx.active_stream_id or ""),
                agent_id=agent_state_data.get("agent_id", ""),
                agent_name=agent_state_data.get("agent_name", ""),
                agent_type=agent_state_data.get("agent_type", "react"),
                status="completed",
                started_at=ctx.agent_run_start_time or agent_run_end_time,
                ended_at=agent_run_end_time,
                duration_ms=int((agent_run_end_time - (ctx.agent_run_start_time or agent_run_end_time)) * 1000),
                node_data={
                    "timeline": agent_state_data.get("timeline"),
                    "node_outputs": agent_state_data.get("node_outputs"),
                    "node_order": agent_state_data.get("node_order"),
                    "node_names": agent_state_data.get("node_names"),
                    "tool_calls": ctx.tool_calls_by_node or None,
                },
            )
            await agent_run_repo.create(agent_run_create)
            logger.debug(f"Saved AgentRun for message {ctx.ai_message_obj.id} (via streaming_end fallback)")
        except Exception as e:
            logger.error(f"Failed to save AgentRun: {e}")
    elif agent_state_data and ctx.ai_message_obj and ctx.agent_run_id:
        # AgentRun was already created via AGENT_START, update with final node_outputs
        try:
            agent_run_repo = AgentRunRepository(ctx.db)
            await agent_run_repo.finalize(
                agent_run_id=ctx.agent_run_id,
                status="completed",
                ended_at=time.time(),
                duration_ms=int((time.time() - (ctx.agent_run_start_time or time.time())) * 1000),
                final_node_data={
                    "timeline": agent_state_data.get("timeline", []),
                    "node_outputs": agent_state_data.get("node_outputs", {}),
                    "node_order": agent_state_data.get("node_order", []),
                    "node_names": agent_state_data.get("node_names", {}),
                    "tool_calls": ctx.tool_calls_by_node or None,
                },
            )
            logger.debug(f"Updated AgentRun {ctx.agent_run_id} with final node_outputs")
        except Exception as e:
            logger.warning(f"Failed to update AgentRun with final data: {e}")

    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_token_usage(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    token_data = stream_event["data"]
    ctx.input_tokens, ctx.output_tokens, ctx.total_tokens = normalize_token_usage(
        token_data.get("input_tokens", 0),
        token_data.get("output_tokens", 0),
        token_data.get("total_tokens", 0),
    )
    token_data["input_tokens"] = ctx.input_tokens
    token_data["output_tokens"] = ctx.output_tokens
    token_data["total_tokens"] = ctx.total_tokens

    # Persist LLM usage as ConsumeRecord(record_type="llm")
    try:
        await _ensure_session_info(ctx)
        model_tier = ctx.cached_model_tier
        model_tier_value = model_tier.value if model_tier else None
        model_name = ctx.cached_model_name or "unknown"
        provider_id = ctx.cached_provider_id

        cache_creation = token_data.get("cache_creation_input_tokens", 0)
        cache_read = token_data.get("cache_read_input_tokens", 0)

        # Calculate amount and cost_usd via pricing functions
        tier_rate = TIER_MODEL_CONSUMPTION_RATE.get(model_tier, 1.0) if model_tier else 1.0
        amount = calculate_llm_credits(
            ctx.input_tokens, ctx.output_tokens, tier_rate, cache_read_input_tokens=cache_read
        )
        cost_usd = await calculate_llm_cost_usd(
            model_name or "unknown",
            ctx.input_tokens,
            ctx.output_tokens,
            cache_read_input_tokens=cache_read,
            provider=provider_id,
        )

        tracking = ConsumptionTrackingService(ctx.db)
        await tracking.record_llm_usage(
            user_id=ctx.user_id,
            auth_provider=ctx.auth_provider,
            model_name=model_name or "unknown",
            model_tier=model_tier_value,
            provider=provider_id,
            input_tokens=ctx.input_tokens,
            output_tokens=ctx.output_tokens,
            total_tokens=ctx.total_tokens,
            amount=amount,
            cost_usd=cost_usd,
            source="chat",
            session_id=ctx.session_id,
            topic_id=ctx.topic_id,
            message_id=ctx.ai_message_obj.id if ctx.ai_message_obj else None,
            cache_creation_input_tokens=cache_creation,
            cache_read_input_tokens=cache_read,
            agent_id=ctx.agent_id_for_attribution,
            marketplace_id=ctx.marketplace_id,
            developer_user_id=ctx.developer_user_id,
        )
    except Exception as e:
        logger.warning(f"Failed to record LLM usage to DB (non-fatal): {e}")

    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_tool_call_request(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    # Store tool call data for cost calculation
    req = stream_event["data"]
    tool_call_id = req.get("id")
    tool_name = req.get("name", "")
    if tool_call_id:
        # Parse arguments (may be JSON string)
        raw_args = req.get("arguments", {})
        if isinstance(raw_args, str):
            try:
                parsed_args = json.loads(raw_args)
            except json.JSONDecodeError:
                parsed_args = {}
        else:
            parsed_args = raw_args or {}
        ctx.tool_call_data[tool_call_id] = {"name": tool_name, "args": parsed_args}

        # Accumulate tool call for agent_metadata persistence
        node_key = ctx.active_node_id or "response"
        if node_key not in ctx.tool_calls_by_node:
            ctx.tool_calls_by_node[node_key] = []
        ctx.tool_calls_by_node[node_key].append(
            {
                "id": req.get("id"),
                "name": req.get("name"),
                "arguments": req.get("arguments"),
                "status": req.get("status"),
                "timestamp": req.get("timestamp"),
            }
        )

    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_tool_call_response(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    resp = stream_event["data"]
    tool_call_id = resp.get("toolCallId")

    # Record tool call as ConsumeRecord(record_type="tool_call")
    if tool_call_id and tool_call_id in ctx.tool_call_data:
        stored = ctx.tool_call_data[tool_call_id]
        tool_name = stored.get("name", "")
        # Use raw_result to determine success/failure
        result = resp.get("raw_result")
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except json.JSONDecodeError:
                result = None
        if not isinstance(result, dict):
            result = None

        # Determine success/failure
        tool_failed = (
            resp.get("status") == "error"
            or resp.get("error") is not None
            or (isinstance(result, dict) and result.get("success") is False)
        )
        status = "error" if tool_failed else "success"

        if tool_failed:
            logger.info(f"Tool {tool_name} failed, not charging")

        # Calculate amount for successful tool calls
        amount = calculate_tool_cost(tool_name) if status == "success" else 0

        # Write ConsumeRecord to DB immediately (flush, no commit)
        try:
            await _ensure_session_info(ctx)
            model_tier_value = ctx.cached_model_tier.value if ctx.cached_model_tier else None

            tracking = ConsumptionTrackingService(ctx.db)
            await tracking.record_tool_call(
                user_id=ctx.user_id,
                auth_provider=ctx.auth_provider,
                tool_name=tool_name,
                amount=amount,
                tool_call_id=tool_call_id,
                status=status,
                model_tier=model_tier_value,
                session_id=ctx.session_id,
                topic_id=ctx.topic_id,
                message_id=ctx.ai_message_obj.id if ctx.ai_message_obj else None,
                agent_id=ctx.agent_id_for_attribution,
                marketplace_id=ctx.marketplace_id,
                developer_user_id=ctx.developer_user_id,
            )
        except Exception as e:
            logger.warning(f"Failed to record tool call to DB (non-fatal): {e}")

    # Update tool call record in tool_calls_by_node with result/status
    if tool_call_id:
        for node_calls in ctx.tool_calls_by_node.values():
            for tc in node_calls:
                if tc["id"] == tool_call_id:
                    tc["status"] = resp.get("status", "completed")
                    tc["result"] = resp.get("result")
                    if resp.get("error"):
                        tc["error"] = resp.get("error")
                    break

    await ctx.publisher.publish(json.dumps(stream_event))

    # Check for abort after tool completion (graceful abort point)
    if await ctx.publisher.check_abort():
        logger.info(f"Abort signal detected after tool completion for {ctx.publisher.connection_id}")
        ctx.is_aborted = True
        ctx.should_break = True


async def handle_message_event(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    ctx.active_stream_id = stream_event["data"]["id"]
    ctx.full_content = stream_event["data"]["content"]
    if not ctx.ai_message_obj:
        ai_message_create = MessageCreate(role="assistant", content=ctx.full_content, topic_id=ctx.topic_id)
        ctx.ai_message_obj = await ctx.message_repo.create_message(ai_message_create)
    else:
        ctx.ai_message_obj.content = ctx.full_content
        ctx.db.add(ctx.ai_message_obj)
    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_search_citations(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    citations = stream_event["data"].get("citations", [])
    if citations:
        ctx.citations_data.extend(citations)
    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_generated_files(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    files_data = stream_event["data"].get("files", [])
    file_ids = [f["id"] for f in files_data]
    ctx.generated_files_count += len(file_ids)

    if not ctx.ai_message_obj:
        ai_message_create = MessageCreate(role="assistant", content="", topic_id=ctx.topic_id)
        ctx.ai_message_obj = await ctx.message_repo.create_message(ai_message_create)

    if file_ids:
        try:
            file_repo = FileRepository(ctx.db)
            file_uuids = [UUID(fid) for fid in file_ids]
            await file_repo.update_files_message_id(file_uuids, ctx.ai_message_obj.id, ctx.user_id)
        except Exception as e:
            logger.error(f"Failed to link generated files: {e}")

    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_error(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    # Persist error fields on the AI message
    error_data: dict[str, Any] = dict(stream_event.get("data", {}))
    if not ctx.ai_message_obj:
        ai_message_create = MessageCreate(role="assistant", content="", topic_id=ctx.topic_id)
        ctx.ai_message_obj = await ctx.message_repo.create_message(ai_message_create)
        ctx.active_stream_id = str(ctx.ai_message_obj.id)  # fallback: use db id when no streaming_start received
    ctx.ai_message_obj.error_code = error_data.get("error_code")
    ctx.ai_message_obj.error_category = error_data.get("error_category")
    ctx.ai_message_obj.error_detail = error_data.get("detail")
    # Keep any partial content that was streamed before the error
    ctx.ai_message_obj.content = ctx.full_content or ""
    ctx.db.add(ctx.ai_message_obj)
    await ctx.db.commit()

    await ctx.publisher.publish(json.dumps(stream_event))

    # Send message_saved so frontend gets the DB ID
    await send_message_saved(ctx)

    ctx.error_handled = True
    ctx.should_break = True


async def handle_thinking_start(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    # Create message object if not exists
    if not ctx.ai_message_obj:
        ai_message_create = MessageCreate(role="assistant", content="", topic_id=ctx.topic_id)
        ctx.ai_message_obj = await ctx.message_repo.create_message(ai_message_create)
    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_thinking_chunk(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    chunk_content = stream_event["data"].get("content", "")
    ctx.full_thinking_content += chunk_content
    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_thinking_end(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_agent_start(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    ctx.agent_run_start_time = time.time()
    context_data = stream_event["data"].get("context", {})

    # Capture agent identity for notifications
    ctx.agent_name = context_data.get("agent_name", "")
    ctx.agent_avatar = context_data.get("agent_avatar", "")
    logger.debug(
        "[Notification] handle_agent_start captured: agent_name=%r, agent_avatar=%r",
        ctx.agent_name,
        ctx.agent_avatar[:80] if ctx.agent_avatar else "<empty>",
    )

    # Ensure we have a message object to link to
    if not ctx.ai_message_obj:
        ai_message_create = MessageCreate(role="assistant", content="", topic_id=ctx.topic_id)
        ctx.ai_message_obj = await ctx.message_repo.create_message(ai_message_create)

    # Create AgentRun record with status="running"
    # Include agent_start as the first timeline entry
    try:
        agent_run_repo = AgentRunRepository(ctx.db)
        initial_timeline = [
            {
                "event_type": "agent_start",
                "timestamp": ctx.agent_run_start_time,
                "metadata": {
                    "agent_id": context_data.get("agent_id", ""),
                    "agent_name": context_data.get("agent_name", ""),
                    "agent_type": context_data.get("agent_type", "react"),
                },
            }
        ]
        agent_run_create = AgentRunCreate(
            message_id=ctx.ai_message_obj.id,
            execution_id=context_data.get("execution_id", f"exec_{int(time.time())}"),
            agent_id=context_data.get("agent_id", ""),
            agent_name=context_data.get("agent_name", ""),
            agent_type=context_data.get("agent_type", "react"),
            status="running",
            started_at=ctx.agent_run_start_time,
            node_data={
                "timeline": initial_timeline,
                "node_outputs": {},
                "node_order": [],
                "node_names": {},
            },
        )
        agent_run = await agent_run_repo.create(agent_run_create)
        ctx.agent_run_id = agent_run.id
        logger.debug(f"Created AgentRun {ctx.agent_run_id} for message {ctx.ai_message_obj.id}")
    except Exception as e:
        logger.error(f"Failed to create AgentRun: {e}")

    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_agent_end(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    if ctx.agent_run_id:
        try:
            agent_run_repo = AgentRunRepository(ctx.db)
            end_data = stream_event["data"]
            status = end_data.get("status", "completed")

            # Add agent_end to timeline
            timeline_entry: dict[str, Any] = {
                "event_type": "agent_end",
                "timestamp": time.time(),
                "status": status,
                "duration_ms": end_data.get("duration_ms", 0),
            }
            await agent_run_repo.append_timeline_entry(ctx.agent_run_id, timeline_entry)

            # Finalize the AgentRun
            await agent_run_repo.finalize(
                agent_run_id=ctx.agent_run_id,
                status=status,
                ended_at=time.time(),
                duration_ms=end_data.get("duration_ms", 0),
                final_node_data={"tool_calls": ctx.tool_calls_by_node} if ctx.tool_calls_by_node else None,
            )
            logger.debug(f"Finalized AgentRun {ctx.agent_run_id} with status={status}")
        except Exception as e:
            logger.error(f"Failed to finalize AgentRun: {e}")

    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_node_start(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    logger.info(f"[NODE_START] Received node_start event, agent_run_id={ctx.agent_run_id}")
    if ctx.agent_run_id:
        try:
            agent_run_repo = AgentRunRepository(ctx.db)
            node_data = stream_event["data"]
            timeline_entry: dict[str, Any] = {
                "event_type": "node_start",
                "timestamp": time.time(),
                "node_id": node_data.get("node_id"),
                "node_name": node_data.get("node_name"),
                "node_type": node_data.get("node_type"),
            }
            # Include component_key for frontend rendering
            component_key = node_data.get("component_key")
            if component_key:
                timeline_entry["metadata"] = {"component_key": component_key}
            logger.info(f"[NODE_START] Appending timeline entry: {timeline_entry}")
            await agent_run_repo.append_timeline_entry(ctx.agent_run_id, timeline_entry)
            logger.info("[NODE_START] Successfully appended timeline entry")
        except Exception as e:
            logger.warning(f"Failed to append timeline entry: {e}")

    ctx.active_node_id = stream_event["data"].get("node_id")

    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_node_end(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    ctx.active_node_id = None
    if ctx.agent_run_id:
        try:
            agent_run_repo = AgentRunRepository(ctx.db)
            node_data = stream_event["data"]
            timeline_entry: dict[str, Any] = {
                "event_type": "node_end",
                "timestamp": time.time(),
                "node_id": node_data.get("node_id"),
                "node_name": node_data.get("node_name"),
                "node_type": node_data.get("node_type"),
                "status": node_data.get("status"),
                "duration_ms": node_data.get("duration_ms"),
            }
            # Include component_key for frontend rendering
            component_key = node_data.get("component_key")
            if component_key:
                timeline_entry["metadata"] = {"component_key": component_key}
            await agent_run_repo.append_timeline_entry(ctx.agent_run_id, timeline_entry)
        except Exception as e:
            logger.warning(f"Failed to append timeline entry: {e}")

    await ctx.publisher.publish(json.dumps(stream_event))


async def handle_ask_user_question(ctx: ChatTaskContext, stream_event: dict[str, Any]) -> None:
    """Handle ASK_USER_QUESTION event — store state in Redis and interrupt the task."""
    import redis.asyncio as aioredis

    from app.configs import configs

    event_data = stream_event["data"]
    question_id = event_data.get("question_id", "")
    timeout_seconds = event_data.get("timeout_seconds", 300)
    thread_id = event_data.get("thread_id", "")
    connection_id = ctx.publisher.connection_id

    # Ensure message object exists for persisting question state
    if not ctx.ai_message_obj:
        ai_message_create = MessageCreate(role="assistant", content="", topic_id=ctx.topic_id)
        ctx.ai_message_obj = await ctx.message_repo.create_message(ai_message_create)

    # Sequential question: if the message already has an answered question,
    # finalize the current message and create a new one for this question.
    existing_qd = ctx.ai_message_obj.user_question_data
    if existing_qd and existing_qd.get("status") != "pending":
        # Save accumulated content on the current message
        ctx.ai_message_obj.content = ctx.full_content or ""
        ctx.db.add(ctx.ai_message_obj)

        # Create a fresh assistant message for the follow-up question
        ai_message_create = MessageCreate(role="assistant", content="", topic_id=ctx.topic_id)
        ctx.ai_message_obj = await ctx.message_repo.create_message(ai_message_create)
        ctx.full_content = ""

    # Persist question data on the message for reconnect recovery
    ctx.ai_message_obj.user_question_data = {
        "question_id": question_id,
        "question": event_data.get("question", ""),
        "options": event_data.get("options"),
        "allow_text_input": event_data.get("allow_text_input", True),
        "timeout_seconds": timeout_seconds,
        "thread_id": thread_id,
        "status": "pending",
        "asked_at": time.time(),
    }
    ctx.ai_message_obj.content = ctx.full_content or ""
    ctx.db.add(ctx.ai_message_obj)
    await ctx.db.commit()

    # Store interrupt metadata in Redis for the resume handler
    r = None
    try:
        r = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
        # Thread ID for resume
        await r.setex(f"question_thread:{connection_id}", timeout_seconds + 60, thread_id)
        # Active question ID for validation
        await r.setex(f"question_active:{connection_id}", timeout_seconds + 60, question_id)
        # Timeout key
        await r.setex(f"question_timeout:{connection_id}:{question_id}", timeout_seconds, "1")
    except Exception as e:
        logger.error(f"Failed to store question state in Redis: {e}")
    finally:
        if r:
            await r.aclose()

    # Publish the event to the frontend
    await ctx.publisher.publish(json.dumps(stream_event))

    # Send message_saved so frontend gets the DB ID
    await send_message_saved(ctx)

    # Signal the task loop to exit
    ctx.interrupted = True
    ctx.should_break = True


# ---------------------------------------------------------------------------
# Event handler registry
# ---------------------------------------------------------------------------

EVENT_HANDLERS: dict[str, Any] = {
    ChatEventType.STREAMING_START: handle_streaming_start,
    ChatEventType.STREAMING_CHUNK: handle_streaming_chunk,
    ChatEventType.STREAMING_END: handle_streaming_end,
    ChatEventType.TOKEN_USAGE: handle_token_usage,
    ChatEventType.TOOL_CALL_REQUEST: handle_tool_call_request,
    ChatEventType.TOOL_CALL_RESPONSE: handle_tool_call_response,
    ChatEventType.MESSAGE: handle_message_event,
    ChatEventType.SEARCH_CITATIONS: handle_search_citations,
    ChatEventType.GENERATED_FILES: handle_generated_files,
    ChatEventType.ERROR: handle_error,
    ChatEventType.THINKING_START: handle_thinking_start,
    ChatEventType.THINKING_CHUNK: handle_thinking_chunk,
    ChatEventType.THINKING_END: handle_thinking_end,
    ChatEventType.AGENT_START: handle_agent_start,
    ChatEventType.AGENT_END: handle_agent_end,
    ChatEventType.NODE_START: handle_node_start,
    ChatEventType.NODE_END: handle_node_end,
    ChatEventType.ASK_USER_QUESTION: handle_ask_user_question,
}


# ---------------------------------------------------------------------------
# Abort handler
# ---------------------------------------------------------------------------


async def handle_abort(
    ctx: ChatTaskContext,
    pre_deducted_amount: float,
    access_token: str | None,
) -> None:
    """Handle the abort path after the streaming loop breaks due to abort signal."""
    connection_id = ctx.publisher.connection_id
    logger.info(f"Processing abort for {connection_id}")

    # Ensure we have a message object to save the abort state
    if not ctx.ai_message_obj:
        ai_message_create = MessageCreate(role="assistant", content="", topic_id=ctx.topic_id)
        ctx.ai_message_obj = await ctx.message_repo.create_message(ai_message_create)
        ctx.active_stream_id = str(ctx.ai_message_obj.id)  # fallback: use db id when no streaming_start received
        logger.info(f"Created message {ctx.active_stream_id} for abort state")

    # Save partial content
    ctx.ai_message_obj.content = ctx.full_content
    ctx.db.add(ctx.ai_message_obj)

    # Save thinking content if any
    if ctx.full_thinking_content:
        ctx.ai_message_obj.thinking_content = ctx.full_thinking_content
        ctx.db.add(ctx.ai_message_obj)

    # Handle AgentRun - create if not exists, or update existing
    if ctx.agent_run_id:
        # Update existing AgentRun to cancelled
        try:
            agent_run_repo = AgentRunRepository(ctx.db)
            await agent_run_repo.finalize(
                agent_run_id=ctx.agent_run_id,
                status="cancelled",
                ended_at=time.time(),
                duration_ms=int((time.time() - (ctx.agent_run_start_time or time.time())) * 1000),
            )
            logger.debug(f"Marked AgentRun {ctx.agent_run_id} as cancelled")
        except Exception as e:
            logger.error(f"Failed to cancel AgentRun: {e}")
    else:
        # Create a new AgentRun with cancelled status so the abort indicator shows on refresh
        try:
            agent_run_repo = AgentRunRepository(ctx.db)
            abort_time = time.time()
            agent_run_create = AgentRunCreate(
                message_id=ctx.ai_message_obj.id,
                execution_id=f"aborted_{int(abort_time)}",
                agent_id="",
                agent_name="",
                agent_type="react",
                status="cancelled",
                started_at=abort_time,
                ended_at=abort_time,
                duration_ms=0,
                node_data={
                    "timeline": [
                        {
                            "event_type": "agent_start",
                            "timestamp": abort_time,
                        },
                        {
                            "event_type": "agent_end",
                            "timestamp": abort_time,
                            "status": "cancelled",
                        },
                    ],
                    "node_outputs": {},
                    "node_order": [],
                    "node_names": {},
                },
            )
            agent_run = await agent_run_repo.create(agent_run_create)
            ctx.agent_run_id = agent_run.id
            logger.info(f"Created cancelled AgentRun {ctx.agent_run_id} for early abort")
        except Exception as e:
            logger.error(f"Failed to create cancelled AgentRun: {e}")

    # Partial settlement - only charge for tokens actually consumed
    try:
        await finalize_and_settle(ctx, pre_deducted_amount, access_token, "aborted settlement")
    except Exception as e:
        logger.error(f"Partial settlement failed on abort: {e}")

    await ctx.db.commit()

    # Send message_saved event to update frontend with real DB ID
    await send_message_saved(ctx)

    # Send abort acknowledgment to frontend
    abort_event_data: dict[str, Any] = {
        "reason": "user_requested",
        "partial_content_length": len(ctx.full_content),
        "tokens_consumed": ctx.total_tokens,
    }
    if ctx.active_stream_id:
        abort_event_data["stream_id"] = ctx.active_stream_id
    await ctx.publisher.publish(
        json.dumps(
            {
                "type": ChatEventType.STREAM_ABORTED,
                "data": abort_event_data,
            }
        )
    )

    # Clear the abort signal
    await ctx.publisher.clear_abort()


# ---------------------------------------------------------------------------
# Normal finalization handler
# ---------------------------------------------------------------------------


async def handle_normal_finalization(
    ctx: ChatTaskContext,
    pre_deducted_amount: float,
    access_token: str | None,
) -> None:
    """Handle the normal finalization path (DB updates and settlement)."""
    if not ctx.ai_message_obj:
        return

    # Update content
    if ctx.full_content and ctx.ai_message_obj.content != ctx.full_content:
        ctx.ai_message_obj.content = ctx.full_content
        ctx.db.add(ctx.ai_message_obj)

    # Update thinking content
    if ctx.full_thinking_content:
        ctx.ai_message_obj.thinking_content = ctx.full_thinking_content
        ctx.db.add(ctx.ai_message_obj)

    # Save citations
    if ctx.citations_data:
        try:
            citation_repo = CitationRepository(ctx.db)
            citation_creates: list[CitationCreate] = []
            for citation in ctx.citations_data:
                citation_create = CitationCreate(
                    message_id=ctx.ai_message_obj.id,
                    url=citation.get("url", ""),
                    title=citation.get("title"),
                    cited_text=citation.get("cited_text"),
                    start_index=citation.get("start_index"),
                    end_index=citation.get("end_index"),
                    search_queries=citation.get("search_queries"),
                )
                citation_creates.append(citation_create)
            await citation_repo.bulk_create_citations(citation_creates)
        except Exception as e:
            logger.error(f"Failed to save citations: {e}")

    # Update timestamp
    await ctx.topic_repo.update_topic_timestamp(ctx.topic_id)

    # Settlement
    try:
        await finalize_and_settle(ctx, pre_deducted_amount, access_token, "settlement")
    except ErrCodeError as e:
        if e.code == ErrCode.INSUFFICIENT_BALANCE:
            # Persist billing error on the message
            ctx.ai_message_obj.error_code = "billing.insufficient_balance"
            ctx.ai_message_obj.error_category = "billing"
            ctx.db.add(ctx.ai_message_obj)

            insufficient_balance_data: dict[str, Any] = {
                "error_code": "billing.insufficient_balance",
                "message": "Insufficient photon balance for settlement",
                "action_required": "recharge",
            }
            if ctx.active_stream_id:
                insufficient_balance_data["stream_id"] = ctx.active_stream_id
            await ctx.publisher.publish(
                json.dumps(
                    {
                        "type": "insufficient_balance",
                        "data": insufficient_balance_data,
                    }
                )
            )
    except Exception as e:
        logger.error(f"Settlement failed: {e}")

    # Commit all changes before sending confirmation
    await ctx.db.commit()

    # Send final saved confirmation
    await send_message_saved(ctx)

    # --- Push notification: always notify so mobile users get alerts even when backgrounded ---
    try:
        if ctx.ai_message_obj and ctx.full_content:
            from app.core.notification.events import pack_notification_body, strip_markdown
            from app.tasks.notification import send_notification, send_web_push

            _title = f"{ctx.agent_name or 'Agent'} replied"
            _push_title = ctx.agent_name or "Agent"
            _msg_id = str(ctx.ai_message_obj.id)
            _packed = pack_notification_body(
                ctx.full_content[:200],
                title=_title,
                agent_name=ctx.agent_name,
                agent_avatar=ctx.agent_avatar,
                topic_id=str(ctx.topic_id),
                message_id=_msg_id,
                url=f"/#/chat/{ctx.topic_id}",
            )
            send_notification.delay(
                event_type="agent-reply",
                subscriber_id=ctx.user_id,
                payload={
                    "__packed": _packed,
                    "title": _title,
                    "body": ctx.full_content[:200],
                    "topic_id": str(ctx.topic_id),
                    "message_id": _msg_id,
                    "session_id": str(ctx.session_id),
                    "url": f"/#/chat/{ctx.topic_id}",
                },
            )

            # Build a concise push body: "TopicName｜short preview…"
            _topic = await ctx.topic_repo.get_topic_by_id(ctx.topic_id)
            _topic_name = _topic.name if _topic and _topic.name else ""
            _preview = strip_markdown(ctx.full_content, max_len=15)
            if _topic_name:
                _push_body = f"{_topic_name}｜{_preview}" if _preview else _topic_name
            else:
                _push_body = _preview or strip_markdown(ctx.full_content, max_len=30)

            send_web_push.delay(
                user_id=ctx.user_id,
                title=_push_title,
                body=_push_body,
                url=f"/#/chat/{ctx.topic_id}",
            )
    except Exception:
        pass  # Never affect chat flow
