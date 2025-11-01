"""
Graph State Conversion Utilities

Handles conversion between regular chat messages and graph agent state formats.
"""

import logging
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from sqlmodel.ext.asyncio.session import AsyncSession

from models.graph import GraphExecutionResult
from models.topic import Topic as TopicModel
from repo.message import MessageRepository

logger = logging.getLogger(__name__)


class GraphStateConverter:
    """Converts between chat format and graph state format."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def chat_to_graph_state(self, message_text: str, topic: TopicModel, user_id: str) -> dict[str, Any]:
        """
        Convert chat message and history to graph agent input state.

        Args:
            message_text: The current user message
            topic: The topic/conversation context
            user_id: The user ID

        Returns:
            Dictionary with graph agent input state
        """
        try:
            # Load conversation history
            message_repo = MessageRepository(self.db)
            history_messages = await message_repo.get_messages_by_topic(topic.id, order_by_created=True)

            # Convert to LangChain BaseMessage format expected by graph agents
            messages: list[BaseMessage] = []
            for msg in history_messages:
                # Convert based on role to appropriate LangChain message type
                if msg.role == "system":
                    messages.append(SystemMessage(content=msg.content))
                elif msg.role == "user":
                    messages.append(HumanMessage(content=msg.content))
                elif msg.role == "assistant":
                    messages.append(AIMessage(content=msg.content))
                else:
                    # For other roles (like "tool"), treat as human message
                    messages.append(HumanMessage(content=msg.content))

            # Create graph input state
            input_state = {
                "user_input": message_text,
                "messages": messages,
                "current_step": "start",
                "final_output": "",
                "execution_context": {
                    "user_id": user_id,
                    "topic_id": str(topic.id),
                    "session_id": str(topic.session_id) if topic.session_id else None,
                },
            }

            logger.info(f"Converted chat to graph state for topic {topic.id}")
            return input_state

        except Exception as e:
            logger.error(f"Failed to convert chat to graph state: {e}")
            # Return minimal state on error with proper message format
            return {
                "user_input": message_text,
                "messages": [HumanMessage(content=message_text)],  # At least include current message
                "current_step": "start",
                "final_output": "",
                "execution_context": {
                    "user_id": user_id,
                },
            }

    def graph_result_to_message(self, result: GraphExecutionResult) -> str:
        """
        Extract response message from graph execution result.

        Args:
            result: The graph execution result

        Returns:
            Response text to send back to user
        """
        try:
            if not result.success:
                error_msg = result.error_message or "Graph agent execution failed"
                logger.error(f"Graph execution failed: {error_msg}")
                return f"I apologize, but I encountered an error: {error_msg}"

            # Try to extract final output from the result
            final_state = result.final_state or {}

            # Look for common output fields
            if "final_output" in final_state and final_state["final_output"]:
                return str(final_state["final_output"])

            # Look for response in messages
            if "messages" in final_state and final_state["messages"]:
                messages = final_state["messages"]
                if isinstance(messages, list) and messages:
                    last_message = messages[-1]
                    if isinstance(last_message, dict) and "content" in last_message:
                        return str(last_message["content"])
                    elif isinstance(last_message, str):
                        return last_message

            # Look for any text response in the final state
            if "response" in final_state:
                return str(final_state["response"])

            # If no clear output, provide a generic success message
            logger.warning(f"Graph execution succeeded but no clear output found in final_state: {final_state}")
            return "The task has been completed successfully."

        except Exception as e:
            logger.error(f"Failed to extract message from graph result: {e}")
            return f"I completed the task, but encountered an error formatting the response: {e}"

    def prepare_graph_context(self, topic: TopicModel, user_id: str) -> dict[str, Any]:
        """
        Prepare additional context for graph execution.

        Args:
            topic: The topic/conversation context
            user_id: The user ID

        Returns:
            Context dictionary for graph execution
        """
        return {
            "topic_name": topic.name if hasattr(topic, "name") and topic.name else "Chat",
            "user_id": user_id,
            "topic_id": str(topic.id),
            "session_id": str(topic.session_id) if topic.session_id else None,
        }
