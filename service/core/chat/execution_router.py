"""
Chat Execution Router

Routes chat messages to the appropriate execution engine based on agent type.
Handles both regular agents (standard chat completion) and graph agents (LangGraph execution).
"""

import logging
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from core.agent_type_detector import AgentTypeDetector
from core.chat.graph_state_converter import GraphStateConverter
from core.chat.langgraph import execute_graph_agent_stream
from models.agent import Agent
from models.graph import GraphAgent
from models.topic import Topic as TopicModel
from schemas.chat_events import ChatEventType, ProcessingStatus

if TYPE_CHECKING:
    from handler.ws.v1.chat import ConnectionManager

logger = logging.getLogger(__name__)


class ChatExecutionRouter:
    """
    Routes chat execution to appropriate handler based on agent type.
    """

    def __init__(self, db: AsyncSession, enable_graph_streaming_chunks: bool = False, graph_chunk_size: int = 100):
        self.db = db
        self.agent_detector = AgentTypeDetector(db)
        self.state_converter = GraphStateConverter(db)
        self.enable_graph_streaming_chunks = enable_graph_streaming_chunks
        self.graph_chunk_size = graph_chunk_size

    async def route_execution_stream(
        self,
        message_text: str,
        topic: TopicModel,
        user_id: str,
        agent_id: UUID | None = None,
        connection_manager: "ConnectionManager | None" = None,
        connection_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Route message execution to the appropriate agent handler with streaming support.

        Args:
            message_text: The user's message
            topic: The conversation topic
            user_id: The user ID
            agent_id: Optional agent ID override
            connection_manager: WebSocket connection manager
            connection_id: Connection ID for WebSocket

        Yields:
            Chat event dictionaries for streaming response
        """
        # If no agent_id provided, fall back to regular chat
        if agent_id is None:
            logger.info("No agent specified, using regular chat completion")
            async for event in self._execute_regular_agent_stream(
                message_text, topic, user_id, None, connection_manager, connection_id
            ):
                yield event
            return

        try:
            # Detect agent type
            agent_with_type = await self.agent_detector.get_agent_with_type(agent_id, user_id)

            if agent_with_type is None:
                logger.warning(f"Agent {agent_id} not found or unauthorized for user {user_id}")
                yield {
                    "type": ChatEventType.ERROR,
                    "data": {
                        "error": (
                            "I'm sorry, but I couldn't find the specified agent or you don't have permission to use it."
                        )
                    },
                }
                return

            agent, agent_type = agent_with_type

            # Route to appropriate execution engine
            if agent_type == "graph":
                logger.info(f"Routing to graph agent execution for agent {agent_id}")
                async for event in self._execute_graph_agent_stream(
                    message_text,
                    topic,
                    user_id,
                    agent,  # type: ignore
                    connection_manager,
                    connection_id,
                ):
                    yield event
            elif agent_type == "builtin":
                logger.info(f"Routing to builtin agent execution for agent {agent_id}")
                async for event in self._execute_builtin_agent_stream(
                    message_text,
                    topic,
                    user_id,
                    agent,  # type: ignore
                    connection_manager,
                    connection_id,
                ):
                    yield event
            else:
                logger.info(f"Routing to regular agent execution for agent {agent_id}")
                async for event in self._execute_regular_agent_stream(
                    message_text,
                    topic,
                    user_id,
                    agent,  # type: ignore
                    connection_manager,
                    connection_id,
                ):
                    yield event

        except Exception as e:
            logger.error(f"Failed to route execution for agent {agent_id}: {e}")
            yield {
                "type": ChatEventType.ERROR,
                "data": {"error": f"I'm sorry, but I encountered an error while processing your request: {e}"},
            }

    async def _execute_graph_agent_stream(
        self,
        message_text: str,
        topic: TopicModel,
        user_id: str,
        agent: GraphAgent,
        connection_manager: "ConnectionManager | None" = None,
        connection_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Execute a graph agent - simplified router that delegates to LangGraph.

        This is a thin routing layer that:
        1. Converts chat context to graph input state
        2. Calls LangGraph execution directly
        3. Passes through all events unchanged
        """
        try:
            # Convert chat context to graph input state
            input_state = await self.state_converter.chat_to_graph_state(message_text, topic, user_id)

            logger.debug(f"Input state: {input_state}")
            async for event in execute_graph_agent_stream(self.db, agent.id, input_state, user_id):
                yield event

        except Exception as e:
            # Only handle router-level errors (agent not found, permissions, conversion errors)
            logger.error(f"Failed to route to graph agent {agent.id}: {e}")
            yield {
                "type": ChatEventType.ERROR,
                "data": {"error": f"I'm sorry, but I encountered an error while routing to the graph agent: {e}"},
            }

    async def _execute_builtin_agent_stream(
        self,
        message_text: str,
        topic: TopicModel,
        user_id: str,
        agent: Any,  # BaseBuiltinGraphAgent instance
        connection_manager: "ConnectionManager | None" = None,
        connection_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Execute a builtin graph agent with streaming support.

        Args:
            message_text: The user's message
            topic: The conversation topic
            user_id: The user ID
            agent: The builtin graph agent instance
            connection_manager: WebSocket connection manager
            connection_id: Connection ID for WebSocket

        Yields:
            Chat event dictionaries for streaming response
        """
        try:
            import asyncio
            from datetime import datetime, timezone

            from core.chat.langgraph import GraphState
            from handler.builtin_agents.base_graph_agent import BaseBuiltinGraphAgent

            if not isinstance(agent, BaseBuiltinGraphAgent):
                raise ValueError(f"Expected BaseBuiltinGraphAgent, got {type(agent)}")

            # Yield processing start
            yield {"type": ChatEventType.PROCESSING, "data": {"status": ProcessingStatus.PREPARING_REQUEST}}

            # Build the graph for execution
            graph = agent.build_graph()

            # Create initial state for the builtin agent
            initial_state = GraphState(
                messages=[],
                current_step="start",
                execution_context={},
                user_input=message_text,
                final_output="",
                error=None,
            )

            # Yield execution start
            message_id = f"builtin_{int(asyncio.get_event_loop().time() * 1000)}"
            yield {"type": ChatEventType.STREAMING_START, "data": {"id": message_id}}

            # Execute the graph
            logger.info(f"Executing builtin agent graph for: {agent.name}")
            result = await graph.ainvoke(initial_state)

            # Debug the result structure
            logger.info(f"LangGraph result type: {type(result)}")
            logger.info(f"LangGraph result attributes: {dir(result)}")
            if hasattr(result, "__dict__"):
                logger.info(f"LangGraph result dict: {result.__dict__}")

            # Extract the final output - try multiple approaches
            response_text = None

            # Try final_output attribute (for dict result)
            if isinstance(result, dict) and "final_output" in result and result["final_output"]:
                response_text = result["final_output"]
                logger.info(f"Got response from final_output: {response_text[:100]}...")

            # Try messages attribute (for dict result)
            elif isinstance(result, dict) and "messages" in result and result["messages"]:
                last_message = result["messages"][-1]
                if hasattr(last_message, "content"):
                    response_text = last_message.content
                    logger.info(f"Got response from messages[0].content: {response_text[:100]}...")
                else:
                    response_text = str(last_message)
                    logger.info(f"Got response from str(messages[0]): {response_text[:100]}...")

            # Try accessing as dict
            elif isinstance(result, dict):
                if "final_output" in result and result["final_output"]:
                    response_text = result["final_output"]
                    logger.info(f"Got response from dict['final_output']: {response_text[:100]}...")
                elif "messages" in result and result["messages"]:
                    last_message = result["messages"][-1]
                    if hasattr(last_message, "content"):
                        response_text = last_message.content
                    else:
                        response_text = str(last_message)
                    logger.info(f"Got response from dict['messages']: {response_text[:100]}...")

            # Fallback
            if not response_text:
                response_text = "I completed the task, but no output was generated."
                logger.warning(f"Could not extract output from result: {result}")

            logger.info(f"Builtin agent executed successfully with output length: {len(response_text)}")

            # Stream the response (optionally chunked for large responses)
            if self.enable_graph_streaming_chunks and len(response_text) > self.graph_chunk_size:
                for i in range(0, len(response_text), self.graph_chunk_size):
                    chunk = response_text[i : i + self.graph_chunk_size]  # noqa: E203
                    yield {"type": ChatEventType.STREAMING_CHUNK, "data": {"id": message_id, "content": chunk}}
            else:
                yield {"type": ChatEventType.STREAMING_CHUNK, "data": {"id": message_id, "content": response_text}}

            # End streaming
            yield {
                "type": ChatEventType.STREAMING_END,
                "data": {
                    "id": message_id,
                    "content": response_text,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            }

        except Exception as e:
            logger.error(f"Failed to execute builtin agent {agent}: {e}")
            yield {
                "type": ChatEventType.ERROR,
                "data": {"error": f"I'm sorry, but I encountered an error while executing the builtin agent: {e}"},
            }

    async def _execute_regular_agent_stream(
        self,
        message_text: str,
        topic: TopicModel,
        user_id: str,
        agent: Agent | None,
        connection_manager: "ConnectionManager | None" = None,
        connection_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Execute a regular agent with streaming support.

        Args:
            message_text: The user's message
            topic: The conversation topic
            user_id: The user ID
            agent: The regular agent instance (None for default chat)
            connection_manager: WebSocket connection manager
            connection_id: Connection ID for WebSocket

        Yields:
            Chat event dictionaries for streaming response
        """
        try:
            # Import here to avoid circular imports
            from core.chat.langchain import get_ai_response_stream_langchain_legacy

            # Use the existing regular agent streaming logic
            async for event in get_ai_response_stream_langchain_legacy(
                self.db, message_text, topic, user_id, agent, connection_manager, connection_id
            ):
                yield event

        except Exception as e:
            logger.error(f"Failed to execute regular agent: {e}")
            yield {
                "type": ChatEventType.ERROR,
                "data": {"error": f"I'm sorry, but I encountered an error while processing your request: {e}"},
            }


async def get_ai_response_stream(
    db: AsyncSession,
    message_text: str,
    topic: TopicModel,
    user_id: str,
    connection_manager: "ConnectionManager | None" = None,
    connection_id: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Gets a streaming response using the execution router.
    Routes to appropriate agent handler based on agent type.
    """
    try:
        # Import here to avoid circular imports
        from repo.session import SessionRepository

        # Get agent_id from session
        session_repo = SessionRepository(db)
        session = await session_repo.get_session_by_id(topic.session_id)
        agent_id = session.agent_id if session else None

        # Convert UUID back to builtin agent string ID if applicable
        builtin_agent_id = None
        if agent_id is not None:
            from models.sessions import uuid_to_builtin_agent_id

            builtin_agent_id = uuid_to_builtin_agent_id(agent_id)

        # Route execution based on agent type
        router = ChatExecutionRouter(db)
        # For builtin agents, pass the UUID but tell the router about the builtin ID
        final_agent_id = agent_id if builtin_agent_id is None else agent_id
        async for event in router.route_execution_stream(
            message_text, topic, user_id, final_agent_id, connection_manager, connection_id
        ):
            yield event

    except Exception as e:
        logger.error(f"Failed to get AI response stream: {e}")
        yield {
            "type": ChatEventType.ERROR,
            "data": {"error": f"I'm sorry, but I encountered an error while processing your request: {e}"},
        }
