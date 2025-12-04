"""
LangGraph-based streaming chat implementation with multi-turn conversation support.
Uses LangChain's create_agent for automatic tool execution and conversation management.
"""

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Optional, TypeVar

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.messages.tool import ToolMessage
from langchain_core.tools import BaseTool, StructuredTool
from langgraph.graph.state import CompiledStateGraph
from pydantic import Field, create_model
from sqlmodel.ext.asyncio.session import AsyncSession

from core.providers import get_user_provider_manager
from models.topic import Topic as TopicModel
from schemas.chat_events import ChatEventType, ProcessingStatus, ToolCallStatus

from .messages import build_system_prompt

if TYPE_CHECKING:
    from handler.ws.v1.chat import ConnectionManager
    from models.agent import Agent

logger = logging.getLogger(__name__)

ResponseT = TypeVar("ResponseT")

# Configuration for batch logging to reduce performance impact
STREAMING_LOG_BATCH_SIZE = 50  # Log every N tokens instead of every token


async def _prepare_langchain_tools(db: AsyncSession, agent: Agent | None) -> list[BaseTool]:
    """Prepare LangChain tools from MCP servers."""
    from core.chat.tools import execute_tool_call, prepare_mcp_tools

    mcp_tools = await prepare_mcp_tools(db, agent)
    langchain_tools: list[BaseTool] = []

    for tool in mcp_tools:
        tool_name = tool.get("name", "")
        tool_description = tool.get("description", "")
        tool_parameters = tool.get("parameters", {})

        properties = tool_parameters.get("properties", {})
        required = tool_parameters.get("required", [])

        # Build Pydantic field definitions for create_model
        field_definitions: dict[str, Any] = {}
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
        async def make_tool_func(t_name: str, t_db: AsyncSession, t_agent: Any) -> Any:
            async def tool_func(**kwargs: Any) -> str:
                """Execute the tool with given arguments."""
                try:
                    args_json = json.dumps(kwargs)
                    result = await execute_tool_call(t_db, t_name, args_json, t_agent)
                    # Format result for AI consumption using the utility function
                    # from core.chat.content_utils import format_tool_result_for_ai

                    # return format_tool_result_for_ai(result)
                    return result
                except Exception as e:
                    logger.error(f"Tool {t_name} execution failed: {e}")
                    return f"Error: {e}"

            return tool_func

        tool_func = await make_tool_func(tool_name, db, agent)

        # Create structured tool
        structured_tool = StructuredTool(
            name=tool_name,
            description=tool_description,
            args_schema=ArgsSchema,
            coroutine=tool_func,
        )

        langchain_tools.append(structured_tool)

    return langchain_tools


async def _load_db_history(db: AsyncSession, topic: TopicModel) -> list[Any]:
    """Load historical messages for the topic and map to LangChain message types.

    Only user/assistant/system messages are included to avoid confusing the agent
    with raw tool execution transcripts.
    """
    try:
        from repos.message import MessageRepository

        message_repo = MessageRepository(db)
        messages = await message_repo.get_messages_by_topic(topic.id, order_by_created=True)

        num_tool_calls = 0
        history: list[Any] = []
        for message in messages:
            role = (message.role or "").lower()
            content = message.content or ""
            if not content:
                continue
            if role == "user":
                history.append(HumanMessage(content=content))
            elif role == "assistant":
                history.append(AIMessage(content=content))
            elif role == "system":
                history.append(SystemMessage(content=content))
            elif role == "tool":
                formatted_content = json.loads(content)
                if formatted_content.get("event") == ChatEventType.TOOL_CALL_REQUEST:
                    if num_tool_calls == 0:
                        history.append(
                            AIMessage(
                                content=[],
                                tool_calls=[
                                    {
                                        "name": formatted_content["name"],
                                        "args": formatted_content["arguments"],
                                        "id": formatted_content["id"],
                                    }
                                ],
                            )
                        )
                        num_tool_calls += 1
                    else:
                        history[-1].tool_calls.append(
                            {
                                "name": formatted_content["name"],
                                "args": formatted_content["arguments"],
                                "id": formatted_content["id"],
                            }
                        )
                        num_tool_calls += 1
                elif formatted_content.get("event") == ChatEventType.TOOL_CALL_RESPONSE:
                    history.append(
                        ToolMessage(
                            content=formatted_content["result"],
                            tool_call_id=formatted_content["toolCallId"],
                        )
                    )
                    num_tool_calls -= 1
            else:
                # Skip unknown/tool roles for now
                continue
        return history
    except Exception as e:
        logger.warning(f"Failed to load DB chat history for topic {getattr(topic, 'id', None)}: {e}")
        return []


async def get_ai_response_stream_langchain_legacy(
    db: AsyncSession,
    message_text: str,
    topic: TopicModel,
    user_id: str,
    agent: "Agent | None" = None,
    connection_manager: "ConnectionManager | None" = None,
    connection_id: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Gets a streaming response using LangChain Agent.
    Supports multi-turn conversation with automatic tool execution.

    Uses astream with stream_mode="updates" and "messages" to get:
    1. Step-by-step agent progress (LLM calls, tool executions)
    2. Token-by-token LLM streaming
    """
    # Get provider manager
    try:
        user_provider_manager = await get_user_provider_manager(user_id, db)
    except ValueError as e:
        logger.error(f"Failed to get provider manager for user {user_id}: {e}")
        yield {"type": ChatEventType.ERROR, "data": {"error": "No LLM providers configured."}}
        return

    # Use the provided agent parameter (for legacy compatibility)
    # If no agent provided, try to load from session
    if agent is None:
        from repos.agent import AgentRepository
        from repos.session import SessionRepository

        session_repo = SessionRepository(db)
        session = await session_repo.get_session_by_id(topic.session_id)

        if session and session.agent_id:
            agent_repo = AgentRepository(db)
            agent = await agent_repo.get_agent_by_id(session.agent_id)

    # Select provider using loaded agent or use active provider
    provider_name = None
    if agent and agent.provider_id:
        provider_name = str(agent.provider_id)

    # Get system prompt with MCP awareness
    system_prompt = await build_system_prompt(db, agent)

    yield {"type": ChatEventType.PROCESSING, "data": {"status": ProcessingStatus.PREPARING_REQUEST}}

    try:
        # Create langchain agent
        llm = user_provider_manager.create_langchain_model(provider_name)
        tools = await _prepare_langchain_tools(db, agent)
        langchain_agent: CompiledStateGraph = create_agent(model=llm, tools=tools, system_prompt=system_prompt)

        logger.info(f"Agent created with {len(tools)} tools")

        stream_id = f"stream_{int(asyncio.get_event_loop().time() * 1000)}"
        is_streaming = False
        # current_step = None
        assistant_buffer: list[str] = []  # collect tokens/final text for persistence
        # got_stream_tokens = False  # whether we received token-by-token chunks
        token_count = 0  # Track tokens for batch logging

        # Use astream with multiple stream modes: "updates" for step progress, "messages" for token streaming
        logger.debug("Starting agent.astream with stream_mode=['updates','messages']")
        # Load long-term memory (DB-backed) and include it in input
        history_messages = await _load_db_history(db, topic)

        async for chunk in langchain_agent.astream(
            {"messages": [*history_messages, HumanMessage(content=message_text)]},
            stream_mode=["updates", "messages"],
        ):
            # chunk is a tuple: (stream_mode, data)
            try:
                mode, data = chunk
            except Exception:
                logger.debug("Received malformed chunk from astream: %r", chunk)
                continue

            # Reduced logging: only log mode changes, not every chunk
            if mode == "updates":
                logger.debug(f"Received stream chunk - mode: {mode}")

            if mode == "updates":
                # Step updates - emitted after each node execution
                if not isinstance(data, dict):
                    logger.debug("Updates data is not a dict: %r", data)
                    continue

                for step_name, step_data in data.items():
                    # current_step = step_name
                    logger.debug("Update step: %s", step_name)

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
                        # Format result for frontend display using the utility function
                        yield {
                            "type": ChatEventType.TOOL_CALL_RESPONSE,
                            "data": {
                                "toolCallId": tool_call_id,
                                "status": ToolCallStatus.COMPLETED,
                                "result": last_message.content,
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

                # Batch logging: only log metadata occasionally to reduce overhead
                token_count += 1
                if token_count == 1 or token_count % STREAMING_LOG_BATCH_SIZE == 0:
                    logger.debug(
                        "Received message chunks (token count: %d) | node=%s | provider=%s | model=%s",
                        token_count,
                        metadata.get("langgraph_node") if isinstance(metadata, dict) else None,
                        metadata.get("ls_provider") if isinstance(metadata, dict) else None,
                        metadata.get("ls_model_name") if isinstance(metadata, dict) else None,
                    )

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

                    # Batch logging: only log occasionally instead of every token
                    # This significantly improves performance during streaming
                    yield {
                        "type": ChatEventType.STREAMING_CHUNK,
                        "data": {"id": stream_id, "content": token_text},
                    }
                    assistant_buffer.append(token_text)
                    # got_stream_tokens = True

        # Finalize streaming after processing all chunks
        if is_streaming:
            logger.debug(
                "Emitting streaming_end for stream_id=%s (total tokens: %d, total chars: %d)",
                stream_id,
                token_count,
                sum(len(t) for t in assistant_buffer),
            )
            yield {
                "type": ChatEventType.STREAMING_END,
                "data": {"id": stream_id, "created_at": asyncio.get_event_loop().time()},
            }

    except Exception as e:
        logger.error(f"Agent execution failed: {e}", exc_info=True)
        yield {"type": ChatEventType.ERROR, "data": {"error": f"Service unavailable: {e}"}}
