"""
Message history loading for LangChain conversations.

Handles loading and converting database messages to LangChain-compatible format,
including multimodal content (images, PDFs, audio).
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.messages.tool import ToolCall, ToolMessage
from sqlmodel.ext.asyncio.session import AsyncSession

from app.schemas.chat_event_types import ChatEventType

if TYPE_CHECKING:
    from app.models.topic import Topic as TopicModel

logger = logging.getLogger(__name__)


async def load_conversation_history(db: AsyncSession, topic: "TopicModel") -> list[BaseMessage]:
    """
    Load historical messages for the topic and map to LangChain message types.

    Only user/assistant/system/tool messages are included. Supports multimodal messages:
    fetches file attachments and converts them to base64-encoded content for vision/audio models.

    Args:
        db: Database session
        topic: Topic model containing the conversation

    Returns:
        List of LangChain BaseMessage objects ready for agent consumption
    """
    try:
        from app.repos.message import MessageRepository

        message_repo = MessageRepository(db)
        messages = await message_repo.get_messages_by_topic(topic.id, order_by_created=True)

        num_tool_calls = 0
        history: list[BaseMessage] = []

        for message in messages:
            role = (message.role or "").lower()
            content = message.content or ""

            if role == "user":
                history.append(await _build_user_message(db, message, content))
            elif role == "assistant":
                history.append(await _build_assistant_message(db, message, content))
            elif role == "system":
                history.append(SystemMessage(content=content))
            elif role == "tool":
                tool_messages = _build_tool_messages(content, history, num_tool_calls)
                num_tool_calls = tool_messages[1]
                if tool_messages[0]:
                    history.append(tool_messages[0])
            # Skip unknown roles

        logger.info(f"Length of history: {len(history)}")
        return history

    except Exception as e:
        logger.warning(f"Failed to load DB chat history for topic {getattr(topic, 'id', None)}: {e}")
        return []


async def _build_user_message(db: AsyncSession, message: Any, content: str) -> HumanMessage:
    """Build a HumanMessage with optional multimodal content."""
    from app.core.chat.multimodal import process_message_files

    try:
        logger.debug(f"Checking files for message {message.id}")
        file_contents = await process_message_files(db, message.id)
        logger.debug(f"Message {message.id} has {len(file_contents) if file_contents else 0} file contents")

        if file_contents:
            # Multimodal message: combine text and file content
            multimodal_content: list[dict[str, Any]] = [{"type": "text", "text": content}]
            multimodal_content.extend(file_contents)

            for idx, item in enumerate(file_contents):
                item_type = item.get("type")
                if item_type == "image_url":
                    logger.debug(f"File content {idx}: type={item_type}, has image_url={bool(item.get('image_url'))}")
                elif item_type == "text":
                    text_preview = item.get("text", "")[:100]
                    logger.debug(f"File content {idx}: type={item_type}, text_preview='{text_preview}'")
                else:
                    logger.debug(f"File content {idx}: type={item_type}")

            logger.info(f"Loaded multimodal message {message.id} with {len(file_contents)} attachments")
            return HumanMessage(content=multimodal_content)  # type: ignore

        # Text-only message
        logger.debug(f"Message {message.id} has no file attachments, loading as text-only")
        return HumanMessage(content=content)

    except Exception as e:
        # If file processing fails, fall back to text-only
        logger.error(f"Failed to process files for message {message.id}: {e}", exc_info=True)
        return HumanMessage(content=content)


async def _build_assistant_message(db: AsyncSession, message: Any, content: str) -> AIMessage:
    """Build an AIMessage with optional multimodal content (e.g., generated images)."""
    from app.core.chat.multimodal import process_message_files

    # Extract agent_metadata if present
    additional_kwargs: dict[str, Any] = {}
    if hasattr(message, "agent_metadata") and message.agent_metadata:
        additional_kwargs["agent_state"] = message.agent_metadata

    try:
        file_contents = await process_message_files(db, message.id)
        if file_contents:
            logger.debug("Successfully processed files for message")
            # Combine text content with file content
            multimodal_content: list[dict[str, Any]] = []
            if content:
                multimodal_content.append({"type": "text", "text": content})
            multimodal_content.extend(file_contents)
            return AIMessage(content=multimodal_content, additional_kwargs=additional_kwargs)  # type: ignore

        return AIMessage(content=content, additional_kwargs=additional_kwargs)

    except Exception as e:
        logger.error(f"Failed to process files for assistant message {message.id}: {e}", exc_info=True)
        return AIMessage(content=content, additional_kwargs=additional_kwargs)


def _build_tool_messages(
    content: str, history: list[BaseMessage], num_tool_calls: int
) -> tuple[BaseMessage | None, int]:
    """
    Build tool-related messages from stored JSON content.

    Tool messages are stored as JSON with either TOOL_CALL_REQUEST or TOOL_CALL_RESPONSE event.
    Multiple tool calls from the same LLM turn are aggregated into a single AIMessage.

    Args:
        content: JSON string of the tool message content
        history: Current message history (may be modified for aggregating tool calls)
        num_tool_calls: Current count of pending tool calls

    Returns:
        Tuple of (message to add or None, updated tool call count)
    """
    try:
        formatted_content = json.loads(content)

        message: BaseMessage

        if formatted_content.get("event") == ChatEventType.TOOL_CALL_REQUEST:
            tool_call: ToolCall = {
                "name": formatted_content["name"],
                "args": formatted_content["arguments"],
                "id": formatted_content["id"],
            }

            if num_tool_calls == 0:
                # First tool call - create new AIMessage
                message = AIMessage(content=[], tool_calls=[tool_call])
                return message, num_tool_calls + 1
            else:
                # Subsequent tool call - append to existing AIMessage
                if history and isinstance(history[-1], AIMessage) and hasattr(history[-1], "tool_calls"):
                    history[-1].tool_calls.append(tool_call)
                return None, num_tool_calls + 1

        elif formatted_content.get("event") == ChatEventType.TOOL_CALL_RESPONSE:
            message = ToolMessage(
                content=formatted_content["result"],
                tool_call_id=formatted_content["toolCallId"],
            )
            return message, num_tool_calls - 1

    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to parse tool message content: {e}")

    return None, num_tool_calls
