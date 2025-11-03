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
from core.chat.langgraph import execute_graph_agent_sync
from models.agent import Agent
from models.graph import GraphAgent, GraphExecutionResult
from models.topic import Topic as TopicModel
from schemas.chat_events import ChatEventType

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

    async def route_execution(
        self,
        message_text: str,
        topic: TopicModel,
        user_id: str,
        agent_id: UUID | None = None,
    ) -> str:
        """
        Route message execution to the appropriate agent handler.

        Args:
            message_text: The user's message
            topic: The conversation topic
            user_id: The user ID
            agent_id: Optional agent ID override

        Returns:
            AI response string
        """
        # If no agent_id provided, fall back to regular chat
        if agent_id is None:
            logger.info("No agent specified, using regular chat completion")
            return await self._execute_regular_agent(message_text, topic, user_id, None)

        try:
            # Detect agent type
            agent_with_type = await self.agent_detector.get_agent_with_type(agent_id, user_id)

            if agent_with_type is None:
                logger.warning(f"Agent {agent_id} not found or unauthorized for user {user_id}")
                return "I'm sorry, but I couldn't find the specified agent or you don't have permission to use it."

            agent, agent_type = agent_with_type

            # Route to appropriate execution engine
            if agent_type == "graph":
                logger.info(f"Routing to graph agent execution for agent {agent_id}")
                return await self._execute_graph_agent(message_text, topic, user_id, agent)  # type: ignore
            elif agent_type == "builtin":
                logger.info(f"Routing to builtin agent execution for agent {agent_id}")
                return await self._execute_builtin_agent(message_text, topic, user_id, agent)  # type: ignore
            else:
                logger.info(f"Routing to regular agent execution for agent {agent_id}")
                return await self._execute_regular_agent(message_text, topic, user_id, agent)  # type: ignore

        except Exception as e:
            logger.error(f"Failed to route execution for agent {agent_id}: {e}")
            return f"I'm sorry, but I encountered an error while processing your request: {e}"

    async def _execute_graph_agent(
        self,
        message_text: str,
        topic: TopicModel,
        user_id: str,
        agent: GraphAgent,
    ) -> str:
        """
        Execute a graph agent with the provided message.

        Args:
            message_text: The user's message
            topic: The conversation topic
            user_id: The user ID
            agent: The graph agent instance

        Returns:
            AI response string
        """
        try:
            # Convert chat context to graph input state
            input_state = await self.state_converter.chat_to_graph_state(message_text, topic, user_id)

            # Execute the graph agent
            result: GraphExecutionResult = await execute_graph_agent_sync(self.db, agent.id, input_state, user_id)

            # Convert result back to chat message
            response_text = self.state_converter.graph_result_to_message(result)

            if result.success:
                logger.info(f"Graph agent executed successfully in {result.execution_time_ms}ms")
            else:
                logger.error(f"Graph agent execution failed: {result.error_message}")

            return response_text

        except Exception as e:
            logger.error(f"Failed to execute graph agent {agent.id}: {e}")
            return f"I'm sorry, but I encountered an error while executing the graph agent: {e}"

    async def _execute_builtin_agent(
        self,
        message_text: str,
        topic: TopicModel,
        user_id: str,
        agent: Any,  # BaseBuiltinGraphAgent instance
    ) -> str:
        """
        Execute a builtin graph agent with the provided message.

        Args:
            message_text: The user's message
            topic: The conversation topic
            user_id: The user ID
            agent: The builtin graph agent instance

        Returns:
            AI response string
        """
        try:
            from handler.builtin_agents.base_graph_agent import BaseBuiltinGraphAgent
            from core.chat.langgraph import GraphState

            if not isinstance(agent, BaseBuiltinGraphAgent):
                raise ValueError(f"Expected BaseBuiltinGraphAgent, got {type(agent)}")

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

            # Execute the graph
            logger.info(f"Executing builtin agent graph for: {agent.name}")
            result = await graph.ainvoke(initial_state)

            # Extract the final output
            response_text = None

            # Try final_output attribute (for dict result)
            if isinstance(result, dict) and "final_output" in result and result["final_output"]:
                response_text = result["final_output"]
            # Try messages attribute (for dict result)
            elif isinstance(result, dict) and "messages" in result and result["messages"]:
                last_message = result["messages"][-1]
                if hasattr(last_message, "content"):
                    response_text = last_message.content
                else:
                    response_text = str(last_message)
            # Try accessing as dict
            elif isinstance(result, dict):
                if "final_output" in result and result["final_output"]:
                    response_text = result["final_output"]
                elif "messages" in result and result["messages"]:
                    last_message = result["messages"][-1]
                    if hasattr(last_message, "content"):
                        response_text = last_message.content
                    else:
                        response_text = str(last_message)

            # Fallback
            if not response_text:
                response_text = "I completed the task, but no output was generated."
                logger.warning("Could not extract output from builtin agent result")

            logger.info("Builtin agent executed successfully")
            return response_text

        except Exception as e:
            logger.error(f"Failed to execute builtin agent {agent}: {e}")
            return f"I'm sorry, but I encountered an error while executing the builtin agent: {e}"

    async def _execute_regular_agent(
        self,
        message_text: str,
        topic: TopicModel,
        user_id: str,
        agent: Agent | None,
    ) -> str:
        """
        Execute a regular agent (or default chat) with the provided message.

        Args:
            message_text: The user's message
            topic: The conversation topic
            user_id: The user ID
            agent: The regular agent instance (None for default chat)

        Returns:
            AI response string
        """
        try:
            # Import here to avoid circular imports
            from core.chat.sync import get_ai_response_legacy

            # Use the existing regular agent logic
            return await get_ai_response_legacy(self.db, message_text, topic, user_id, agent)

        except Exception as e:
            logger.error(f"Failed to execute regular agent: {e}")
            return f"I'm sorry, but I encountered an error while processing your request: {e}"

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
        Execute a graph agent with streaming support.

        Args:
            message_text: The user's message
            topic: The conversation topic
            user_id: The user ID
            agent: The graph agent instance
            connection_manager: WebSocket connection manager
            connection_id: Connection ID for WebSocket

        Yields:
            Chat event dictionaries for streaming response
        """
        try:
            import asyncio
            from datetime import datetime, timezone

            # Yield processing start
            yield {"type": ChatEventType.PROCESSING, "data": {"status": "preparing_graph_execution"}}

            # Convert chat context to graph input state
            input_state = await self.state_converter.chat_to_graph_state(message_text, topic, user_id)

            # Yield execution start
            message_id = f"graph_{int(asyncio.get_event_loop().time() * 1000)}"
            yield {"type": "streaming_start", "data": {"id": message_id}}

            # Execute the graph agent
            result: GraphExecutionResult = await execute_graph_agent_sync(self.db, agent.id, input_state, user_id)

            # Convert result back to chat message and stream it
            response_text = self.state_converter.graph_result_to_message(result)

            if result.success:
                logger.info(f"Graph agent executed successfully in {result.execution_time_ms}ms")

                if self.enable_graph_streaming_chunks and len(response_text) > self.graph_chunk_size:
                    for i in range(0, len(response_text), self.graph_chunk_size):
                        chunk = response_text[i : i + self.graph_chunk_size]  # noqa: E203
                        yield {"type": "streaming_chunk", "data": {"id": message_id, "content": chunk}}
                else:
                    yield {"type": "streaming_chunk", "data": {"id": message_id, "content": response_text}}

                # End streaming
                yield {
                    "type": "streaming_end",
                    "data": {
                        "id": message_id,
                        "content": response_text,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    },
                }
            else:
                logger.error(f"Graph agent execution failed: {result.error_message}")
                yield {"type": ChatEventType.ERROR, "data": {"error": response_text}}

        except Exception as e:
            logger.error(f"Failed to execute graph agent {agent.id}: {e}")
            yield {
                "type": ChatEventType.ERROR,
                "data": {"error": f"I'm sorry, but I encountered an error while executing the graph agent: {e}"},
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
            from handler.builtin_agents.base_graph_agent import BaseBuiltinGraphAgent
            from core.chat.langgraph import GraphState

            if not isinstance(agent, BaseBuiltinGraphAgent):
                raise ValueError(f"Expected BaseBuiltinGraphAgent, got {type(agent)}")

            # Yield processing start
            yield {"type": ChatEventType.PROCESSING, "data": {"status": "preparing_builtin_agent_execution"}}

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
            yield {"type": "streaming_start", "data": {"id": message_id}}

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
                    yield {"type": "streaming_chunk", "data": {"id": message_id, "content": chunk}}
            else:
                yield {"type": "streaming_chunk", "data": {"id": message_id, "content": response_text}}

            # End streaming
            yield {
                "type": "streaming_end",
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

    async def can_handle_agent(self, agent_id: UUID, user_id: str) -> bool:
        """
        Check if the router can handle the specified agent for the user.

        Args:
            agent_id: The agent ID to check
            user_id: The user ID

        Returns:
            True if the agent exists and user has access, False otherwise
        """
        try:
            agent_with_type = await self.agent_detector.get_agent_with_type(agent_id, user_id)
            return agent_with_type is not None
        except Exception as e:
            logger.error(f"Failed to check agent accessibility: {e}")
            return False
