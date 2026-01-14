"""
LangChain-based streaming chat implementation with multi-turn conversation support.

Uses LangChain's create_agent for automatic tool execution and conversation management.
This module orchestrates the streaming process using extracted helper modules.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator

from langgraph.graph.state import CompiledStateGraph
from sqlmodel.ext.asyncio.session import AsyncSession

from app.agents.factory import create_chat_agent
from app.agents.mcp_tools import format_tool_result
from app.core.chat.agent_event_handler import AgentEventContext
from app.core.chat.history import load_conversation_history
from app.core.chat.stream_handlers import (
    AgentEventStreamHandler,
    CitationExtractor,
    GeneratedFileHandler,
    StreamContext,
    StreamingEventHandler,
    ThinkingEventHandler,
    TokenStreamProcessor,
    ToolEventHandler,
)
from app.core.prompts import build_system_prompt
from app.core.providers import get_user_provider_manager
from app.models.topic import Topic as TopicModel
from app.schemas.chat_event_payloads import StreamingEvent

if TYPE_CHECKING:
    from app.core.chat.interfaces import ChatPublisher
    from app.models.agent import Agent

logger = logging.getLogger(__name__)


async def get_ai_response_stream_langchain_legacy(
    db: AsyncSession,
    message_text: str,
    topic: TopicModel,
    user_id: str,
    agent: "Agent | None" = None,
    connection_manager: "ChatPublisher | None" = None,
    connection_id: str | None = None,
    context: dict[str, Any] | None = None,
) -> AsyncGenerator[StreamingEvent, None]:
    """
    Get a streaming response using LangChain Agent.

    Supports multi-turn conversation with automatic tool execution and
    multimodal input (images, PDFs, audio).

    Args:
        db: Database session
        message_text: Text content of the user's message
        topic: Topic/conversation context
        user_id: User ID for provider management
        agent: Optional agent configuration
        connection_manager: WebSocket connection manager (unused, for compatibility)
        connection_id: WebSocket connection ID (unused, for compatibility)
        context: Optional additional context

    Yields:
        StreamingEvent dicts for each event in the streaming process

    Note:
        The current user message should already be saved to the database with files
        linked before calling this function. History loading will automatically include it.
    """
    # Get provider manager
    try:
        user_provider_manager = await get_user_provider_manager(user_id, db)
    except ValueError as e:
        logger.error(f"Failed to get provider manager for user {user_id}: {e}")
        return

    # Resolve agent if not provided
    agent = await _resolve_agent(db, agent, topic)

    # Determine provider and model
    provider_id, model_name = await _resolve_provider_and_model(
        db=db,
        agent=agent,
        topic=topic,
        message_text=message_text,
        user_provider_manager=user_provider_manager,
    )

    # Build system prompt
    system_prompt = await build_system_prompt(db, agent, model_name)
    logger.info(f"System prompt: {system_prompt}")

    # Emit processing status
    yield StreamingEventHandler.create_processing_event()

    try:
        # Create LangChain agent
        langchain_agent, event_ctx = await _create_langchain_agent(
            db=db,
            agent=agent,
            topic=topic,
            user_provider_manager=user_provider_manager,
            provider_id=provider_id,
            model_name=model_name,
            system_prompt=system_prompt,
        )

        # Initialize stream context
        ctx = StreamContext(
            stream_id=f"stream_{int(asyncio.get_event_loop().time() * 1000)}",
            db=db,
            user_id=user_id,
            event_ctx=event_ctx,
        )

        # Load conversation history
        history_messages = await load_conversation_history(db, topic)

        # Process stream
        async for event in _process_agent_stream(langchain_agent, history_messages, ctx):
            yield event

    except Exception as e:
        yield _handle_streaming_error(e, user_id)


async def _resolve_agent(db: AsyncSession, agent: "Agent | None", topic: TopicModel) -> "Agent | None":
    """Resolve agent from session if not provided."""
    if agent is not None:
        return agent

    from app.repos.agent import AgentRepository
    from app.repos.session import SessionRepository

    session_repo = SessionRepository(db)
    session = await session_repo.get_session_by_id(topic.session_id)

    if session and session.agent_id:
        agent_repo = AgentRepository(db)
        return await agent_repo.get_agent_by_id(session.agent_id)

    return None


async def _resolve_provider_and_model(
    db: AsyncSession,
    agent: "Agent | None",
    topic: TopicModel,
    message_text: str | None = None,
    user_provider_manager: Any = None,
) -> tuple[str | None, str | None]:
    """
    Determine provider and model to use.

    Priority: Session Model > Session Tier (with intelligent selection) > Agent Default > System Default (STANDARD tier)

    When model_tier is set but no session.model:
    - Uses intelligent selection to pick the best model for the task
    - Caches the selection in session.model for subsequent messages
    """
    from app.repos.session import SessionRepository
    from app.schemas.model_tier import ModelTier, get_candidate_for_model, resolve_model_for_tier

    from .model_selector import select_model_for_tier

    session_repo = SessionRepository(db)
    session = await session_repo.get_session_by_id(topic.session_id)

    provider_id: str | None = None
    model_name: str | None = None

    if session:
        if session.provider_id:
            provider_id = str(session.provider_id)

        # If session.model is already set, use it directly (cached selection)
        if session.model:
            model_name = session.model
            logger.info(f"Using cached session model: {model_name}")
        # If model_tier is set but no model, do intelligent selection
        elif session.model_tier:
            if message_text and user_provider_manager:
                try:
                    model_name = await select_model_for_tier(
                        tier=session.model_tier,
                        first_message=message_text,
                        user_provider_manager=user_provider_manager,
                    )
                    logger.info(f"Intelligent selection chose model: {model_name} for tier {session.model_tier.value}")

                    # Cache the selection in session.model for subsequent messages.
                    # Note: Concurrent requests may race to set this, but that's fine since
                    # they would set the same (or equivalent) value - this is idempotent.
                    from app.models.sessions import SessionUpdate

                    await session_repo.update_session(
                        session_id=session.id,
                        session_update=SessionUpdate(model=model_name),
                    )
                    await db.commit()
                    logger.info(f"Cached selected model in session: {model_name}")
                except Exception as e:
                    logger.error(f"Intelligent model selection failed: {e}")
                    model_name = resolve_model_for_tier(session.model_tier)
                    logger.warning(f"Falling back to tier default: {model_name}")
            else:
                # No message or provider manager, use simple fallback
                model_name = resolve_model_for_tier(session.model_tier)
                logger.info(f"Using tier fallback (no context): {model_name}")

    if not provider_id and agent and agent.provider_id:
        provider_id = str(agent.provider_id)

    if not model_name and agent and agent.model:
        model_name = agent.model

    # Final fallback: if still no model, use STANDARD tier default
    # This handles cases where session has no model/tier and agent has no default model
    if not model_name:
        default_tier = ModelTier.STANDARD
        if message_text and user_provider_manager:
            try:
                model_name = await select_model_for_tier(
                    tier=default_tier,
                    first_message=message_text,
                    user_provider_manager=user_provider_manager,
                )
                logger.info(f"Using STANDARD tier selection: {model_name}")
            except Exception as e:
                logger.error(f"STANDARD tier selection failed: {e}")
                model_name = resolve_model_for_tier(default_tier)
                logger.warning(f"Falling back to STANDARD tier default: {model_name}")
        else:
            model_name = resolve_model_for_tier(default_tier)
            logger.info(f"Using STANDARD tier fallback: {model_name}")

    # Ensure we have the correct provider for the selected model.
    # The model's required provider takes precedence over session.provider_id.
    if model_name and user_provider_manager:
        candidate = get_candidate_for_model(model_name)
        if candidate:
            # Find a configured provider that matches the candidate's required type
            for config in user_provider_manager.list_providers():
                if config.provider_type == candidate.provider_type:
                    provider_id = config.name
                    logger.info(
                        f"Resolved provider {provider_id} for model {model_name} (type: {candidate.provider_type})"
                    )
                    break

    logger.info(f"Resolved model: {model_name}, provider: {provider_id}")
    return provider_id, model_name


async def _create_langchain_agent(
    db: AsyncSession,
    agent: "Agent | None",
    topic: TopicModel,
    user_provider_manager: Any,
    provider_id: str | None,
    model_name: str | None,
    system_prompt: str,
) -> tuple[CompiledStateGraph[Any, None, Any, Any], AgentEventContext]:
    """Create and configure the LangChain agent using the agent factory."""
    graph, event_ctx = await create_chat_agent(
        db=db,
        agent_config=agent,
        topic=topic,
        user_provider_manager=user_provider_manager,
        provider_id=provider_id,
        model_name=model_name,
        system_prompt=system_prompt,
    )
    return graph, event_ctx


async def _process_agent_stream(
    agent: CompiledStateGraph[Any, None, Any, Any],
    history_messages: list[Any],
    ctx: StreamContext,
) -> AsyncGenerator[StreamingEvent, None]:
    """Process the agent stream and yield events."""
    logger.info("Starting agent.astream with stream_mode=['updates','messages']")
    logger.info(f"Length of history: {len(history_messages)}")
    logger.info(f"[AgentEvent] event_ctx present: {ctx.event_ctx is not None}")
    if ctx.event_ctx:
        logger.info(f"[AgentEvent] agent_name={ctx.event_ctx.agent_name}, agent_type={ctx.event_ctx.agent_type}")

    # Emit agent_start event
    if ctx.event_ctx:
        agent_start_event = AgentEventStreamHandler.create_agent_start_event(ctx)
        if agent_start_event:
            logger.info(f"[AgentEvent] Emitting agent_start for {ctx.event_ctx.agent_name}")
            yield agent_start_event

    chunk_count = 0

    async for chunk in agent.astream({"messages": history_messages}, stream_mode=["updates", "messages"]):
        chunk_count += 1
        try:
            mode, data = chunk
            logger.info(f"[Chunk {chunk_count}] mode={mode}, data_type={type(data).__name__}")
        except Exception:
            logger.warning("Received malformed chunk from astream: %r", chunk)
            continue

        if mode == "updates":
            if isinstance(data, dict):
                logger.info(f"[Updates] step_names={list(data.keys())}")
                # Log content of each step for debugging
                # NOTE: Node events are primarily emitted from messages mode for accurate timing
                # Updates mode handles non-streaming nodes (structured output nodes)
                # that were already handled in _handle_updates_mode
                for step_name, step_data in data.items():
                    messages = step_data.get("messages", []) if isinstance(step_data, dict) else []
                    logger.info(f"[Updates/{step_name}] messages_count={len(messages)}")
                    if messages:
                        last_msg = messages[-1]
                        logger.info(
                            f"[Updates/{step_name}] last_msg_type={type(last_msg).__name__}, has_content={hasattr(last_msg, 'content')}"
                        )
            async for event in _handle_updates_mode(data, ctx):
                yield event
        elif mode == "messages":
            if isinstance(data, tuple) and len(data) >= 2:
                msg_chunk, metadata = data
                if isinstance(metadata, dict):
                    node = metadata.get("langgraph_node") or metadata.get("node")
                    logger.info(f"[Messages] node={node}, chunk_type={type(msg_chunk).__name__}")
                    # Log if there's content in the chunk
                    if hasattr(msg_chunk, "content"):
                        content = msg_chunk.content
                        content_preview = str(content)[:100] if content else "None"
                        logger.info(f"[Messages] content_preview={content_preview}")
            async for event in _handle_messages_mode(data, ctx):
                yield event

    logger.info(f"Stream finished after {chunk_count} chunks, is_streaming={ctx.is_streaming}")

    # Emit node_end for the last node
    if ctx.current_node:
        node_end_event = AgentEventStreamHandler.create_node_end_event(ctx, ctx.current_node)
        if node_end_event:
            logger.info(f"[AgentEvent] Emitting final node_end for {ctx.current_node}")
            yield node_end_event

    # Finalize streaming
    async for event in _finalize_streaming(ctx):
        yield event

    # Emit agent_end event
    if ctx.event_ctx and ctx.agent_started:
        agent_end_event = AgentEventStreamHandler.create_agent_end_event(ctx, "completed")
        if agent_end_event:
            logger.info(f"[AgentEvent] Emitting agent_end for {ctx.event_ctx.agent_name}")
            yield agent_end_event


async def _handle_updates_mode(data: Any, ctx: StreamContext) -> AsyncGenerator[StreamingEvent, None]:
    """Handle 'updates' mode events (tool calls, model responses)."""
    if not isinstance(data, dict):
        return

    for step_name, step_data in data.items():
        logger.debug("Update step: %s", step_name)

        # Skip if step_data is None or not a dict
        if not step_data or not isinstance(step_data, dict):
            continue

        messages = step_data.get("messages", [])
        if not messages:
            continue

        last_message = messages[-1]

        # Extract agent_state from AIMessage additional_kwargs (for persistence)
        if hasattr(last_message, "additional_kwargs") and last_message.additional_kwargs:
            msg_agent_state = last_message.additional_kwargs.get("agent_state")
            if msg_agent_state:
                logger.debug("Extracted agent_state from step '%s': %s", step_name, list(msg_agent_state.keys()))
                # Initialize agent_state with context info for persistence
                if ctx.agent_state is None:
                    ctx.agent_state = {"node_outputs": {}, "node_order": [], "node_names": {}}
                    # Include agent identification for persistence (from event context)
                    if ctx.event_ctx:
                        ctx.agent_state["agent_id"] = ctx.event_ctx.agent_id
                        ctx.agent_state["agent_name"] = ctx.event_ctx.agent_name
                        ctx.agent_state["agent_type"] = ctx.event_ctx.agent_type
                        ctx.agent_state["execution_id"] = ctx.event_ctx.execution_id
                # Merge node outputs and track execution order
                if "node_outputs" in msg_agent_state:
                    for node_id in msg_agent_state["node_outputs"]:
                        # Track order of node execution
                        if node_id not in ctx.agent_state.get("node_order", []):
                            ctx.agent_state.setdefault("node_order", []).append(node_id)
                        ctx.agent_state["node_outputs"][node_id] = msg_agent_state["node_outputs"][node_id]
                # Merge node display names
                if "node_names" in msg_agent_state:
                    ctx.agent_state.setdefault("node_names", {}).update(msg_agent_state["node_names"])
                # Track current node
                if "current_node" in msg_agent_state:
                    ctx.agent_state["current_node"] = msg_agent_state["current_node"]

            # Also extract node_metadata for logging
            node_metadata = last_message.additional_kwargs.get("node_metadata")
            if node_metadata:
                logger.info(
                    "Node completed: %s (is_intermediate=%s)",
                    node_metadata.get("node_name"),
                    node_metadata.get("is_intermediate"),
                )

        # Tool call request
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            logger.debug("Detected tool_calls in step '%s'", step_name)
            for tool_call in last_message.tool_calls:
                logger.debug(
                    "Tool call requested: %s args=%s",
                    tool_call.get("name"),
                    tool_call.get("args"),
                )
                yield ToolEventHandler.create_tool_request_event(tool_call)

        # Tool execution result
        elif hasattr(last_message, "content") and step_name == "tools":
            tool_call_id = getattr(last_message, "tool_call_id", "")
            tool_name = getattr(last_message, "name", "unknown")
            formatted_result = format_tool_result(last_message.content, tool_name)
            logger.debug("Tool finished in step '%s' id=%s", step_name, tool_call_id)
            yield ToolEventHandler.create_tool_response_event(tool_call_id, formatted_result)

        # Structured output nodes (clarify_with_user, write_research_brief, etc.)
        # These nodes use with_structured_output and don't stream normally
        # They return clean content in messages, so we emit it as if streamed
        # Check for structured output metadata to support custom nodes
        elif hasattr(last_message, "content") and (
            step_name
            in {
                "clarify_with_user",
                "write_research_brief",
            }
            or (
                hasattr(last_message, "additional_kwargs")
                and "structured_output" in last_message.additional_kwargs.get("node_metadata", {})
            )
        ):
            content = last_message.content
            if isinstance(content, str) and content:
                logger.debug("Structured output from '%s': %s", step_name, content[:100])

                # Emit node_start if not already current node
                if step_name != ctx.current_node:
                    if ctx.current_node:
                        node_end_event = AgentEventStreamHandler.create_node_end_event(ctx, ctx.current_node)
                        if node_end_event:
                            yield node_end_event
                    node_start_event = AgentEventStreamHandler.create_node_start_event(ctx, step_name)
                    if node_start_event:
                        yield node_start_event

                # Emit the content as if it was streamed (single chunk for the whole message)
                if not ctx.is_streaming:
                    ctx.is_streaming = True
                    yield StreamingEventHandler.create_streaming_start(ctx.stream_id)
                yield StreamingEventHandler.create_streaming_chunk(ctx.stream_id, content)

        # Final model response (from 'model' or 'agent' step)
        elif (
            hasattr(last_message, "content")
            and step_name in ("model", "agent")
            and (not hasattr(last_message, "tool_calls") or not last_message.tool_calls)
        ):
            # Handle generated files
            if isinstance(last_message.content, list):
                _, files_data = await GeneratedFileHandler.process_generated_content(
                    last_message.content, ctx.user_id, ctx.db
                )
                if files_data:
                    yield GeneratedFileHandler.create_generated_files_event(files_data)

            # Handle citations
            if hasattr(last_message, "response_metadata"):
                citations = CitationExtractor.extract_citations(last_message.response_metadata)
                if citations:
                    logger.info(f"Emitting {len(citations)} unique search citations")
                    yield CitationExtractor.create_citations_event(citations)


async def _handle_messages_mode(data: Any, ctx: StreamContext) -> AsyncGenerator[StreamingEvent, None]:
    """Handle 'messages' mode events (token streaming and thinking content)."""
    if not isinstance(data, tuple):
        return

    try:
        message_chunk, metadata = data
    except Exception:
        logger.debug("Malformed messages data: %r", data)
        return

    # Extract token usage
    usage = TokenStreamProcessor.extract_usage_metadata(message_chunk)
    if usage:
        ctx.total_input_tokens, ctx.total_output_tokens, ctx.total_tokens = usage

    # Batch logging
    ctx.token_count += 1
    if TokenStreamProcessor.should_log_batch(ctx.token_count):
        logger.debug(
            "Received message chunks (token count: %d)",
            ctx.token_count,
        )

    # Only skip streaming from tool execution nodes and structured output nodes
    # - 'tools' node: where tool calls are executed, not LLM responses
    # - 'clarify_with_user': uses structured output (JSON), we only want the final extracted message
    # - 'write_research_brief': uses structured output, handled in updates mode
    # All other LLM nodes should stream their output normally
    SKIP_STREAMING_NODES = {"tools", "clarify_with_user", "write_research_brief"}

    node: str | None = None
    if isinstance(metadata, dict):
        node = metadata.get("langgraph_node") or metadata.get("node")
        if node in SKIP_STREAMING_NODES:
            return

    # Emit node events based on streaming metadata (more accurate timing than updates mode)
    # This ensures node_start is emitted BEFORE streaming chunks for that node
    if node and node != ctx.current_node:
        # Emit node_end for previous node
        if ctx.current_node:
            node_end_event = AgentEventStreamHandler.create_node_end_event(ctx, ctx.current_node)
            if node_end_event:
                logger.info(f"[AgentEvent/Messages] Emitting node_end for {ctx.current_node}")
                yield node_end_event

        # Emit node_start for new node
        node_start_event = AgentEventStreamHandler.create_node_start_event(ctx, node)
        if node_start_event:
            logger.info(f"[AgentEvent/Messages] Emitting node_start for {node}")
            yield node_start_event

    # Check for thinking content first (from reasoning models like Claude, DeepSeek R1, Gemini 3)
    thinking_content = ThinkingEventHandler.extract_thinking_content(message_chunk)

    if thinking_content:
        # Start thinking if not already
        if not ctx.is_thinking:
            logger.debug("Emitting thinking_start for stream_id=%s", ctx.stream_id)
            ctx.is_thinking = True
            yield ThinkingEventHandler.create_thinking_start(ctx.stream_id)

        ctx.thinking_buffer.append(thinking_content)
        yield ThinkingEventHandler.create_thinking_chunk(ctx.stream_id, thinking_content)
        return

    # If we were thinking but now have regular content, end thinking first
    if ctx.is_thinking:
        logger.debug("Emitting thinking_end for stream_id=%s", ctx.stream_id)
        ctx.is_thinking = False
        yield ThinkingEventHandler.create_thinking_end(ctx.stream_id)

    # Extract and emit token for regular streaming
    token_text = TokenStreamProcessor.extract_token_text(message_chunk)
    if not token_text:
        return

    if not ctx.is_streaming:
        # Emit synthetic node_start if no node was detected
        # This handles prebuilt agents (like ReAct) that don't include langgraph_node metadata
        if ctx.event_ctx and not ctx.current_node:
            node_start_event = AgentEventStreamHandler.create_node_start_event(ctx, "agent")
            if node_start_event:
                logger.info("[AgentEvent/Messages] Emitting synthetic node_start for 'agent'")
                yield node_start_event

        logger.debug("Emitting streaming_start for stream_id=%s", ctx.stream_id)
        ctx.is_streaming = True
        yield StreamingEventHandler.create_streaming_start(ctx.stream_id)

    ctx.assistant_buffer.append(token_text)
    yield StreamingEventHandler.create_streaming_chunk(ctx.stream_id, token_text)


async def _finalize_streaming(ctx: StreamContext) -> AsyncGenerator[StreamingEvent, None]:
    """Finalize the streaming session."""
    # If still thinking when finalizing, emit thinking_end
    if ctx.is_thinking:
        logger.debug("Emitting thinking_end (in finalize) for stream_id=%s", ctx.stream_id)
        ctx.is_thinking = False
        yield ThinkingEventHandler.create_thinking_end(ctx.stream_id)

    if ctx.is_streaming:
        logger.debug(
            "Emitting streaming_end for stream_id=%s (total tokens: %d, has_agent_state=%s)",
            ctx.stream_id,
            ctx.token_count,
            ctx.agent_state is not None,
        )
        yield StreamingEventHandler.create_streaming_end(ctx.stream_id, ctx.agent_state)

        # Emit token usage
        if ctx.total_tokens > 0 or ctx.total_input_tokens > 0 or ctx.total_output_tokens > 0:
            logger.info(
                "Emitting token usage: input=%d, output=%d, total=%d",
                ctx.total_input_tokens,
                ctx.total_output_tokens,
                ctx.total_tokens,
            )
            yield StreamingEventHandler.create_token_usage_event(
                ctx.total_input_tokens, ctx.total_output_tokens, ctx.total_tokens
            )


def _handle_streaming_error(e: Exception, user_id: str) -> StreamingEvent:
    """Handle and format streaming errors."""
    error_str = str(e).lower()

    if "context_length_exceeded" in error_str or (
        hasattr(e, "code") and getattr(e, "code") == "context_length_exceeded"
    ):
        logger.warning(f"Context length exceeded for user {user_id}: {e}")
        return StreamingEventHandler.create_error_event(
            "The conversation is too long for the model to process. "
            "Please try starting a new chat or reducing the number of attached files."
        )
    else:
        logger.error(f"Agent execution failed: {e}", exc_info=True)
        return StreamingEventHandler.create_error_event(f"Service unavailable: {e}")
