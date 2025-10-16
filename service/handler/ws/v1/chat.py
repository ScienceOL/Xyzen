import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.chat import get_ai_response_stream
from middleware.auth import get_current_user_websocket
from middleware.database import get_session
from middleware.database.connection import async_engine
from models.agent import Agent as AgentModel
from models.message import Message as MessageModel
from models.message import MessageCreate
from models.sessions import Session as SessionModel
from models.topic import Topic as TopicModel

# --- Logger Setup ---
logger = logging.getLogger(__name__)
router = APIRouter()


# --- Connection Manager ---
class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, WebSocket] = {}
        # Store pending tool call confirmations with complete context
        # Format: {tool_call_id: {
        #     "connection_id": str,
        #     "tool_calls": List[Dict],
        #     "topic": TopicModel,
        #     "messages": List[ChatMessage],
        #     "provider": Provider,
        #     "message_id": str
        # }}
        self.pending_tool_calls: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str) -> None:
        if session_id in self.active_connections:
            del self.active_connections[session_id]
        # Clean up any pending tool calls for this connection
        to_remove = []
        for tool_call_id, info in self.pending_tool_calls.items():
            if info.get("connection_id") == session_id:
                to_remove.append(tool_call_id)
        for tool_call_id in to_remove:
            del self.pending_tool_calls[tool_call_id]

    async def send_personal_message(self, message: str, session_id: str) -> None:
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_text(message)

    async def broadcast(self, message: str) -> None:
        for connection in self.active_connections.values():
            await connection.send_text(message)

    def add_pending_tool_call(self, tool_call_id: str, connection_id: str, callback: Callable) -> None:
        """Add a tool call that needs user confirmation"""
        self.pending_tool_calls[tool_call_id] = {"connection_id": connection_id, "callback": callback}

    def get_pending_tool_call(self, tool_call_id: str) -> Dict:
        """Get pending tool call info"""
        return self.pending_tool_calls.get(tool_call_id, {})


manager = ConnectionManager()
tool_message_sessionmaker = async_sessionmaker(async_engine, expire_on_commit=False)


async def persist_tool_message(topic_id: UUID, payload: Dict[str, Any]) -> None:
    """
    Persist a tool event message in a short-lived session to avoid expiring
    state in the long-lived websocket session.
    """
    message_content = json.dumps(payload, ensure_ascii=False, default=str)
    message = MessageModel.model_validate(MessageCreate(role="tool", content=message_content, topic_id=topic_id))

    async with tool_message_sessionmaker() as session:
        session.add(message)
        await session.commit()


async def handle_tool_call_confirmation(
    websocket: WebSocket, connection_id: str, tool_call_id: str, confirmed: bool
) -> None:
    """Handle tool call confirmation or cancellation from the user"""
    try:
        logger.info(f"Handling tool call confirmation: {tool_call_id}, confirmed: {confirmed}")

        # Get the stored context for this tool call
        pending_info = manager.pending_tool_calls.get(tool_call_id)
        if not pending_info:
            logger.warning(f"Tool call {tool_call_id} not found in pending confirmations")
            return

        if not confirmed:
            # User cancelled the tool call
            response = {
                "type": "tool_call_response",
                "data": {"toolCallId": tool_call_id, "status": "failed", "error": "用户取消执行"},
            }
            await manager.send_personal_message(json.dumps(response), connection_id)
            # Persist a tool message for cancellation (failed)
            try:
                await persist_tool_message(
                    UUID(connection_id.split(":")[1]),
                    {
                        "event": "tool_call_response",
                        "toolCallId": tool_call_id,
                        "status": "failed",
                        "error": "用户取消执行",
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to persist cancelled tool call message: {e}")
            # Remove from pending
            del manager.pending_tool_calls[tool_call_id]
            return

        # User confirmed the tool call - continue with execution using stored context
        response = {
            "type": "tool_call_response",
            "data": {"toolCallId": tool_call_id, "status": "executing"},
        }
        await manager.send_personal_message(json.dumps(response), connection_id)

        # Extract stored context
        tool_calls = pending_info["tool_calls"]
        topic = pending_info["topic"]
        messages = pending_info["messages"]
        provider = pending_info["provider"]
        message_id = pending_info["message_id"]
        model = pending_info["model"]

        # Import necessary functions
        from core.chat import ChatCompletionRequest, ChatMessage, _execute_tool_calls

        try:
            # Execute the tools using the same logic as immediate execution
            tool_results = await _execute_tool_calls(tool_calls, topic)

            # Send tool completion events for each tool call
            for tool_call in tool_calls:
                tc_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")
                result = tool_results.get(tc_id)
                if result:
                    completion_event = {
                        "type": "tool_call_response",
                        "data": {
                            "toolCallId": tc_id,
                            "status": "completed",
                            "result": result,
                        },
                    }
                    await manager.send_personal_message(json.dumps(completion_event), connection_id)

                    # Persist tool completion as a Message row for history
                    try:
                        await persist_tool_message(
                            UUID(connection_id.split(":")[1]),
                            {
                                "event": "tool_call_response",
                                "toolCallId": tc_id,
                                "status": "completed",
                                "result": result,
                            },
                        )
                    except Exception as e:
                        logger.warning(f"Failed to persist tool completion message: {e}")

            # Continue with AI response generation using the same logic as immediate execution
            assistant_tool_message = ChatMessage(
                role="assistant", content="I need to use tools to help answer your question."
            )

            tool_result_messages = []
            for tool_call_id_inner, result in tool_results.items():
                # Extract clean result for AI consumption
                if isinstance(result, dict):
                    if "content" in result:
                        # Try to extract the actual result value
                        content = result["content"]
                        if isinstance(content, str) and content.startswith("[TextContent"):
                            # Parse the TextContent result to get the actual value
                            try:
                                import re

                                match = re.search(r"text='([^']*)'", content)
                                if match:
                                    result_content = match.group(1)
                                else:
                                    result_content = str(result)
                            except Exception:
                                result_content = str(result)
                        else:
                            result_content = str(content)
                    else:
                        result_content = str(result)
                else:
                    result_content = str(result)

                logger.info(f"Processed tool result for AI: {result_content}")
                tool_result_messages.append(
                    ChatMessage(role="user", content=f"Tool execution result: {result_content}")
                )

            # Get final response from AI with tool results using streaming
            final_messages = messages + [assistant_tool_message] + tool_result_messages
            final_request = ChatCompletionRequest(
                messages=final_messages,
                model=model,
                temperature=0.7,
            )

            # Log the complete message history being sent to AI
            logger.info(f"Sending {len(final_messages)} messages to AI for final response:")
            for i, msg in enumerate(final_messages):
                logger.info(f"Message {i+1}: role={msg.role}, content={msg.content[:200]}...")

            # Use streaming for the final AI response if supported
            if provider.supports_streaming():
                logger.info("Using streaming for final AI response after confirmed tool execution")
                final_message_id = f"confirmed_stream_{int(asyncio.get_event_loop().time() * 1000)}"

                # Send streaming start event
                stream_start = {"type": "streaming_start", "data": {"id": final_message_id}}
                await manager.send_personal_message(json.dumps(stream_start), connection_id)

                # Stream the response
                final_content_chunks = []
                chunk_count = 0
                async for chunk in provider.chat_completion_stream(final_request):
                    chunk_count += 1
                    if chunk.content:
                        final_content_chunks.append(chunk.content)
                        stream_chunk = {
                            "type": "streaming_chunk",
                            "data": {"id": final_message_id, "content": chunk.content},
                        }
                        await manager.send_personal_message(json.dumps(stream_chunk), connection_id)

                # End streaming
                final_full_content = "".join(final_content_chunks)
                if final_full_content.strip():
                    stream_end = {
                        "type": "streaming_end",
                        "data": {
                            "id": final_message_id,
                            "content": final_full_content,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        },
                    }
                    await manager.send_personal_message(json.dumps(stream_end), connection_id)
                else:
                    logger.warning("Final AI streaming response after tool execution was empty")
            else:
                # Fall back to non-streaming
                final_response = await provider.chat_completion(final_request)
                if final_response.content:
                    final_message = {
                        "type": "message",
                        "data": {
                            "id": f"confirmed_msg_{int(asyncio.get_event_loop().time() * 1000)}",
                            "role": "assistant",
                            "content": final_response.content,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        },
                    }
                    await manager.send_personal_message(json.dumps(final_message), connection_id)
                else:
                    logger.warning("Final AI response after tool execution was empty")

        except Exception as e:
            logger.error(f"Error executing confirmed tools: {e}")
            error_response = {
                "type": "tool_call_response",
                "data": {"toolCallId": tool_call_id, "status": "failed", "error": str(e)},
            }
            await manager.send_personal_message(json.dumps(error_response), connection_id)

            # Persist error tool message
            try:
                await persist_tool_message(
                    UUID(connection_id.split(":")[1]),
                    {
                        "event": "tool_call_response",
                        "toolCallId": tool_call_id,
                        "status": "failed",
                        "error": str(e),
                    },
                )
            except Exception as pe:
                logger.warning(f"Failed to persist tool error message: {pe}")

        finally:
            # Remove from pending
            if tool_call_id in manager.pending_tool_calls:
                del manager.pending_tool_calls[tool_call_id]

    except Exception as e:
        logger.error(f"Error handling tool call confirmation: {e}")
        error_response = {"type": "error", "data": {"error": f"Failed to process tool call confirmation: {e}"}}
        await manager.send_personal_message(json.dumps(error_response), connection_id)


# --- WebSocket Endpoint ---
@router.websocket("/sessions/{session_id}/topics/{topic_id}")
async def chat_websocket(
    websocket: WebSocket,
    session_id: UUID,
    topic_id: UUID,
    user: str = Depends(get_current_user_websocket),
    db: AsyncSession = Depends(get_session),
) -> None:
    connection_id = f"{session_id}:{topic_id}"
    await manager.connect(websocket, connection_id)

    # Verify topic and session exist and are linked.
    # Eagerly load all relationships needed for the chat.
    statement = (
        select(TopicModel)
        .where(TopicModel.id == topic_id)
        .options(
            selectinload(getattr(TopicModel, "messages")),
            selectinload(getattr(TopicModel, "session")).options(
                selectinload(getattr(SessionModel, "agent")).options(selectinload(getattr(AgentModel, "mcp_servers")))
            ),
        )
    )
    result = await db.exec(statement)
    topic = result.one_or_none()

    if not topic or topic.session_id != session_id:
        await websocket.close(code=4004, reason="Topic not found or does not belong to the session")
        return

    # Optional: Verify session belongs to user
    session = await db.get(SessionModel, session_id)
    if not session or session.user_id != user:
        await websocket.close(code=4003, reason="Session not found or access denied")
        return

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type", "message")

            # Handle tool call confirmation/cancellation
            if message_type == "tool_call_confirm":
                tool_call_id = data.get("data", {}).get("toolCallId")
                if tool_call_id:
                    await handle_tool_call_confirmation(websocket, connection_id, tool_call_id, True)
                continue

            elif message_type == "tool_call_cancel":
                tool_call_id = data.get("data", {}).get("toolCallId")
                if tool_call_id:
                    await handle_tool_call_confirmation(websocket, connection_id, tool_call_id, False)
                continue

            # Handle regular chat messages
            message_text = data.get("message")

            if not message_text:
                continue

            # 1. Save user message to the topic
            user_message_create = MessageCreate(role="user", content=message_text, topic_id=topic_id)
            user_message = MessageModel.model_validate(user_message_create)
            db.add(user_message)

            # Update topic's updated_at timestamp
            topic.updated_at = datetime.now(timezone.utc)
            db.add(topic)

            await db.commit()
            await db.refresh(user_message)

            # Send user message to client first
            await manager.send_personal_message(
                user_message.model_dump_json(),
                connection_id,
            )

            # Send loading status
            loading_event = {"type": "loading", "data": {"message": "AI is thinking..."}}
            await manager.send_personal_message(
                json.dumps(loading_event),
                connection_id,
            )

            # Re-query the topic to get the updated messages list
            # This ensures we have a fresh, complete view of all messages
            statement_refresh = (
                select(TopicModel)
                .where(TopicModel.id == topic_id)
                .options(
                    selectinload(getattr(TopicModel, "messages")),
                    selectinload(getattr(TopicModel, "session")).options(
                        selectinload(getattr(SessionModel, "agent")).options(
                            selectinload(getattr(AgentModel, "mcp_servers"))
                        )
                    ),
                )
            )
            result_refresh = await db.exec(statement_refresh)
            topic_refreshed = result_refresh.one()

            # Stream AI response
            ai_message_id = None
            full_content = ""

            async for stream_event in get_ai_response_stream(message_text, topic_refreshed, manager, connection_id):
                logger.info(f"Received stream event: {stream_event['type']}")

                # Track message ID and content for database saving
                if stream_event["type"] == "streaming_start":
                    ai_message_id = stream_event["data"]["id"]
                    # Forward streaming_start to frontend
                    await manager.send_personal_message(json.dumps(stream_event), connection_id)
                elif stream_event["type"] == "streaming_chunk" and ai_message_id:
                    chunk_content = stream_event["data"]["content"]
                    full_content += chunk_content
                    # Forward streaming_chunk to frontend
                    await manager.send_personal_message(json.dumps(stream_event), connection_id)
                elif stream_event["type"] == "streaming_end":
                    full_content = stream_event["data"].get("content", full_content)
                    # Forward streaming_end to frontend
                    await manager.send_personal_message(json.dumps(stream_event), connection_id)
                elif stream_event["type"] == "tool_call_request":
                    # Forward tool call request to frontend
                    try:
                        req = stream_event["data"]
                        await persist_tool_message(
                            topic_id,
                            {
                                "event": "tool_call_request",
                                "id": req.get("id"),
                                "name": req.get("name"),
                                "description": req.get("description"),
                                "arguments": req.get("arguments"),
                                "status": req.get("status"),
                                "timestamp": req.get("timestamp"),
                            },
                        )
                    except Exception as e:
                        logger.warning(f"Failed to persist tool call request message: {e}")
                    await manager.send_personal_message(json.dumps(stream_event), connection_id)

                    continue
                elif stream_event["type"] == "tool_call_response":
                    # Handle tool call response
                    try:
                        resp = stream_event["data"]
                        await persist_tool_message(
                            topic_id,
                            {
                                "event": "tool_call_response",
                                "toolCallId": resp.get("toolCallId"),
                                "status": resp.get("status"),
                                "result": resp.get("result"),
                                "error": resp.get("error"),
                            },
                        )
                    except Exception as e:
                        logger.warning(f"Failed to persist tool call response message: {e}")
                    await manager.send_personal_message(json.dumps(stream_event), connection_id)
                    continue
                elif stream_event["type"] == "message":
                    # Handle non-streaming response
                    ai_message_id = stream_event["data"]["id"]
                    full_content = stream_event["data"]["content"]
                    # Forward message to frontend
                    await manager.send_personal_message(json.dumps(stream_event), connection_id)
                elif stream_event["type"] == "error":
                    full_content = stream_event["data"]["error"]
                    # Forward error to frontend
                    await manager.send_personal_message(json.dumps(stream_event), connection_id)
                    break
                else:
                    # Forward any other event types
                    await manager.send_personal_message(json.dumps(stream_event), connection_id)

            # Save AI message to database
            if ai_message_id and full_content:
                ai_message_create = MessageCreate(role="assistant", content=full_content, topic_id=topic_id)
                ai_message = MessageModel.model_validate(ai_message_create)
                db.add(ai_message)

                # Update topic's updated_at timestamp again after AI response
                topic_refreshed.updated_at = datetime.now(timezone.utc)
                db.add(topic_refreshed)

                await db.commit()
                await db.refresh(ai_message)

                # Send final message confirmation with real database ID
                final_message_event = {
                    "type": "message_saved",
                    "data": {
                        "stream_id": ai_message_id,
                        "db_id": str(ai_message.id),
                        "created_at": ai_message.created_at.isoformat(),
                    },
                }
                await manager.send_personal_message(
                    json.dumps(final_message_event),
                    connection_id,
                )

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for topic {connection_id}")
    except Exception as e:
        logger.error(f"An error occurred in WebSocket for topic {connection_id}: {e}")
    finally:
        manager.disconnect(connection_id)
