import asyncio
import json
import logging
from typing import Any
from uuid import UUID

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCode, ErrCodeError
from app.configs import configs
from app.core.celery_app import celery_app
from app.core.chat import get_ai_response_stream
from app.core.consume import create_consume_for_chat
from app.core.consume_calculator import ConsumptionCalculator
from app.core.consume_strategy import ConsumptionContext
from app.infra.database import ASYNC_DATABASE_URL
from app.models.agent_run import AgentRunCreate
from app.models.citation import CitationCreate
from app.models.message import Message, MessageCreate
from app.repos import AgentRunRepository, CitationRepository, FileRepository, MessageRepository, TopicRepository
from app.repos.session import SessionRepository
from app.schemas.chat_event_payloads import CitationData
from app.schemas.chat_event_types import ChatEventType

logger = logging.getLogger(__name__)


# Helper to publish to Redis
class RedisPublisher:
    def __init__(self, connection_id: str):
        self.connection_id = connection_id
        self.redis_client = redis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
        self.channel = f"chat:{connection_id}"

    async def publish(self, message: str) -> None:
        try:
            await self.redis_client.publish(self.channel, message)
        except Exception as e:
            logger.error(f"Failed to publish to Redis channel {self.channel}: {e}")

    async def close(self) -> None:
        await self.redis_client.aclose()

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
                text_parts.append(str(item.get("text", "")))  # pyright: ignore[reportUnknownArgumentType]
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
) -> None:
    session_id = UUID(session_id_str)
    topic_id = UUID(topic_id_str)
    connection_id = f"{session_id}:{topic_id}"

    # Reconstruct user_id - simpler handling needed based on original type
    # Assuming user_id is string or int based on auth
    user_id = user_id_str

    publisher = RedisPublisher(connection_id)

    logger.info(f"Starting async chat processing for {connection_id}")

    # Create a fresh engine and session factory for this event loop
    # This avoids the "Future attached to a different loop" error
    task_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, future=True)
    TaskSessionLocal = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    try:
        async with TaskSessionLocal() as db:
            topic_repo = TopicRepository(db)
            message_repo = MessageRepository(db)

            topic = await topic_repo.get_topic_with_details(topic_id)
            if not topic:
                logger.error(f"Topic {topic_id} not found in worker")
                await publisher.publish(
                    json.dumps({"type": ChatEventType.ERROR, "data": {"error": "Chat topic not found"}})
                )
                return

            # Initialize tracking vars
            ai_message_id = None
            ai_message_obj: Message | None = None
            full_content = ""
            full_thinking_content = ""  # Track thinking content for persistence
            citations_data: list[CitationData] = []
            generated_files_count = 0

            input_tokens: int = 0
            output_tokens: int = 0
            total_tokens: int = 0

            # Agent run tracking (for new timeline-based persistence)
            agent_run_id: UUID | None = None
            agent_run_start_time: float | None = None

            # Incremental save tracking - save content every 3 seconds during streaming
            import time

            last_save_time = time.time()
            INCREMENTAL_SAVE_INTERVAL = 3.0  # seconds

            # Stream response
            async for stream_event in get_ai_response_stream(
                db, message_text, topic, user_id, None, publisher, connection_id, context
            ):
                # stream_event: StreamingEvent  # Type annotation for better type narrowing
                # Logic copied and adapted from chat.py
                event_type = stream_event["type"]

                # Debug: Log ALL events received
                logger.info(f"[EVENT] Received event type: {event_type} (repr: {repr(event_type)})")

                if stream_event["type"] == ChatEventType.STREAMING_START:
                    ai_message_id = stream_event["data"]["id"]
                    agent_run_start_time = time.time()  # Track agent run start time
                    if not ai_message_obj:
                        ai_message_create = MessageCreate(role="assistant", content="", topic_id=topic_id)
                        ai_message_obj = await message_repo.create_message(ai_message_create)

                    await publisher.publish(json.dumps(stream_event))

                elif stream_event["type"] == ChatEventType.STREAMING_CHUNK and ai_message_id:
                    chunk_content = stream_event["data"]["content"]
                    text_content = extract_content_text(chunk_content)
                    full_content += text_content
                    stream_event["data"]["content"] = text_content
                    await publisher.publish(json.dumps(stream_event))

                    # Incremental save: periodically update DB with partial content
                    current_time = time.time()
                    if ai_message_obj and (current_time - last_save_time) >= INCREMENTAL_SAVE_INTERVAL:
                        ai_message_obj.content = full_content
                        db.add(ai_message_obj)
                        await db.commit()
                        last_save_time = current_time
                        logger.debug(f"Incremental save: {len(full_content)} chars")

                elif stream_event["type"] == ChatEventType.STREAMING_END:
                    full_content = stream_event["data"].get("content", full_content)
                    # Extract agent_state for persistence to message agent_metadata
                    agent_state_data = stream_event["data"].get("agent_state")

                    # For graph-based agents, use final node output as message content
                    # instead of concatenated content from all nodes
                    if agent_state_data and "node_outputs" in agent_state_data:
                        node_outputs = agent_state_data["node_outputs"]
                        # Priority: final_report_generation > agent > model > fallback to streamed
                        final_content = (
                            node_outputs.get("final_report_generation")
                            or node_outputs.get("agent")
                            or node_outputs.get("model")
                        )
                        if final_content:
                            if isinstance(final_content, str):
                                full_content = final_content
                            elif isinstance(final_content, dict):
                                # Handle structured output - extract text content
                                full_content = final_content.get("content", str(final_content))

                    # Only create AgentRun from streaming_end if not already created via AGENT_START
                    # This maintains backward compatibility with agents that don't emit lifecycle events
                    if agent_state_data and ai_message_obj and not agent_run_id:
                        # Save AgentRun record (agent_metadata is now stored in AgentRun table)
                        try:
                            agent_run_end_time = time.time()
                            agent_run_repo = AgentRunRepository(db)
                            agent_run_create = AgentRunCreate(
                                message_id=ai_message_obj.id,
                                execution_id=agent_state_data.get("execution_id", ai_message_id or ""),
                                agent_id=agent_state_data.get("agent_id", ""),
                                agent_name=agent_state_data.get("agent_name", ""),
                                agent_type=agent_state_data.get("agent_type", "react"),
                                status="completed",
                                started_at=agent_run_start_time or agent_run_end_time,
                                ended_at=agent_run_end_time,
                                duration_ms=int(
                                    (agent_run_end_time - (agent_run_start_time or agent_run_end_time)) * 1000
                                ),
                                node_data={
                                    "timeline": agent_state_data.get("timeline"),
                                    "node_outputs": agent_state_data.get("node_outputs"),
                                    "node_order": agent_state_data.get("node_order"),
                                    "node_names": agent_state_data.get("node_names"),
                                },
                            )
                            await agent_run_repo.create(agent_run_create)
                            logger.debug(f"Saved AgentRun for message {ai_message_obj.id} (via streaming_end fallback)")
                        except Exception as e:
                            logger.error(f"Failed to save AgentRun: {e}")
                    elif agent_state_data and ai_message_obj and agent_run_id:
                        # AgentRun was already created via AGENT_START, update with final node_outputs
                        try:
                            agent_run_repo = AgentRunRepository(db)
                            await agent_run_repo.finalize(
                                agent_run_id=agent_run_id,
                                status="completed",
                                ended_at=time.time(),
                                duration_ms=int((time.time() - (agent_run_start_time or time.time())) * 1000),
                                final_node_data={
                                    "timeline": agent_state_data.get("timeline", []),
                                    "node_outputs": agent_state_data.get("node_outputs", {}),
                                    "node_order": agent_state_data.get("node_order", []),
                                    "node_names": agent_state_data.get("node_names", {}),
                                },
                            )
                            logger.debug(f"Updated AgentRun {agent_run_id} with final node_outputs")
                        except Exception as e:
                            logger.warning(f"Failed to update AgentRun with final data: {e}")

                    await publisher.publish(json.dumps(stream_event))

                elif stream_event["type"] == ChatEventType.TOKEN_USAGE:
                    token_data = stream_event["data"]
                    input_tokens = token_data.get("input_tokens", 0)
                    output_tokens = token_data.get("output_tokens", 0)
                    total_tokens = token_data.get("total_tokens", 0)
                    await publisher.publish(json.dumps(stream_event))

                elif stream_event["type"] == ChatEventType.TOOL_CALL_REQUEST:
                    # Persist tool call request
                    try:
                        req = stream_event["data"]
                        tool_message = MessageCreate(
                            role="tool",
                            content=json.dumps(
                                {
                                    "event": ChatEventType.TOOL_CALL_REQUEST,
                                    "id": req.get("id"),
                                    "name": req.get("name"),
                                    "description": req.get("description"),
                                    "arguments": req.get("arguments"),
                                    "status": req.get("status"),
                                    "timestamp": req.get("timestamp"),
                                }
                            ),
                            topic_id=topic_id,
                        )
                        await message_repo.create_message_in_isolated_transaction(
                            tool_message, session_factory=TaskSessionLocal
                        )
                    except Exception as e:
                        logger.warning(f"Failed to persist tool call request message: {e}")
                    await publisher.publish(json.dumps(stream_event))

                elif stream_event["type"] == ChatEventType.TOOL_CALL_RESPONSE:
                    # Persist tool call response
                    try:
                        resp = stream_event["data"]
                        tool_message = MessageCreate(
                            role="tool",
                            content=json.dumps(
                                {
                                    "event": ChatEventType.TOOL_CALL_RESPONSE,
                                    "toolCallId": resp.get("toolCallId"),
                                    "status": resp.get("status"),
                                    "result": resp.get("result"),
                                    "error": resp.get("error"),
                                }
                            ),
                            topic_id=topic_id,
                        )
                        await message_repo.create_message_in_isolated_transaction(
                            tool_message, session_factory=TaskSessionLocal
                        )
                    except Exception as e:
                        logger.warning(f"Failed to persist tool call response message: {e}")
                    await publisher.publish(json.dumps(stream_event))

                elif stream_event["type"] == ChatEventType.MESSAGE:
                    ai_message_id = stream_event["data"]["id"]
                    full_content = stream_event["data"]["content"]
                    if not ai_message_obj:
                        ai_message_create = MessageCreate(role="assistant", content=full_content, topic_id=topic_id)
                        ai_message_obj = await message_repo.create_message(ai_message_create)
                    else:
                        ai_message_obj.content = full_content
                        db.add(ai_message_obj)
                    await publisher.publish(json.dumps(stream_event))

                elif event_type == ChatEventType.SEARCH_CITATIONS:
                    citations = stream_event["data"].get("citations", [])
                    if citations:
                        citations_data.extend(citations)
                    await publisher.publish(json.dumps(stream_event))

                elif stream_event["type"] == ChatEventType.GENERATED_FILES:
                    files_data = stream_event["data"].get("files", [])
                    file_ids = [f["id"] for f in files_data]
                    generated_files_count += len(file_ids)

                    if not ai_message_obj:
                        ai_message_create = MessageCreate(role="assistant", content="", topic_id=topic_id)
                        ai_message_obj = await message_repo.create_message(ai_message_create)

                    if file_ids:
                        try:
                            file_repo = FileRepository(db)
                            file_uuids = [UUID(fid) for fid in file_ids]
                            await file_repo.update_files_message_id(file_uuids, ai_message_obj.id, user_id)
                        except Exception as e:
                            logger.error(f"Failed to link generated files: {e}")

                    await publisher.publish(json.dumps(stream_event))

                elif stream_event["type"] == ChatEventType.ERROR:
                    await publisher.publish(json.dumps(stream_event))
                    break

                # Handle thinking events
                elif stream_event["type"] == ChatEventType.THINKING_START:
                    # Create message object if not exists
                    if not ai_message_obj:
                        ai_message_create = MessageCreate(role="assistant", content="", topic_id=topic_id)
                        ai_message_obj = await message_repo.create_message(ai_message_create)
                    await publisher.publish(json.dumps(stream_event))

                elif stream_event["type"] == ChatEventType.THINKING_CHUNK:
                    chunk_content = stream_event["data"].get("content", "")
                    full_thinking_content += chunk_content
                    await publisher.publish(json.dumps(stream_event))

                elif stream_event["type"] == ChatEventType.THINKING_END:
                    await publisher.publish(json.dumps(stream_event))

                # Handle AGENT_START - Create AgentRun record early
                elif stream_event["type"] == ChatEventType.AGENT_START:
                    agent_run_start_time = time.time()
                    context_data = stream_event["data"].get("context", {})

                    # Ensure we have a message object to link to
                    if not ai_message_obj:
                        ai_message_create = MessageCreate(role="assistant", content="", topic_id=topic_id)
                        ai_message_obj = await message_repo.create_message(ai_message_create)

                    # Create AgentRun record with status="running"
                    # Include agent_start as the first timeline entry
                    try:
                        agent_run_repo = AgentRunRepository(db)
                        initial_timeline = [
                            {
                                "event_type": "agent_start",
                                "timestamp": agent_run_start_time,
                                "metadata": {
                                    "agent_id": context_data.get("agent_id", ""),
                                    "agent_name": context_data.get("agent_name", ""),
                                    "agent_type": context_data.get("agent_type", "react"),
                                },
                            }
                        ]
                        agent_run_create = AgentRunCreate(
                            message_id=ai_message_obj.id,
                            execution_id=context_data.get("execution_id", f"exec_{int(time.time())}"),
                            agent_id=context_data.get("agent_id", ""),
                            agent_name=context_data.get("agent_name", ""),
                            agent_type=context_data.get("agent_type", "react"),
                            status="running",
                            started_at=agent_run_start_time,
                            node_data={
                                "timeline": initial_timeline,
                                "node_outputs": {},
                                "node_order": [],
                                "node_names": {},
                            },
                        )
                        agent_run = await agent_run_repo.create(agent_run_create)
                        agent_run_id = agent_run.id
                        logger.debug(f"Created AgentRun {agent_run_id} for message {ai_message_obj.id}")
                    except Exception as e:
                        logger.error(f"Failed to create AgentRun: {e}")

                    await publisher.publish(json.dumps(stream_event))

                # Handle NODE_END - Append to timeline incrementally
                elif stream_event["type"] == ChatEventType.NODE_END:
                    if agent_run_id:
                        try:
                            agent_run_repo = AgentRunRepository(db)
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
                            await agent_run_repo.append_timeline_entry(agent_run_id, timeline_entry)
                        except Exception as e:
                            logger.warning(f"Failed to append timeline entry: {e}")

                    await publisher.publish(json.dumps(stream_event))

                # Handle NODE_START - Track node start in timeline
                elif stream_event["type"] == ChatEventType.NODE_START:
                    logger.info(f"[NODE_START] Received node_start event, agent_run_id={agent_run_id}")
                    if agent_run_id:
                        try:
                            agent_run_repo = AgentRunRepository(db)
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
                            await agent_run_repo.append_timeline_entry(agent_run_id, timeline_entry)
                            logger.info("[NODE_START] Successfully appended timeline entry")
                        except Exception as e:
                            logger.warning(f"Failed to append timeline entry: {e}")

                    await publisher.publish(json.dumps(stream_event))

                # Handle AGENT_END - Finalize AgentRun
                elif stream_event["type"] == ChatEventType.AGENT_END:
                    if agent_run_id:
                        try:
                            agent_run_repo = AgentRunRepository(db)
                            end_data = stream_event["data"]
                            status = end_data.get("status", "completed")

                            # Add agent_end to timeline
                            timeline_entry = {
                                "event_type": "agent_end",
                                "timestamp": time.time(),
                                "status": status,
                                "duration_ms": end_data.get("duration_ms", 0),
                            }
                            await agent_run_repo.append_timeline_entry(agent_run_id, timeline_entry)

                            # Finalize the AgentRun
                            await agent_run_repo.finalize(
                                agent_run_id=agent_run_id,
                                status=status,
                                ended_at=time.time(),
                                duration_ms=end_data.get("duration_ms", 0),
                            )
                            logger.debug(f"Finalized AgentRun {agent_run_id} with status={status}")
                        except Exception as e:
                            logger.error(f"Failed to finalize AgentRun: {e}")

                    await publisher.publish(json.dumps(stream_event))

                else:
                    await publisher.publish(json.dumps(stream_event))

            # --- Finalization (DB Updates & Settlement) ---
            if ai_message_obj:
                # Update content
                if full_content and ai_message_obj.content != full_content:
                    ai_message_obj.content = full_content
                    db.add(ai_message_obj)

                # Update thinking content
                if full_thinking_content:
                    ai_message_obj.thinking_content = full_thinking_content
                    db.add(ai_message_obj)

                # Save citations
                if citations_data:
                    try:
                        citation_repo = CitationRepository(db)
                        citation_creates: list[CitationCreate] = []
                        for citation in citations_data:
                            citation_create = CitationCreate(
                                message_id=ai_message_obj.id,
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
                await topic_repo.update_topic_timestamp(topic.id)

                # Settlement
                try:
                    # Get session to retrieve model_tier
                    session_repo = SessionRepository(db)
                    session = await session_repo.get_session_by_id(session_id)
                    model_tier = session.model_tier if session else None

                    # Use strategy pattern for consumption calculation
                    consume_context = ConsumptionContext(
                        model_tier=model_tier,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        total_tokens=total_tokens,
                        content_length=len(full_content),
                        generated_files_count=generated_files_count,
                    )
                    result = ConsumptionCalculator.calculate(consume_context)
                    total_cost = result.amount

                    remaining_amount = total_cost - pre_deducted_amount

                    if remaining_amount > 0:
                        await create_consume_for_chat(
                            db=db,
                            user_id=user_id,
                            auth_provider=auth_provider,
                            amount=int(remaining_amount),
                            access_key=access_token,
                            session_id=session_id,
                            topic_id=topic_id,
                            message_id=ai_message_obj.id,
                            description=f"Chat message consume (settlement): {remaining_amount} points",
                            input_tokens=input_tokens if total_tokens > 0 else None,
                            output_tokens=output_tokens if total_tokens > 0 else None,
                            total_tokens=total_tokens if total_tokens > 0 else None,
                            model_tier=model_tier.value if model_tier else None,
                            tier_rate=result.breakdown.get("tier_rate"),
                            calculation_breakdown=json.dumps(result.breakdown),
                        )
                except ErrCodeError as e:
                    if e.code == ErrCode.INSUFFICIENT_BALANCE:
                        await publisher.publish(
                            json.dumps(
                                {
                                    "type": "insufficient_balance",
                                    "data": {
                                        "error_code": "INSUFFICIENT_BALANCE",
                                        "message": "Insufficient photon balance for settlement",
                                        "action_required": "recharge",
                                    },
                                }
                            )
                        )
                except Exception as e:
                    logger.error(f"Settlement failed: {e}")

                # Commit all changes before sending confirmation
                await db.commit()

                # Send final saved confirmation
                await publisher.publish(
                    json.dumps(
                        {
                            "type": ChatEventType.MESSAGE_SAVED,
                            "data": {
                                "stream_id": ai_message_id,
                                "db_id": str(ai_message_obj.id),
                                "created_at": ai_message_obj.created_at.isoformat()
                                if ai_message_obj.created_at
                                else None,
                            },
                        }
                    )
                )

    except Exception as e:
        logger.error(f"Unhandled error in process_chat_message: {e}", exc_info=True)
        await publisher.publish(
            json.dumps({"type": ChatEventType.ERROR, "data": {"error": f"Internal system error: {str(e)}"}})
        )
    finally:
        await publisher.close()
        await task_engine.dispose()
