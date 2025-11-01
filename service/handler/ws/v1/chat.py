import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Callable, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from common.exceptions import InsufficientBalanceError
from core.chat import get_ai_response_stream
from core.consume import create_consume_for_chat
from middleware.auth import AuthContext, get_auth_context_websocket
from middleware.database.connection import AsyncSessionLocal
from models.message import Message as MessageModel
from models.message import MessageCreate
from repo import MessageRepository, SessionRepository, TopicRepository

# --- Logger Setup ---
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])


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


class ConnectionInfo:
    """Parses and validates the connection_id string."""

    def __init__(self, connection_id: str):
        parts = connection_id.split(":")
        if len(parts) != 2:
            raise ValueError("Invalid connection_id format. Expected 'session_id:topic_id'.")
        try:
            self.session_id = UUID(parts[0])
            self.topic_id = UUID(parts[1])
        except ValueError:
            raise ValueError("Invalid UUID in connection_id parts.")


async def handle_tool_call_confirmation(
    message_repo: MessageRepository, connection_id: str, tool_call_id: str, confirmed: bool
) -> None:
    """Handle tool call confirmation or cancellation from the user"""
    try:
        conn_info = ConnectionInfo(connection_id)
    except ValueError as e:
        logger.error(f"Could not handle tool confirmation due to invalid connection_id: {e}")
        return

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
                tool_message = MessageCreate(
                    role="tool",
                    content=json.dumps(
                        {
                            "event": "tool_call_response",
                            "toolCallId": tool_call_id,
                            "status": "failed",
                            "error": "用户取消执行",
                        }
                    ),
                    topic_id=conn_info.topic_id,
                )
                await message_repo.create_message_in_isolated_transaction(tool_message)
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
        from core.chat.sync import ChatCompletionRequest, ChatMessage
        from core.chat.tools import execute_tool_calls

        try:
            # Execute the tools using the same logic as immediate execution
            tool_results = await execute_tool_calls(message_repo.db, tool_calls, topic)

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
                        tool_message = MessageCreate(
                            role="tool",
                            content=json.dumps(
                                {
                                    "event": "tool_call_response",
                                    "toolCallId": tc_id,
                                    "status": "completed",
                                    "result": result,
                                }
                            ),
                            topic_id=conn_info.topic_id,
                        )
                        await message_repo.create_message_in_isolated_transaction(tool_message)
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
                temperature=provider.temperature,
                max_tokens=provider.max_tokens,
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

                    # Save the final AI message to the database
                    final_ai_message = MessageCreate(
                        role="assistant",
                        content=final_full_content,
                        topic_id=conn_info.topic_id,
                    )
                    await message_repo.create_message(final_ai_message)
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
                tool_message = MessageCreate(
                    role="tool",
                    content=json.dumps(
                        {
                            "event": "tool_call_response",
                            "toolCallId": tool_call_id,
                            "status": "failed",
                            "error": str(e),
                        }
                    ),
                    topic_id=conn_info.topic_id,
                )
                await message_repo.create_message_in_isolated_transaction(tool_message)
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
    auth_ctx: AuthContext = Depends(get_auth_context_websocket),
) -> None:
    connection_id = f"{session_id}:{topic_id}"
    await manager.connect(websocket, connection_id)

    user = auth_ctx.user_id  # 兼容现有代码

    async with AsyncSessionLocal() as db:
        topic_repo = TopicRepository(db)
        session_repo = SessionRepository(db)
        topic = await topic_repo.get_topic_with_details(topic_id)
        if not topic or topic.session_id != session_id:
            await websocket.close(code=4004, reason="Topic not found or does not belong to the session")
            return

        session = await session_repo.get_session_by_id(session_id)
        if not session or session.user_id != user:
            await websocket.close(code=4003, reason="Session not found or access denied")
            return

    try:
        while True:
            data = await websocket.receive_json()
            async with AsyncSessionLocal() as db:
                message_repo = MessageRepository(db)
                session_repo = SessionRepository(db)
                topic_repo = TopicRepository(db)
                message_type = data.get("type", "message")

                # Handle tool call confirmation/cancellation
                if message_type == "tool_call_confirm":
                    tool_call_id = data.get("data", {}).get("toolCallId")
                    if tool_call_id:
                        await handle_tool_call_confirmation(message_repo, connection_id, tool_call_id, True)
                    continue

                elif message_type == "tool_call_cancel":
                    tool_call_id = data.get("data", {}).get("toolCallId")
                    if tool_call_id:
                        await handle_tool_call_confirmation(message_repo, connection_id, tool_call_id, False)
                    continue

                # Handle regular chat messages
                message_text = data.get("message")

                if not message_text:
                    continue

                # 1. Save user message to the topic
                user_message_create = MessageCreate(role="user", content=message_text, topic_id=topic_id)
                user_message = await message_repo.create_message(user_message_create)

                # Update topic's updated_at timestamp
                # topic.updated_at = datetime.now(timezone.utc)
                # await topic_repo.update_topic_timestamp(topic)

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

                topic_refreshed = await topic_repo.get_topic_with_details(topic_id)
                if not topic_refreshed:
                    logger.error(f"Topic {topic_id} not found after user message creation")
                    continue

                # Stream AI response
                ai_message_id = None
                full_content = ""

                async for stream_event in get_ai_response_stream(
                    db, message_text, topic_refreshed, user, manager, connection_id
                ):
                    logger.debug(f"Received stream event: {stream_event['type']}")

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
                            tool_message = MessageCreate(
                                role="tool",
                                content=json.dumps(
                                    {
                                        "event": "tool_call_request",
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
                            await message_repo.create_message_in_isolated_transaction(tool_message)
                        except Exception as e:
                            logger.warning(f"Failed to persist tool call request message: {e}")
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)

                        continue
                    elif stream_event["type"] == "tool_call_response":
                        # Handle tool call response
                        try:
                            resp = stream_event["data"]
                            tool_message = MessageCreate(
                                role="tool",
                                content=json.dumps(
                                    {
                                        "event": "tool_call_response",
                                        "toolCallId": resp.get("toolCallId"),
                                        "status": resp.get("status"),
                                        "result": resp.get("result"),
                                        "error": resp.get("error"),
                                    }
                                ),
                                topic_id=topic_id,
                            )
                            await message_repo.create_message_in_isolated_transaction(tool_message)
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
                    ai_message = await message_repo.create_message(ai_message_create)

                    # Update topic's updated_at timestamp again after AI response
                    await topic_repo.update_topic_timestamp(topic_refreshed.id)

                    # === 创建消费记录 ===
                    try:
                        # 计算消费金额（这里使用简单的字符数计算，可根据实际需求调整）
                        consume_amount = 3 + len(full_content) // 100  # 每10个字符消费1积分
                        if consume_amount > 0:
                            # 仅在 bohr_app 时传递 access_token
                            access_key = None
                            if auth_ctx.auth_provider.lower() == "bohr_app":
                                access_key = auth_ctx.access_token

                            consume_record = await create_consume_for_chat(
                                db=db,
                                user_id=auth_ctx.user_id,
                                auth_provider=auth_ctx.auth_provider,
                                amount=consume_amount,
                                access_key=access_key,
                                session_id=session_id,
                                topic_id=topic_id,
                                message_id=ai_message.id,
                                description=f"Chat message consume: {consume_amount} points",
                            )
                            logger.info(
                                f"Consume record created: {consume_record.id}, "
                                f"user: {auth_ctx.user_id}, amount: {consume_amount}, "
                                f"state: {consume_record.consume_state}"
                            )
                    except InsufficientBalanceError as e:
                        logger.warning(f"Insufficient balance for user {auth_ctx.user_id}: {e.message}")
                        # 发送余额不足通知给用户
                        insufficient_balance_event = {
                            "type": "insufficient_balance",
                            "data": {
                                "error_code": e.error_code,
                                "message": "Insufficient photon balance",
                                "message_cn": "光子余额不足，请充值后继续使用",
                                "details": e.details,
                                "action_required": "recharge",
                            },
                        }
                        await manager.send_personal_message(
                            json.dumps(insufficient_balance_event, ensure_ascii=False),
                            connection_id,
                        )
                        # 余额不足时不影响消息的显示，但需要通知用户
                    except Exception as e:
                        logger.error(f"Failed to create consume record: {e}", exc_info=True)
                        # 其他消费记录创建失败不影响主流程

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

                await db.commit()

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for topic {connection_id}")
        try:
            await db.rollback()
        except Exception:
            pass  # Rollback failure is not critical for disconnect
    except Exception as e:
        logger.error(f"An error occurred in WebSocket for topic {connection_id}: {e}")
        try:
            await db.rollback()
        except Exception as rollback_error:
            logger.error(f"Failed to rollback transaction: {rollback_error}")
    finally:
        manager.disconnect(connection_id)
