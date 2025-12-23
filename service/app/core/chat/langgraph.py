"""
LangGraph-based graph agent execution engine.
Provides functionality to build and execute graph-based agents using LangGraph StateGraph.
"""

import json
import logging
import time
from typing import Any, AsyncGenerator, Awaitable, Callable, Sequence
from uuid import UUID

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.providers import ProviderManager, get_user_provider_manager
from app.models.graph import (
    GraphAgent,
    GraphAgentWithGraph,
    GraphEdge,
    GraphEdgeRead,
    GraphExecutionResult,
    GraphNode,
    GraphNodeRead,
)
from app.repos.graph import GraphRepository
from app.schemas.chat_events import ChatEventType, ProcessingStatus

logger = logging.getLogger(__name__)


class GraphState(BaseModel):
    """Base state schema for graph execution"""

    messages: list[BaseMessage] = Field(default_factory=list)
    current_step: str = ""
    execution_context: dict[str, Any] = Field(default_factory=dict)
    user_input: str = ""
    final_output: str = ""
    error: str | None = None


class GraphNodeType:
    """Constants for node types"""

    LLM = "llm"
    TOOL = "tool"
    ROUTER = "router"
    SUBAGENT = "subagent"
    START = "start"
    END = "end"


class LangGraphExecutor:
    """Core LangGraph execution engine"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.graph_repo = GraphRepository(db)

    async def build_state_graph(
        self,
        graph_agent: GraphAgent | GraphAgentWithGraph,
        nodes: Sequence[GraphNode | GraphNodeRead],
        edges: Sequence[GraphEdge | GraphEdgeRead],
        user_id: str,
    ) -> CompiledStateGraph:
        """
        Build a LangGraph StateGraph from database models.

        Args:
            graph_agent: The graph agent configuration
            nodes: List of graph nodes
            edges: List of graph edges
            user_id: User ID for provider access

        Returns:
            Compiled StateGraph ready for execution
        """
        logger.debug(f"Building state graph for agent: {graph_agent.id}")

        # Create state schema from agent configuration
        state_schema = self._build_state_schema(graph_agent.state_schema)

        # Initialize StateGraph
        workflow = StateGraph(state_schema)

        # Get user provider manager for LLM nodes
        user_provider_manager = await get_user_provider_manager(user_id, self.db)

        # Add nodes to the graph
        node_functions = {}
        for node in nodes:
            node_func = await self._create_node_function(node, user_provider_manager)
            node_functions[node.name] = node_func
            # LangGraph expects sync functions that return state updates directly
            workflow.add_node(node.name, node_func)  # type: ignore

        # Add edges to the graph
        for edge in edges:
            from_node = self._get_node_name_by_id(edge.from_node_id, nodes)
            to_node = self._get_node_name_by_id(edge.to_node_id, nodes)

            if edge.condition:
                # Conditional edge
                condition_func = self._create_condition_function(edge.condition)
                workflow.add_conditional_edges(from_node, condition_func)
            else:
                # Simple edge
                workflow.add_edge(from_node, to_node)

        # Set entry point (find START node or first node)
        start_node = self._find_start_node(nodes)
        if start_node:
            workflow.set_entry_point(start_node.name)
        elif nodes:
            workflow.set_entry_point(nodes[0].name)

        # Set finish point (find END node or add automatic end)
        end_node = self._find_end_node(nodes)
        if end_node:
            workflow.set_finish_point(end_node.name)

        return workflow.compile()

    async def execute_graph_agent_streaming(
        self, agent_id: UUID, input_state: dict[str, Any], user_id: str
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Execute a graph agent with streaming output.

        Args:
            agent_id: UUID of the graph agent to execute
            input_state: Initial state for execution
            user_id: User ID for authentication and provider access

        Returns:
            Streaming generator of execution updates
        """
        start_time = time.time()

        try:
            # Load graph agent with all components
            agent_with_graph = await self.graph_repo.get_graph_agent_with_graph(agent_id)
            if not agent_with_graph:
                error_msg = f"Graph agent {agent_id} not found"
                yield {"type": ChatEventType.ERROR, "data": {"error": error_msg}}
                return

            # Build the state graph
            compiled_graph = await self.build_state_graph(
                agent_with_graph, agent_with_graph.nodes, agent_with_graph.edges, user_id
            )

            # Streaming execution
            async for chunk in self._execute_graph_streaming(compiled_graph, input_state, agent_id, start_time):
                yield chunk

        except Exception as e:
            error_msg = f"Graph execution failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            yield {"type": ChatEventType.ERROR, "data": {"error": error_msg}}

    # TODO: DELETE
    async def execute_graph_agent_sync(
        self, agent_id: UUID, input_state: dict[str, Any], user_id: str
    ) -> GraphExecutionResult:
        """
        Execute a graph agent synchronously.

        Args:
            agent_id: UUID of the graph agent to execute
            input_state: Initial state for execution
            user_id: User ID for authentication and provider access

        Returns:
            Final execution result
        """
        start_time = time.time()

        try:
            # Load graph agent with all components
            agent_with_graph = await self.graph_repo.get_graph_agent_with_graph(agent_id)
            if not agent_with_graph:
                error_msg = f"Graph agent {agent_id} not found"
                return GraphExecutionResult(
                    agent_id=agent_id,
                    final_state={},
                    execution_steps=[],
                    success=False,
                    error_message=error_msg,
                    execution_time_ms=int((time.time() - start_time) * 1000),
                )

            # Build the state graph
            compiled_graph = await self.build_state_graph(
                agent_with_graph, agent_with_graph.nodes, agent_with_graph.edges, user_id
            )

            # Non-streaming execution
            final_state = await compiled_graph.ainvoke(input_state)
            execution_time_ms = int((time.time() - start_time) * 1000)

            result = GraphExecutionResult(
                agent_id=agent_id,
                final_state=final_state,
                execution_steps=[],  # Could be populated with detailed steps
                success=True,
                execution_time_ms=execution_time_ms,
            )

            # Save execution result
            await self.graph_repo.save_execution_result(result)
            return result

        except Exception as e:
            error_msg = f"Graph execution failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            execution_time_ms = int((time.time() - start_time) * 1000)

            return GraphExecutionResult(
                agent_id=agent_id,
                final_state={},
                execution_steps=[],
                success=False,
                error_message=error_msg,
                execution_time_ms=execution_time_ms,
            )

    async def _execute_graph_streaming(
        self,
        compiled_graph: CompiledStateGraph,
        input_state: dict[str, Any],
        agent_id: UUID,
        start_time: float,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Execute graph with proper token-level streaming following langchain_legacy pattern.

        Uses astream with stream_mode=["updates", "messages"] to get:
        1. Step-by-step agent progress (execution tracking)
        2. Token-by-token LLM streaming
        """

        # Batch logging constant (import from langchain.py pattern)
        STREAMING_LOG_BATCH_SIZE = 50  # Log every N tokens instead of every token

        yield {"type": ChatEventType.PROCESSING, "data": {"status": ProcessingStatus.PREPARING_REQUEST}}

        # Follow langchain_legacy pattern exactly
        stream_id = f"graph_{agent_id}_{int(start_time * 1000)}"
        is_streaming = False
        assistant_buffer: list[str] = []
        token_count = 0
        execution_steps: list[dict[str, Any]] = []

        try:
            # Use same stream modes as langchain_legacy
            async for mode, data in compiled_graph.astream(
                input_state,
                stream_mode=["updates", "messages"],
            ):
                if mode == "updates":
                    logger.debug("Received stream chunk - mode: %s", mode)

                # Handle each mode separately like langchain_legacy
                if mode == "updates":
                    # Track execution steps (for LangGraph result storage)
                    if not isinstance(data, dict):
                        logger.debug("Updates data is not a dict: %r", data)
                        continue

                    execution_steps.append({"timestamp": time.time(), "update": data})

                    # TODO: Add tool call handling like langchain_legacy if needed in future
                    # For now, LangGraph doesn't emit tool calls the same way as LangChain

                elif mode == "messages":
                    # Token streaming logic - EXACTLY like langchain_legacy
                    # data is a tuple: (message_chunk, metadata)
                    assert isinstance(data, tuple), f"Messages data is not a tuple: {data}"

                    try:
                        message_chunk, metadata = data
                    except Exception:
                        logger.debug(f"Malformed messages data: {data}")
                        continue

                    # Batch logging like langchain_legacy
                    token_count += 1
                    if token_count == 1 or token_count % STREAMING_LOG_BATCH_SIZE == 0:
                        logger.debug(
                            "Received message chunks (token count: %d) | node=%s",
                            token_count,
                            metadata.get("langgraph_node") if isinstance(metadata, dict) else None,
                        )

                    node = None
                    if isinstance(metadata, dict):
                        node = metadata.get("langgraph_node") or metadata.get("node")
                    if node and node != "assistant":  # LangGraph uses "assistant" instead of "model"
                        continue

                    # Extract token text like langchain_legacy
                    token_text = None
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
                        # Start streaming like langchain_legacy
                        if not is_streaming:
                            logger.debug("Emitting streaming_start for stream_id=%s (from messages)", stream_id)
                            yield {"type": ChatEventType.STREAMING_START, "data": {"id": stream_id}}
                            is_streaming = True

                        # Stream token like langchain_legacy
                        yield {
                            "type": ChatEventType.STREAMING_CHUNK,
                            "data": {"id": stream_id, "content": token_text},
                        }
                        assistant_buffer.append(token_text)

            # End streaming like langchain_legacy
            if is_streaming:
                final_content = "".join(assistant_buffer)

                logger.debug(
                    "Emitting streaming_end for stream_id=%s (total tokens: %d, total chars: %d)",
                    stream_id,
                    token_count,
                    sum(len(t) for t in assistant_buffer),
                )

                # Create execution result (LangGraph specific)
                execution_time_ms = int((time.time() - start_time) * 1000)
                result = GraphExecutionResult(
                    agent_id=agent_id,
                    final_state={
                        "final_output": final_content,
                        "messages": input_state.get("messages", []),
                        "current_step": "completed",
                    },
                    execution_steps=execution_steps,
                    success=True,
                    execution_time_ms=execution_time_ms,
                )
                await self.graph_repo.save_execution_result(result)

                # Import here to avoid potential circular imports
                from datetime import datetime, timezone

                yield {
                    "type": ChatEventType.STREAMING_END,
                    "data": {
                        "id": stream_id,
                        "content": final_content,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "execution_time_ms": execution_time_ms,
                    },
                }
            else:
                # Handle case where no streaming occurred (no assistant tokens)
                logger.warning("No streaming tokens received from LangGraph execution")
                yield {
                    "type": ChatEventType.ERROR,
                    "data": {"error": "No response generated from graph execution"},
                }

        except Exception as e:
            logger.error(f"Graph execution failed: {e}", exc_info=True)
            yield {"type": ChatEventType.ERROR, "data": {"error": f"Graph execution failed: {e}"}}

    def _build_state_schema(self, schema_dict: dict[str, Any] | None) -> type:
        """
        Build Pydantic state schema from JSON schema.

        Currently returns base GraphState for all agents.
        TODO: Implement dynamic schema generation when custom state fields are needed.

        Args:
            schema_dict: Optional custom state schema configuration

        Returns:
            GraphState class (base implementation for now)
        """
        if not schema_dict:
            return GraphState

        # Log that custom schemas aren't yet supported but preserve the data
        logger.debug(f"Custom state schema provided but not yet implemented: {schema_dict}")

        # For now, return base schema but preserve schema_dict for future use
        # Future implementation would dynamically create Pydantic model here
        return GraphState

    async def _create_node_function(
        self, node: GraphNode | GraphNodeRead, user_provider_manager: ProviderManager
    ) -> Callable[[GraphState], Awaitable[dict[str, Any]]]:
        """Create executable function for a graph node"""

        if node.node_type == GraphNodeType.LLM:
            return await self._create_llm_node(node, user_provider_manager)
        elif node.node_type == GraphNodeType.TOOL:
            return await self._create_tool_node(node)
        elif node.node_type == GraphNodeType.ROUTER:
            return await self._create_router_node(node)
        elif node.node_type == GraphNodeType.SUBAGENT:
            return await self._create_subagent_node(node)
        else:
            # Default passthrough node
            return self._create_passthrough_node(node)

    async def _create_llm_node(
        self, node: GraphNode | GraphNodeRead, user_provider_manager: ProviderManager
    ) -> Callable[[GraphState], Awaitable[dict[str, Any]]]:
        """Create LLM node function"""

        async def llm_node(state: GraphState) -> dict[str, Any]:
            logger.debug(f"Executing LLM node: {node.name}")

            try:
                # Get model configuration from node config
                model_name = node.config.get("model")  # For logging/debugging purposes
                provider_name = node.config.get("provider_name")  # Optional provider specification
                system_prompt = node.config.get("system_prompt", "")

                # Validate provider if specified
                if provider_name:
                    provider = user_provider_manager.get_provider_config(provider_name)
                    if not provider:
                        logger.warning(
                            f"Provider '{provider_name}' not found for node '{node.name}', using active provider"
                        )
                        provider_name = None

                # Log the model being used
                if model_name:
                    logger.debug(
                        f"LLM node '{node.name}' using model '{model_name}' with provider '{provider_name or 'active'}'"
                    )

                # Create LangChain model

                llm = user_provider_manager.create_langchain_model(provider_name)

                # Prepare messages
                messages = []
                if system_prompt:
                    messages.append(SystemMessage(content=system_prompt))

                # Add conversation history
                messages.extend(state.messages)

                # Add current user input if available
                if state.user_input:
                    messages.append(HumanMessage(content=state.user_input))

                # Get LLM response
                response = await llm.ainvoke(messages)

                # Update state
                new_messages = state.messages + [response]

                return {
                    "messages": new_messages,
                    "current_step": node.name,
                    "final_output": response.content if hasattr(response, "content") else str(response),
                }

            except Exception as e:
                logger.error(f"LLM node {node.name} failed: {e}")
                return {"error": f"LLM node failed: {str(e)}", "current_step": node.name}

        return llm_node

    async def _create_tool_node(
        self, node: GraphNode | GraphNodeRead
    ) -> Callable[[GraphState], Awaitable[dict[str, Any]]]:
        """Create tool node function"""

        async def tool_node(state: GraphState) -> dict[str, Any]:
            logger.debug(f"Executing tool node: {node.name}")

            try:
                tool_name = node.config.get("tool_name")
                tool_args = node.config.get("tool_args", {})

                # Execute tool (integrate with existing MCP tool system)
                from app.core.chat.tools import execute_tool_call

                # Get agent from context (this would need to be passed through state)
                agent = state.execution_context.get("agent")

                if not tool_name:
                    raise ValueError("Tool name is required")

                result = await execute_tool_call(self.db, tool_name, json.dumps(tool_args), agent)

                return {
                    "current_step": node.name,
                    "execution_context": {**state.execution_context, f"{node.name}_result": result},
                }

            except Exception as e:
                logger.error(f"Tool node {node.name} failed: {e}")
                return {"error": f"Tool node failed: {str(e)}", "current_step": node.name}

        return tool_node

    async def _create_router_node(
        self, node: GraphNode | GraphNodeRead
    ) -> Callable[[GraphState], Awaitable[dict[str, Any]]]:
        """Create router node function"""

        async def router_node(state: GraphState) -> dict[str, Any]:
            logger.debug(f"Executing router node: {node.name}")

            # Router logic based on node config
            # routing_logic = node.config.get("routing_logic", {})

            # Simple routing based on state conditions
            # This would be expanded based on requirements

            return {
                "current_step": node.name,
                "execution_context": {**state.execution_context, "routing_decision": "default"},  # Placeholder
            }

        return router_node

    async def _create_subagent_node(
        self, node: GraphNode | GraphNodeRead
    ) -> Callable[[GraphState], Awaitable[dict[str, Any]]]:
        """Create subagent node function"""

        async def subagent_node(state: GraphState) -> dict[str, Any]:
            logger.debug(f"Executing subagent node: {node.name}")

            try:
                subagent_id = node.config.get("subagent_id")
                if not subagent_id:
                    raise ValueError("Subagent ID not specified")

                # Create input state for subagent
                subagent_input = {
                    "user_input": state.final_output or state.user_input,
                    "messages": state.messages,
                    "execution_context": state.execution_context,
                }

                # Execute subagent (recursive call)
                user_id = state.execution_context.get("user_id")
                if not user_id:
                    raise ValueError("User ID not available in execution context")

                subagent_result = await self.execute_graph_agent_sync(UUID(subagent_id), subagent_input, user_id)

                if subagent_result.success:
                    return {
                        "current_step": node.name,
                        "final_output": subagent_result.final_state.get("final_output", ""),
                        "execution_context": {
                            **state.execution_context,
                            f"{node.name}_result": subagent_result.final_state,
                        },
                    }
                else:
                    raise ValueError("Subagent execution failed")

            except Exception as e:
                logger.error(f"Subagent node {node.name} failed: {e}")
                return {"error": f"Subagent node failed: {str(e)}", "current_step": node.name}

        return subagent_node

    def _create_passthrough_node(
        self, node: GraphNode | GraphNodeRead
    ) -> Callable[[GraphState], Awaitable[dict[str, Any]]]:
        """Create passthrough node function"""

        async def passthrough_node(state: GraphState) -> dict[str, Any]:
            logger.debug(f"Executing passthrough node: {node.name}")
            # Update the current step in state, preserving other fields
            return {"current_step": node.name, "execution_context": state.execution_context}

        return passthrough_node

    def _create_condition_function(self, condition: dict[str, Any]) -> Callable[[GraphState], str]:
        """Create condition function for conditional edges"""

        def condition_func(state: GraphState) -> str:
            # Simple condition evaluation
            # This would be expanded based on requirements
            condition_type = condition.get("type", "default")

            if condition_type == "state_check":
                field = condition.get("field")
                value = condition.get("value")
                operator = condition.get("operator", "equals")

                if not field or not isinstance(field, str):
                    return condition.get("default_path", END)

                state_value = getattr(state, field, None)

                if operator == "equals" and state_value == value:
                    return condition.get("true_path", END)
                elif operator == "contains" and value is not None and state_value is not None:
                    if str(value) in str(state_value):
                        return condition.get("true_path", END)
                    else:
                        return condition.get("false_path", END)
                else:
                    return condition.get("false_path", END)

            return condition.get("default_path", END)

        return condition_func

    def _get_node_name_by_id(self, node_id: UUID, nodes: Sequence[GraphNode | GraphNodeRead]) -> str:
        """Get node name by ID"""
        for node in nodes:
            if node.id == node_id:
                return node.name
        raise ValueError(f"Node with ID {node_id} not found")

    def _find_start_node(self, nodes: Sequence[GraphNode | GraphNodeRead]) -> GraphNode | GraphNodeRead | None:
        """Find START node in the list"""
        for node in nodes:
            if node.node_type == GraphNodeType.START:
                return node
        return None

    def _find_end_node(self, nodes: Sequence[GraphNode | GraphNodeRead]) -> GraphNode | GraphNodeRead | None:
        """Find END node in the list"""
        for node in nodes:
            if node.node_type == GraphNodeType.END:
                return node
        return None


# Convenience functions for external use
async def execute_graph_agent_stream(
    db: AsyncSession, agent_id: UUID, input_state: dict[str, Any], user_id: str
) -> AsyncGenerator[dict[str, Any], None]:
    """Execute graph agent with streaming output"""
    executor = LangGraphExecutor(db)
    async for chunk in executor.execute_graph_agent_streaming(agent_id, input_state, user_id):
        yield chunk


# TODO: DELETE
async def execute_graph_agent_sync(
    db: AsyncSession, agent_id: UUID, input_state: dict[str, Any], user_id: str
) -> GraphExecutionResult:
    """Execute graph agent synchronously"""
    executor = LangGraphExecutor(db)
    result = await executor.execute_graph_agent_sync(agent_id, input_state, user_id)
    return result
