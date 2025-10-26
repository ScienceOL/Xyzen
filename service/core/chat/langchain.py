"""
LangGraph-based streaming chat implementation with multi-turn conversation support.
Uses LangChain's create_agent for automatic tool execution and conversation management.
"""

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional, TypeVar

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool, StructuredTool
from langchain_openai import AzureChatOpenAI
from pydantic import Field, create_model
from sqlalchemy import asc
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.providers import get_user_provider_manager
from models.topic import Topic as TopicModel
from schemas.chat_events import ChatEventType, ProcessingStatus, ToolCallStatus

from .messages import build_system_prompt

logger = logging.getLogger(__name__)

ResponseT = TypeVar("ResponseT")


def _create_langchain_model(provider: Any) -> AzureChatOpenAI:
    """Create a LangChain AzureChatOpenAI model from our provider."""
    return AzureChatOpenAI(
        api_key=provider.api_key,
        azure_endpoint=provider.api_endpoint,
        api_version=getattr(provider, "api_version", "2025-03-01-preview"),
        azure_deployment=provider.model,
        # temperature=provider.temperature,
        # max_completion_tokens=provider.max_tokens,
        timeout=provider.timeout,
        streaming=True,
    )


async def _prepare_langchain_tools(db: AsyncSession, topic: TopicModel) -> List[BaseTool]:
    """Prepare LangChain tools from MCP servers."""
    from core.chat.tools import _execute_tool_call, _prepare_mcp_tools

    mcp_tools = await _prepare_mcp_tools(db, topic)
    langchain_tools: List[BaseTool] = []

    for tool in mcp_tools:
        tool_name = tool.get("name", "")
        tool_description = tool.get("description", "")
        tool_parameters = tool.get("parameters", {})

        properties = tool_parameters.get("properties", {})
        required = tool_parameters.get("required", [])

        # Build Pydantic field definitions for create_model
        field_definitions: Dict[str, Any] = {}
        for prop_name, prop_info in properties.items():
            prop_type = prop_info.get("type", "string")
            prop_desc = prop_info.get("description", "")
            is_required = prop_name in required

            # Map JSON schema types to Python types
            type_mapping = {
                "integer": int,
                "number": float,
                "boolean": bool,
                "array": list,
                "object": dict,
                "string": str,
            }
            python_type = type_mapping.get(prop_type, str)

            # Use create_model compatible format: (type, Field(...))
            if is_required:
                field_definitions[prop_name] = (python_type, Field(description=prop_desc))
            else:
                field_definitions[prop_name] = (Optional[python_type], Field(default=None, description=prop_desc))

        # Create dynamic Pydantic model using create_model
        ArgsSchema = create_model(f"{tool_name}Args", **field_definitions)

        # Create tool execution function with closure
        async def make_tool_func(t_name: str, t_db: AsyncSession, t_topic: TopicModel) -> Any:
            async def tool_func(**kwargs: Any) -> str:
                """Execute the tool with given arguments."""
                try:
                    args_json = json.dumps(kwargs)
                    result = await _execute_tool_call(t_db, t_name, args_json, t_topic)
                    return str(result)
                except Exception as e:
                    logger.error(f"Tool {t_name} execution failed: {e}")
                    return f"Error: {e}"

            return tool_func

        tool_func = await make_tool_func(tool_name, db, topic)

        # Create structured tool
        structured_tool = StructuredTool(
            name=tool_name,
            description=tool_description,
            args_schema=ArgsSchema,
            coroutine=tool_func,
        )

        langchain_tools.append(structured_tool)

    return langchain_tools


async def _load_db_history(db: AsyncSession, topic: TopicModel) -> List[Any]:
    """Load historical messages for the topic and map to LangChain message types.

    Only user/assistant/system messages are included to avoid confusing the agent
    with raw tool execution transcripts.
    """
    try:
        # Local import to avoid circulars
        from models.message import Message as MessageModel

        # Order by creation time to maintain chronology
        stmt = (
            select(MessageModel)
            .where(MessageModel.topic_id == topic.id)
            .order_by(asc(MessageModel.created_at))  # type: ignore
        )
        result = await db.exec(stmt)
        rows = list(result.all())

        history: List[Any] = []
        for m in rows:
            role = (m.role or "").lower()
            content = m.content or ""
            if not content:
                continue
            if role == "user":
                history.append(HumanMessage(content=content))
            elif role == "assistant":
                history.append(AIMessage(content=content))
            elif role == "system":
                history.append(SystemMessage(content=content))
            else:
                # Skip unknown/tool roles for now
                continue
        return history
    except Exception as e:
        logger.warning(f"Failed to load DB chat history for topic {getattr(topic, 'id', None)}: {e}")
        return []


async def get_ai_response_stream_langchain(
    db: AsyncSession,
    message_text: str,
    topic: TopicModel,
    user_id: str,
    connection_manager: Optional[Any] = None,
    connection_id: Optional[str] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Gets a streaming response using LangChain Agent.
    Supports multi-turn conversation with automatic tool execution.

    Uses astream with stream_mode="updates" and "messages" to get:
    1. Step-by-step agent progress (LLM calls, tool executions)
    2. Token-by-token LLM streaming
    """
    # Get provider
    try:
        user_provider_manager = await get_user_provider_manager(user_id, db)
    except ValueError as e:
        logger.error(f"Failed to get provider manager for user {user_id}: {e}")
        yield {"type": ChatEventType.ERROR, "data": {"error": "No LLM providers configured."}}
        return

    # Select provider
    provider = None
    if topic.session.agent and topic.session.agent.provider_id:
        provider = user_provider_manager.get_provider(str(topic.session.agent.provider_id))

    if not provider:
        provider = user_provider_manager.get_active_provider()

    if not provider:
        logger.error(f"No provider available for user {user_id}")
        yield {"type": ChatEventType.ERROR, "data": {"error": "No AI provider available."}}
        return

    # Get system prompt with MCP awareness
    system_prompt = build_system_prompt(topic.session.agent)

    yield {"type": ChatEventType.PROCESSING, "data": {"status": ProcessingStatus.PREPARING_REQUEST}}

    try:
        # Create agent
        llm = _create_langchain_model(provider)
        tools = await _prepare_langchain_tools(db, topic)
        agent: Any = create_agent(model=llm, tools=tools, system_prompt=system_prompt)

        logger.info(f"Agent created with {len(tools)} tools")

        stream_id = f"stream_{int(asyncio.get_event_loop().time() * 1000)}"
        is_streaming = False
        current_step = None
        assistant_buffer: List[str] = []  # collect tokens/final text for persistence
        got_stream_tokens = False  # whether we received token-by-token chunks

        # Use astream with multiple stream modes: "updates" for step progress, "messages" for token streaming
        logger.debug("Starting agent.astream with stream_mode=['updates','messages']")
        # Load long-term memory (DB-backed) and include it in input
        history_messages = await _load_db_history(db, topic)

        async for chunk in agent.astream(
            {"messages": [*history_messages, HumanMessage(content=message_text)]},
            stream_mode=["updates", "messages"],
        ):
            # chunk is a tuple: (stream_mode, data)
            try:
                mode, data = chunk
            except Exception:
                logger.debug("Received malformed chunk from astream: %r", chunk)
                continue

            logger.debug("Received stream chunk - mode: %s", mode)

            if mode == "updates":
                # Step updates - emitted after each node execution
                if not isinstance(data, dict):
                    logger.debug("Updates data is not a dict: %r", data)
                    continue

                for step_name, step_data in data.items():
                    current_step = step_name
                    logger.debug("Update step: %s", step_name)
                    logger.debug("Step data: %s", step_data)

                    # Extract messages from step data
                    messages = step_data.get("messages", [])
                    logger.debug("Step '%s' messages count: %d", step_name, len(messages))
                    if not messages:
                        continue

                    last_message = messages[-1]
                    logger.debug("Last message in step '%s': %r", step_name, last_message)

                    # Check if this is a tool call request (from LLM node)
                    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
                        logger.debug("Detected tool_calls in step '%s': %r", step_name, last_message.tool_calls)
                        for tool_call in last_message.tool_calls:
                            logger.debug(
                                "Tool call requested: %s args=%s",
                                tool_call.get("name"),
                                tool_call.get("args"),
                            )
                            yield {
                                "type": ChatEventType.TOOL_CALL_REQUEST,
                                "data": {
                                    "id": tool_call.get("id", ""),
                                    "name": tool_call.get("name", ""),
                                    "description": f"Tool: {tool_call.get('name', '')}",
                                    "arguments": tool_call.get("args", {}),
                                    "status": ToolCallStatus.EXECUTING,
                                    "timestamp": asyncio.get_event_loop().time(),
                                },
                            }

                    # Check if this is a tool execution result (from tools node)
                    elif hasattr(last_message, "content") and step_name == "tools":
                        tool_call_id = getattr(last_message, "tool_call_id", "")
                        logger.debug(
                            "Tool finished in step '%s' id=%s content=%r",
                            step_name,
                            tool_call_id,
                            last_message.content,
                        )
                        yield {
                            "type": ChatEventType.TOOL_CALL_RESPONSE,
                            "data": {
                                "toolCallId": tool_call_id,
                                "status": ToolCallStatus.COMPLETED,
                                "result": {"content": str(last_message.content)},
                            },
                        }

                    # Final model response update: we rely on token stream ('messages' mode) to avoid duplication
                    elif (
                        hasattr(last_message, "content")
                        and step_name == "model"
                        and (not hasattr(last_message, "tool_calls") or not last_message.tool_calls)
                    ):
                        # Do not emit content here; 'messages' stream provides token chunks.
                        # Keeping this branch prevents other handlers from treating it as an error.
                        logger.debug("Final model response update received; deferring to token stream")

            elif mode == "messages":
                # Token-by-token streaming from LLM
                # data is a tuple: (message_chunk, metadata)
                assert isinstance(data, tuple), f"Messages data is not a tuple: {data}"

                try:
                    message_chunk, metadata = data
                except Exception:
                    logger.debug("Malformed messages data: %r", data)
                    continue

                logger.debug("Received message chunk metadata=%r", metadata)

                # Only stream user-visible tokens for LLM ('model') node
                node = None
                if isinstance(metadata, dict):
                    node = metadata.get("langgraph_node") or metadata.get("node")
                if node and node != "model":
                    # Skip non-model nodes to avoid streaming raw tool outputs
                    continue

                # Extract token text
                token_text: Optional[str] = None
                if isinstance(message_chunk, str):
                    token_text = message_chunk
                elif hasattr(message_chunk, "content"):
                    token_text = getattr(message_chunk, "content") or None
                elif hasattr(message_chunk, "text"):
                    token_text = getattr(message_chunk, "text") or None
                else:
                    # Fallback best-effort
                    try:
                        token_text = str(message_chunk)
                    except Exception:
                        token_text = None

                if token_text:
                    if not is_streaming:
                        logger.debug("Emitting streaming_start for stream_id=%s (from messages)", stream_id)
                        yield {"type": ChatEventType.STREAMING_START, "data": {"id": stream_id}}
                        is_streaming = True

                    logger.debug("Emitting streaming_chunk token len=%d", len(token_text))
                    yield {
                        "type": ChatEventType.STREAMING_CHUNK,
                        "data": {"id": stream_id, "content": token_text},
                    }
                    assistant_buffer.append(token_text)
                    got_stream_tokens = True

        # Finalize streaming after processing all chunks
        if is_streaming:
            logger.debug("Emitting streaming_end for stream_id=%s", stream_id)
            yield {
                "type": ChatEventType.STREAMING_END,
                "data": {"id": stream_id, "created_at": asyncio.get_event_loop().time()},
            }

    except Exception as e:
        logger.error(f"Agent execution failed: {e}", exc_info=True)
        yield {"type": ChatEventType.ERROR, "data": {"error": f"Service unavailable: {e}"}}
