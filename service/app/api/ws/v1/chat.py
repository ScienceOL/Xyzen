import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.common.code.error_code import ErrCode, ErrCodeError
from app.core.chat import get_ai_response_stream
from app.core.chat.topic_generator import generate_and_update_topic_title
from app.core.consume import create_consume_for_chat
from app.infra.database import AsyncSessionLocal
from app.middleware.auth import AuthContext, get_auth_context_websocket
from app.models.citation import CitationCreate
from app.models.message import MessageCreate
from app.repos import CitationRepository, FileRepository, MessageRepository, SessionRepository, TopicRepository
from app.schemas.chat_events import ChatClientEventType, ChatEventType, ToolCallStatus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])


def extract_content_text(content: Any) -> str:
    """
    从不稳定的 content 中提取纯文本。
    支持 str 和 Google Vertex AI 的 list[dict] 格式。
    """
    if content is None:
        return ""

    # 情况 1: 普通字符串
    if isinstance(content, str):
        return content

    # 情况 2: 列表 (通常是 Vertex AI/Gemini 的多模态或带元数据的响应)
    if isinstance(content, list):
        text_parts = []
        for item in content:
            # 确保 item 是字典，且 type 为 text
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(item.get("text", ""))
        return "".join(text_parts)

    # 情况 3: 其他未知类型 (做兜底，防止报错)
    return str(content)


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
                "type": ChatEventType.TOOL_CALL_RESPONSE,
                "data": {"toolCallId": tool_call_id, "status": ToolCallStatus.FAILED, "error": "用户取消执行"},
            }
            await manager.send_personal_message(json.dumps(response), connection_id)
            # Persist a tool message for cancellation (failed)
            try:
                tool_message = MessageCreate(
                    role="tool",
                    content=json.dumps(
                        {
                            "event": ChatEventType.TOOL_CALL_RESPONSE,
                            "toolCallId": tool_call_id,
                            "status": ToolCallStatus.FAILED,
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
            "type": ChatEventType.TOOL_CALL_RESPONSE,
            "data": {"toolCallId": tool_call_id, "status": ToolCallStatus.EXECUTING},
        }
        await manager.send_personal_message(json.dumps(response), connection_id)

        # Extract stored context
        tool_calls = pending_info["tool_calls"]
        topic = pending_info["topic"]
        messages = pending_info["messages"]
        provider = pending_info["provider"]
        # message_id = pending_info["message_id"]
        # model = pending_info["model"]

        # Import necessary functions
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

        from app.core.chat.tools import execute_tool_calls
        from app.schemas.message import ChatMessage

        try:
            # Execute the tools using the same logic as immediate execution
            tool_results = await execute_tool_calls(message_repo.db, tool_calls, topic)

            # Send tool completion events for each tool call
            for tool_call in tool_calls:
                tc_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")
                result = tool_results.get(tc_id)
                if result:
                    # Format result for frontend display using the utility function
                    from app.core.chat.content_utils import format_tool_result_for_display

                    formatted_result = format_tool_result_for_display(result)
                    completion_event = {
                        "type": ChatEventType.TOOL_CALL_RESPONSE,
                        "data": {
                            "toolCallId": tc_id,
                            "status": ToolCallStatus.COMPLETED,
                            "result": formatted_result,
                        },
                    }
                    await manager.send_personal_message(json.dumps(completion_event), connection_id)

                    # Persist tool completion as a Message row for history
                    try:
                        tool_message = MessageCreate(
                            role="tool",
                            content=json.dumps(
                                {
                                    "event": ChatEventType.TOOL_CALL_RESPONSE,
                                    "toolCallId": tc_id,
                                    "status": ToolCallStatus.COMPLETED,
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
                # Extract clean result for AI consumption using the utility function
                from app.core.chat.content_utils import format_tool_result_for_ai

                result_content = format_tool_result_for_ai(result)
                logger.info(f"Processed tool result for AI: {result_content}")
                tool_result_messages.append(
                    ChatMessage(role="user", content=f"Tool execution result: {result_content}")
                )

            # Get final response from AI with tool results using streaming
            final_messages = messages + [assistant_tool_message] + tool_result_messages

            # Log the complete message history being sent to AI
            logger.info(f"Sending {len(final_messages)} messages to AI for final response:")
            for i, msg in enumerate(final_messages):
                logger.info(f"Message {i + 1}: role={msg.role}, content={msg.content[:200]}...")

            # Convert to LangChain messages
            langchain_messages = []
            for msg in final_messages:
                if msg.role == "system":
                    langchain_messages.append(SystemMessage(content=msg.content))
                elif msg.role == "user":
                    langchain_messages.append(HumanMessage(content=msg.content))
                elif msg.role == "assistant":
                    langchain_messages.append(AIMessage(content=msg.content))
                else:
                    langchain_messages.append(HumanMessage(content=f"{msg.role}: {msg.content}"))

            # Use streaming for the final AI response
            logger.info("Using streaming for final AI response after confirmed tool execution")

            # Create LangChain model from provider
            llm = provider.to_langchain_model()

            final_message_id = f"confirmed_stream_{int(asyncio.get_event_loop().time() * 1000)}"

            # Send streaming start event
            stream_start = {"type": ChatEventType.STREAMING_START, "data": {"id": final_message_id}}
            await manager.send_personal_message(json.dumps(stream_start), connection_id)

            # Stream the response
            final_content_chunks = []

            try:
                async for chunk in llm.astream(langchain_messages):
                    content = chunk.content
                    if content and isinstance(content, str):
                        final_content_chunks.append(content)
                        stream_chunk = {
                            "type": ChatEventType.STREAMING_CHUNK,
                            "data": {"id": final_message_id, "content": content},
                        }
                        await manager.send_personal_message(json.dumps(stream_chunk), connection_id)
            except Exception as e:
                logger.error(f"Error streaming from LangChain model: {e}")

            # End streaming
            final_full_content = "".join(final_content_chunks)
            if final_full_content.strip():
                stream_end = {
                    "type": ChatEventType.STREAMING_END,
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

        except Exception as e:
            logger.error(f"Error executing confirmed tools: {e}")
            error_response = {
                "type": ChatEventType.TOOL_CALL_RESPONSE,
                "data": {"toolCallId": tool_call_id, "status": ToolCallStatus.FAILED, "error": str(e)},
            }
            await manager.send_personal_message(json.dumps(error_response), connection_id)

            # Persist error tool message
            try:
                tool_message = MessageCreate(
                    role="tool",
                    content=json.dumps(
                        {
                            "event": ChatEventType.TOOL_CALL_RESPONSE,
                            "toolCallId": tool_call_id,
                            "status": ToolCallStatus.FAILED,
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
                message_type = data.get("type", ChatClientEventType.MESSAGE)

                # Handle tool call confirmation/cancellation
                if message_type == ChatClientEventType.TOOL_CALL_CONFIRM:
                    tool_call_id = data.get("data", {}).get("toolCallId")
                    if tool_call_id:
                        await handle_tool_call_confirmation(message_repo, connection_id, tool_call_id, True)
                    continue

                elif message_type == ChatClientEventType.TOOL_CALL_CANCEL:
                    tool_call_id = data.get("data", {}).get("toolCallId")
                    if tool_call_id:
                        await handle_tool_call_confirmation(message_repo, connection_id, tool_call_id, False)
                    continue

                # Handle regular chat messages
                message_text = data.get("message")
                file_ids = data.get("file_ids", [])
                context = data.get("context")
                logger.debug(f"Received context: {context}")

                if not message_text:
                    continue

                # 1. Save user message to the topic
                user_message_create = MessageCreate(role="user", content=message_text, topic_id=topic_id)
                user_message = await message_repo.create_message(user_message_create)

                # 2. Link files to the message if file_ids provided
                if file_ids:
                    file_repo = FileRepository(db)
                    await file_repo.update_files_message_id(
                        file_ids=file_ids,
                        message_id=user_message.id,
                        user_id=user,
                    )
                    # Flush to ensure file links are visible to subsequent queries
                    await db.flush()

                # 3. Send user message back to client with attachments
                user_message_with_files = await message_repo.get_message_with_files(user_message.id)

                if user_message_with_files:
                    await manager.send_personal_message(
                        user_message_with_files.model_dump_json(),
                        connection_id,
                    )
                else:
                    # Fallback if message fetch fails
                    logger.warning(f"Could not fetch message {user_message.id}, falling back to base message")
                    await manager.send_personal_message(
                        user_message.model_dump_json(),
                        connection_id,
                    )

                # 4. Send loading status
                loading_event = {"type": ChatEventType.LOADING, "data": {"message": "AI is thinking..."}}
                await manager.send_personal_message(
                    json.dumps(loading_event),
                    connection_id,
                )

                # === Pre-deduction / Balance Check ===
                # Deduct base cost upfront to check balance. This blocks users with insufficient balance.
                base_cost = 3
                pre_deducted_amount = 0

                try:
                    access_key = None
                    if auth_ctx.auth_provider.lower() == "bohr_app":
                        access_key = auth_ctx.access_token

                    await create_consume_for_chat(
                        db=db,
                        user_id=auth_ctx.user_id,
                        auth_provider=auth_ctx.auth_provider,
                        amount=base_cost,
                        access_key=access_key,
                        session_id=session_id,
                        topic_id=topic_id,
                        message_id=user_message.id,
                        description="Chat base cost (pre-deduction)",
                    )
                    pre_deducted_amount = base_cost

                except ErrCodeError as e:
                    if e.code == ErrCode.INSUFFICIENT_BALANCE:
                        logger.warning(f"Insufficient balance for user {auth_ctx.user_id}: {e}")
                        insufficient_balance_event = {
                            "type": "insufficient_balance",
                            "data": {
                                "error_code": "INSUFFICIENT_BALANCE",
                                "message": "Insufficient photon balance",
                                "message_cn": "光子余额不足，请充值后继续使用",
                                "details": e.as_dict(),
                                "action_required": "recharge",
                            },
                        }
                        await manager.send_personal_message(
                            json.dumps(insufficient_balance_event, ensure_ascii=False),
                            connection_id,
                        )
                        continue
                except Exception as e:
                    logger.error(f"Pre-deduction failed: {e}")
                    # Fail open for other errors to avoid blocking chat on system glitches

                topic_refreshed = await topic_repo.get_topic_with_details(topic_id)
                if not topic_refreshed:
                    logger.error(f"Topic {topic_id} not found after user message creation")
                    continue

                # === Automatic Topic Renaming ===
                # Trigger background title generation if this is a new conversation.
                # We do this BEFORE the AI response loop to minimize latency.
                # The generator will use the user's message (just saved) to create the title.
                if topic_refreshed.name in ["新的聊天", "New Chat", "New Topic"]:
                    # Check message count to ensure it's the start of conversation.
                    # Since we just saved the user message, if it's the first exchange,
                    # the count might be very low (e.g. 1 if no system msg, or 2 if system msg exists).
                    logger.debug(f"Checking message count for topic {topic_id}")
                    msgs = await message_repo.get_messages_by_topic(topic_id, limit=5)
                    # Relaxed condition: usually <= 3 messages (System + User) for a fresh start
                    if len(msgs) <= 3:
                        asyncio.create_task(
                            generate_and_update_topic_title(
                                message_text,
                                topic_id,
                                session_id,
                                auth_ctx.user_id,
                                manager,
                                connection_id,
                            )
                        )

                # Stream AI response
                ai_message_id = None
                ai_message_obj = None
                full_content = ""
                citations_data = []  # Track citations to save after message is created
                # generated_file_ids_list = []  # No longer needed as we link immediately

                # Token usage tracking
                input_tokens = 0
                output_tokens = 0
                total_tokens = 0
                generated_files_count = 0

                async for stream_event in get_ai_response_stream(
                    db, message_text, topic_refreshed, user, None, manager, connection_id, context
                ):
                    logger.debug(f"Received stream event: {stream_event['type']}")

                    # Track message ID and content for database saving
                    if stream_event["type"] == ChatEventType.STREAMING_START:
                        ai_message_id = stream_event["data"]["id"]

                        # Create DB message early
                        if not ai_message_obj:
                            ai_message_create = MessageCreate(role="assistant", content="", topic_id=topic_id)
                            ai_message_obj = await message_repo.create_message(ai_message_create)

                        # Forward streaming_start to frontend
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)
                    elif stream_event["type"] == ChatEventType.STREAMING_CHUNK and ai_message_id:
                        chunk_content = stream_event["data"]["content"]
                        text_content = extract_content_text(chunk_content)
                        full_content += text_content
                        # Forward streaming_chunk to frontend with only text content
                        stream_event["data"]["content"] = text_content
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)
                    elif stream_event["type"] == ChatEventType.STREAMING_END:
                        full_content = stream_event["data"].get("content", full_content)
                        # Forward streaming_end to frontend
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)
                    elif stream_event["type"] == ChatEventType.TOKEN_USAGE:
                        # Capture token usage information
                        token_data = stream_event["data"]
                        input_tokens = token_data.get("input_tokens", 0)
                        output_tokens = token_data.get("output_tokens", 0)
                        total_tokens = token_data.get("total_tokens", 0)
                        logger.info(
                            f"Captured token usage: input={input_tokens}, output={output_tokens}, total={total_tokens}"
                        )
                        # Forward token usage to frontend (optional, for debugging/transparency)
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)
                    elif stream_event["type"] == ChatEventType.TOOL_CALL_REQUEST:
                        # Forward tool call request to frontend
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
                            await message_repo.create_message_in_isolated_transaction(tool_message)
                        except Exception as e:
                            logger.warning(f"Failed to persist tool call request message: {e}")
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)

                        continue
                    elif stream_event["type"] == ChatEventType.TOOL_CALL_RESPONSE:
                        # Handle tool call response
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
                            await message_repo.create_message_in_isolated_transaction(tool_message)
                        except Exception as e:
                            logger.warning(f"Failed to persist tool call response message: {e}")
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)
                        continue
                    elif stream_event["type"] == ChatEventType.MESSAGE:
                        # Handle non-streaming response
                        ai_message_id = stream_event["data"]["id"]
                        full_content = stream_event["data"]["content"]

                        if not ai_message_obj:
                            ai_message_create = MessageCreate(role="assistant", content=full_content, topic_id=topic_id)  # noqa: E501
                            ai_message_obj = await message_repo.create_message(ai_message_create)
                        else:
                            ai_message_obj.content = full_content
                            db.add(ai_message_obj)

                        # Forward message to frontend
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)
                    elif stream_event["type"] == ChatEventType.SEARCH_CITATIONS:
                        # Capture citations data to save to database after message is created
                        citations = stream_event["data"].get("citations", [])
                        if citations:
                            logger.info(f"Captured {len(citations)} citations to save to database")
                            citations_data.extend(citations)
                        # Forward citations to frontend
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)
                    elif stream_event["type"] == ChatEventType.GENERATED_FILES:
                        # Capture generated file IDs to link to the message
                        files_data = stream_event["data"].get("files", [])
                        file_ids = [f["id"] for f in files_data]
                        generated_files_count += len(file_ids)

                        # Ensure message exists
                        if not ai_message_obj:
                            ai_message_create = MessageCreate(role="assistant", content="", topic_id=topic_id)
                            ai_message_obj = await message_repo.create_message(ai_message_create)

                        if file_ids:
                            logger.info(f"Captured {len(file_ids)} generated files")
                            # Link immediately
                            try:
                                file_repo = FileRepository(db)
                                # Convert string IDs to UUIDs
                                file_uuids = [UUID(fid) for fid in file_ids]
                                await file_repo.update_files_message_id(file_uuids, ai_message_obj.id, user)
                                logger.info(f"Linked {len(file_uuids)} generated files to message {ai_message_obj.id}")
                            except Exception as e:
                                logger.error(f"Failed to link generated files: {e}")

                        # Forward to frontend
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)
                    elif stream_event["type"] == ChatEventType.ERROR:
                        full_content = stream_event["data"]["error"]
                        # Forward error to frontend
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)
                        break
                    else:
                        # Forward any other event types
                        await manager.send_personal_message(json.dumps(stream_event), connection_id)

                # Save AI message to database
                if ai_message_obj:
                    # Update content if needed
                    if full_content and ai_message_obj.content != full_content:
                        ai_message_obj.content = full_content
                        db.add(ai_message_obj)
                        # await db.flush()

                    ai_message = ai_message_obj

                    # No need to link files here anymore as they are linked immediately

                    # Save citations to database if any
                    if citations_data:
                        try:
                            citation_repo = CitationRepository(db)
                            citation_creates = []
                            for citation in citations_data:
                                citation_create = CitationCreate(
                                    message_id=ai_message.id,
                                    url=citation.get("url", ""),
                                    title=citation.get("title"),
                                    cited_text=citation.get("cited_text"),
                                    start_index=citation.get("start_index"),
                                    end_index=citation.get("end_index"),
                                    search_queries=citation.get("search_queries"),
                                )
                                citation_creates.append(citation_create)

                            saved_citations = await citation_repo.bulk_create_citations(citation_creates)
                            logger.info(f"Saved {len(saved_citations)} citations for message {ai_message.id}")
                        except Exception as e:
                            logger.error(f"Failed to save citations for message {ai_message.id}: {e}")

                    # Update topic's updated_at timestamp again after AI response
                    await topic_repo.update_topic_timestamp(topic_refreshed.id)

                    # === 创建消费记录 (Final Settlement) ===
                    try:
                        # Image generation cost (e.g., 10 points per image)
                        IMAGE_GENERATION_COST = 10
                        generated_files_cost = generated_files_count * IMAGE_GENERATION_COST

                        # 计算总消费金额 - 基于真实的 token 使用量
                        # Pricing formula: base_cost + token_based_cost + generated_files_cost
                        # Token pricing: input tokens cost less, output tokens cost more
                        # Example: 1 point per 1000 input tokens, 3 points per 1000 output tokens
                        if total_tokens > 0:
                            # Use real token counts for accurate billing
                            token_cost = (input_tokens * 1 + output_tokens * 3) // 1000
                            total_cost = base_cost + token_cost + generated_files_cost
                            logger.info(
                                f"Token-based billing: input={input_tokens}, output={output_tokens}, "
                                f"total={total_tokens}, cost={token_cost}, "
                                f"files={generated_files_count}, file_cost={generated_files_cost}, "
                                f"total_cost={total_cost}"
                            )
                        else:
                            # Fallback to character-based estimation if token info not available
                            total_cost = base_cost + len(full_content) // 100 + generated_files_cost
                            logger.warning(
                                f"Token usage not available, using character-based estimation: "
                                f"content_length={len(full_content)}, "
                                f"files={generated_files_count}, file_cost={generated_files_cost}, "
                                f"total_cost={total_cost}"
                            )

                        # 计算剩余需要扣除的金额
                        remaining_amount = total_cost - pre_deducted_amount

                        if remaining_amount > 0:
                            # Log auth context for debugging
                            logger.info(
                                f"About to create consume record - user_id: '{auth_ctx.user_id}', "
                                f"auth_provider: '{auth_ctx.auth_provider}', "
                                f"user_id type: {type(auth_ctx.user_id)}"
                            )

                            # 仅在 bohr_app 时传递 access_token
                            access_key = None
                            if auth_ctx.auth_provider.lower() == "bohr_app":
                                access_key = auth_ctx.access_token

                            consume_record = await create_consume_for_chat(
                                db=db,
                                user_id=auth_ctx.user_id,
                                auth_provider=auth_ctx.auth_provider,
                                amount=remaining_amount,
                                access_key=access_key,
                                session_id=session_id,
                                topic_id=topic_id,
                                message_id=ai_message.id,
                                description=f"Chat message consume (settlement): {remaining_amount} points",
                                input_tokens=input_tokens if total_tokens > 0 else None,
                                output_tokens=output_tokens if total_tokens > 0 else None,
                                total_tokens=total_tokens if total_tokens > 0 else None,
                            )
                            logger.info(
                                f"Settlement consume record created: {consume_record.id}, "
                                f"user: {auth_ctx.user_id}, amount: {remaining_amount}, "
                                f"tokens: input={input_tokens}, output={output_tokens}, total={total_tokens}, "
                                f"state: {consume_record.consume_state}"
                            )
                    except ErrCodeError as e:
                        # 结算阶段的余额不足，记录日志并通知用户，但不影响已生成的消息
                        if e.code == ErrCode.INSUFFICIENT_BALANCE:
                            logger.warning(f"Insufficient balance for settlement (user {auth_ctx.user_id}): {e}")
                            insufficient_balance_event = {
                                "type": "insufficient_balance",
                                "data": {
                                    "error_code": "INSUFFICIENT_BALANCE",
                                    "message": "Insufficient photon balance for settlement",
                                    "message_cn": "光子余额不足，部分费用扣除失败",
                                    "details": e.as_dict(),
                                    "action_required": "recharge",
                                },
                            }
                            await manager.send_personal_message(
                                json.dumps(insufficient_balance_event, ensure_ascii=False),
                                connection_id,
                            )
                        else:
                            logger.error(f"Consume record error: {e}")
                    except Exception as e:
                        logger.error(f"Failed to create settlement consume record: {e}", exc_info=True)

                    # Send final message confirmation with real database ID
                    final_message_event = {
                        "type": ChatEventType.MESSAGE_SAVED,
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
        logger.error(f"An error occurred in WebSocket for topic {connection_id}: {e}", exc_info=True)
        try:
            await db.rollback()
        except Exception as rollback_error:
            logger.error(f"Failed to rollback transaction: {rollback_error}")
    finally:
        manager.disconnect(connection_id)
