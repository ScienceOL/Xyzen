"""
Graph Builder - Compiles JSON GraphConfig into LangGraph CompiledStateGraph.

This module provides the core functionality to transform JSON-based agent
configurations into executable LangGraph workflows.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, Callable, Hashable

from jinja2 import Template
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field, create_model

from app.agents.types import (
    DynamicCompiledGraph,
    DynamicStateGraph,
    LLMFactory,
    NodeFunction,
    RouterFunction,
    StateDict,
)
from app.schemas.graph_config import (
    EdgeCondition,
    GraphConfig,
    GraphEdgeConfig,
    GraphNodeConfig,
    NodeType,
    ReducerType,
    StructuredOutputSchema,
    validate_graph_config,
)

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)


def _extract_content_str(content: str | list[str | dict[str, Any]] | Any) -> str:
    """Extract string content from LLM response content field.

    Note: LangChain's content type includes Unknown due to incomplete stubs.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # Handle list of content blocks (e.g., multimodal responses)
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and "text" in item:
                parts.append(str(item["text"]))
        return "".join(parts)
    return str(content)


# --- State Reducers ---


def append_reducer(existing: list[Any] | None, new: Any) -> list[Any]:
    """Append new value(s) to existing list."""
    if existing is None:
        existing = []
    if isinstance(new, list):
        return existing + new
    return existing + [new]


def merge_reducer(existing: dict[str, Any] | None, new: dict[str, Any] | None) -> dict[str, Any]:
    """Merge new dict into existing dict."""
    if existing is None:
        existing = {}
    if new is None:
        return existing
    return {**existing, **new}


def messages_reducer(
    existing: list[BaseMessage] | None, new: list[BaseMessage] | BaseMessage | None
) -> list[BaseMessage]:
    """Special reducer for message lists that handles deduplication."""
    if existing is None:
        existing = []
    if new is None:
        return existing
    if isinstance(new, list):
        return existing + new
    return existing + [new]


REDUCERS: dict[ReducerType, Callable[..., Any]] = {
    ReducerType.APPEND: append_reducer,
    ReducerType.MERGE: merge_reducer,
    ReducerType.MESSAGES: messages_reducer,
}


# --- Dynamic State Builder ---
def build_state_class(config: GraphConfig) -> type[BaseModel]:
    """
    Dynamically create a Pydantic state class from GraphConfig.

    The state class will have:
    - All fields defined in state_schema
    - Built-in 'messages' field (list[BaseMessage])
    - Built-in 'execution_context' field (dict)
    """
    fields: dict[str, tuple[Any, Any]] = {}

    # Built-in fields (always present)
    fields["messages"] = (list[BaseMessage], Field(default_factory=list))
    fields["execution_context"] = (dict[str, Any], Field(default_factory=dict))

    # Type mapping for schema fields
    type_map: dict[str, Any] = {
        "string": str,
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "list": list[Any],
        "dict": dict[str, Any],
        "any": Any,
        "messages": list[BaseMessage],
    }

    for field_name, field_schema in config.state_schema.fields.items():
        python_type = type_map.get(field_schema.type, Any)
        default_value = field_schema.default
        fields[field_name] = (python_type | None, Field(default=default_value))

    # Create dynamic model with arbitrary types allowed
    DynamicState: type[BaseModel] = create_model(
        "DynamicGraphState",
        __config__=ConfigDict(arbitrary_types_allowed=True),  # type: ignore[call-overload]
        **fields,  # type: ignore[arg-type]
    )
    return DynamicState


# --- Graph Builder ---
class GraphBuilder:
    """
    Builds LangGraph from JSON GraphConfig.

    This class compiles a JSON-based agent configuration into an executable
    LangGraph workflow with proper state management, node execution, and routing.
    """

    config: GraphConfig
    llm_factory: LLMFactory
    tool_registry: dict[str, "BaseTool"]
    context: dict[str, Any]
    state_class: type[BaseModel]
    _template_cache: dict[str, Template]

    def __init__(
        self,
        config: GraphConfig,
        llm_factory: LLMFactory,
        tool_registry: dict[str, "BaseTool"],
        context: dict[str, Any] | None = None,
    ) -> None:
        """
        Initialize the GraphBuilder.

        Args:
            config: GraphConfig defining the agent workflow
            llm_factory: Factory function to create LLM instances
            tool_registry: Dictionary mapping tool names to BaseTool instances
            context: Optional runtime context passed to templates
        """
        self.config = config
        self.llm_factory = llm_factory
        self.tool_registry = tool_registry
        self.context = context or {}

        # Validate configuration
        errors = validate_graph_config(config)
        if errors:
            raise ValueError(f"Invalid graph configuration: {errors}")

        # Build dynamic state class
        self.state_class = build_state_class(config)

        # Cache for compiled templates
        self._template_cache = {}

    def build(self) -> DynamicCompiledGraph:
        """
        Build and compile the LangGraph from configuration.

        Returns:
            CompiledStateGraph ready for execution
        """
        logger.info(f"Building graph with {len(self.config.nodes)} nodes")

        # Create graph with dynamic state
        graph: DynamicStateGraph = StateGraph(self.state_class)

        # Add all nodes
        for node_config in self.config.nodes:
            node_fn = self._build_node(node_config)
            graph.add_node(node_config.id, node_fn)  # type: ignore[arg-type]
            logger.debug(f"Added node: {node_config.id} ({node_config.type})")

        # Add edges
        self._add_edges(graph)

        # Compile and return
        compiled: DynamicCompiledGraph = graph.compile()
        logger.info("Graph compiled successfully")
        return compiled

    def _get_template(self, template_str: str) -> Template:
        """Get or create a cached Jinja2 template."""
        if template_str not in self._template_cache:
            self._template_cache[template_str] = Template(template_str)
        return self._template_cache[template_str]

    def _state_to_dict(self, state: StateDict | BaseModel) -> dict[str, Any]:
        """Convert state to dict, handling both dict and Pydantic model inputs."""
        if isinstance(state, BaseModel):
            return state.model_dump()
        return dict(state) if state else {}

    def _format_messages_for_prompt(self, messages: list[BaseMessage]) -> str:
        """Format a list of messages into a string for prompt templates."""
        if not messages:
            return ""

        formatted_parts: list[str] = []
        for msg in messages:
            role = msg.__class__.__name__.replace("Message", "")  # HumanMessage -> Human
            content = msg.content if hasattr(msg, "content") else str(msg)
            if isinstance(content, list):
                # Handle multimodal content
                content = " ".join(str(c.get("text", c)) if isinstance(c, dict) else str(c) for c in content)
            formatted_parts.append(f"{role}: {content}")

        return "\n".join(formatted_parts)

    def _render_template(self, template_str: str, state: StateDict | BaseModel) -> str:
        """Render a template with state and context.

        Supports both Jinja2 syntax ({{ variable }}) and Python format strings ({variable}).
        This allows compatibility with existing prompts that use {messages} style placeholders.
        """
        import datetime

        template = self._get_template(template_str)
        state_dict = self._state_to_dict(state)

        # First pass: Jinja2 rendering
        rendered = template.render(
            state=state_dict,
            prompt_templates=self.config.prompt_templates,
            context=self.context,
        )

        # Second pass: Python format string for backward compatibility
        # Build format args from state, with special handling for messages
        format_args: dict[str, Any] = {}

        # Format messages as a readable string
        messages = state_dict.get("messages", [])
        if messages and len(messages) > 0:
            if isinstance(messages[0], BaseMessage):
                format_args["messages"] = self._format_messages_for_prompt(messages)
            else:
                format_args["messages"] = str(messages)
        else:
            format_args["messages"] = ""

        # Add current date
        format_args["date"] = datetime.datetime.now().strftime("%Y-%m-%d")

        # Add other state fields
        for key, value in state_dict.items():
            if key not in format_args and not isinstance(value, (list, dict)):
                format_args[key] = str(value) if value is not None else ""

        # Apply format string substitution
        # Use a safer approach that handles curly braces in JSON content
        import re

        def replace_placeholder(match: re.Match[str]) -> str:
            key = match.group(1)
            return str(format_args.get(key, match.group(0)))

        # Match {word} but not {{ or }} (escaped braces)
        rendered = re.sub(r"\{(\w+)\}", replace_placeholder, rendered)

        logger.debug(f"Rendered template ({len(rendered)} chars), messages count: {len(messages)}")

        return rendered

    def _build_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build a node function from configuration."""
        match config.type:
            case NodeType.LLM:
                return self._build_llm_node(config)
            case NodeType.TOOL:
                return self._build_tool_node(config)
            case NodeType.ROUTER:
                return self._build_router_node(config)
            case NodeType.SUBAGENT:
                return self._build_subagent_node(config)
            case NodeType.PARALLEL:
                return self._build_parallel_node(config)
            case NodeType.TRANSFORM:
                return self._build_transform_node(config)
            case NodeType.HUMAN:
                return self._build_human_node(config)
            case _:
                raise ValueError(f"Unknown node type: {config.type}")

    def _build_llm_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build an LLM reasoning node.

        Supports structured output via `structured_output` config:
        - Dynamically creates Pydantic model from JSON schema
        - Uses LangChain's with_structured_output() for parsing
        - Extracts `message_key` field for user-facing message
        """
        llm_config = config.llm_config
        if not llm_config:
            raise ValueError(f"LLM node '{config.id}' missing llm_config")

        # Pre-build structured output model if configured
        structured_model: type[BaseModel] | None = None
        if llm_config.structured_output:
            structured_model = self._build_structured_output_model(config.id, llm_config.structured_output)

        async def llm_node(state: StateDict) -> StateDict:
            logger.info(f"[LLM Node: {config.id}] Starting execution")

            # Get state as dict for inspection
            state_dict = self._state_to_dict(state)
            messages_in_state = state_dict.get("messages", [])
            logger.info(f"[LLM Node: {config.id}] Input messages count: {len(messages_in_state)}")

            # Render prompt template
            prompt = self._render_template(llm_config.prompt_template, state)
            logger.info(f"[LLM Node: {config.id}] Rendered prompt length: {len(prompt)}")

            # Get LLM with optional overrides
            llm = await self.llm_factory(
                model=llm_config.model_override,
                temperature=llm_config.temperature_override,
            )

            # If structured output is configured, use with_structured_output
            if structured_model:
                llm = llm.with_structured_output(structured_model)

            # Bind tools if enabled (only for non-structured output)
            elif llm_config.tools_enabled and self.tool_registry:
                tools_to_bind = list(self.tool_registry.values())
                if llm_config.tool_filter:
                    tools_to_bind = [t for t in tools_to_bind if t.name in llm_config.tool_filter]
                if tools_to_bind:
                    llm = llm.bind_tools(tools_to_bind)

            # Build messages - handle both dict and Pydantic state
            state_dict = self._state_to_dict(state)
            messages: list[BaseMessage] = state_dict.get("messages", [])
            messages = messages + [HumanMessage(content=prompt)]

            # Invoke LLM
            response = await llm.ainvoke(messages)

            # Handle structured output
            if structured_model and isinstance(response, BaseModel):
                # Convert structured response to dict for state update
                response_dict = response.model_dump()

                # Determine what to show in messages
                user_message = ""

                # 1. Check conditional message selection first
                if llm_config.message_key_condition:
                    cond = llm_config.message_key_condition
                    condition_field = cond.get("condition_field")
                    true_key = cond.get("true_key")
                    false_key = cond.get("false_key")

                    if condition_field and true_key and false_key:
                        condition_value = response_dict.get(condition_field, False)
                        selected_key = true_key if condition_value else false_key
                        user_message = str(response_dict.get(selected_key, ""))
                        logger.debug(
                            f"LLM node {config.id}: {condition_field}={condition_value}, "
                            f"using message from '{selected_key}'"
                        )

                # 2. Fall back to simple message_key
                elif llm_config.message_key and llm_config.message_key in response_dict:
                    user_message = str(response_dict[llm_config.message_key])

                # 3. Fall back to first non-empty string field
                else:
                    user_message = next((str(v) for v in response_dict.values() if isinstance(v, str) and v), "")

                logger.info(f"[LLM Node: {config.id}] Structured output completed")

                # Build node metadata for frontend display and persistence
                node_metadata = {
                    "node_id": config.id,
                    "node_name": config.name or config.id,
                    "node_type": "llm",
                    "is_intermediate": config.id not in ("final_report_generation", "agent", "model"),
                    "structured_output": response_dict,  # Include full structured data
                }

                # Build agent state for persistence (includes current node output + context)
                agent_state = {
                    "current_node": config.id,
                    "node_outputs": {config.id: response_dict},
                    "node_names": {config.id: config.name or config.id},  # Map node ID to display name
                }

                # Return all fields from structured output + message for chat
                result: StateDict = {
                    llm_config.output_key: response_dict,  # Full structured data
                    "messages": [
                        AIMessage(
                            content=user_message,
                            additional_kwargs={
                                "node_metadata": node_metadata,
                                "agent_state": agent_state,
                            },
                        )
                    ],
                }
                # Also set individual fields in state for routing conditions
                result.update(response_dict)
                return result

            # Handle regular text response
            content_str = _extract_content_str(getattr(response, "content", response))

            # Check for tool calls in the response
            tool_calls = getattr(response, "tool_calls", None) or []
            has_tool_calls = len(tool_calls) > 0

            logger.info(f"[LLM Node: {config.id}] Text output completed, tool_calls: {len(tool_calls)}")

            # Build node metadata for regular text output
            node_metadata = {
                "node_id": config.id,
                "node_name": config.name or config.id,
                "node_type": "llm",
                "is_intermediate": config.id not in ("final_report_generation", "agent", "model"),
            }

            # For intermediate nodes, truncate output to save space in metadata
            # For final nodes, keep full content for persistence to message.content
            is_intermediate = node_metadata["is_intermediate"]
            output_for_state = content_str[:500] if is_intermediate and len(content_str) > 500 else content_str

            agent_state = {
                "current_node": config.id,
                "node_outputs": {config.id: output_for_state},
                "node_names": {config.id: config.name or config.id},  # Map node ID to display name
            }

            # Build the AIMessage, preserving tool_calls if present
            ai_message = AIMessage(
                content=content_str,
                tool_calls=tool_calls,
                additional_kwargs={
                    "node_metadata": node_metadata,
                    "agent_state": agent_state,
                },
            )

            return {
                llm_config.output_key: content_str,
                "messages": [ai_message],
                "has_tool_calls": has_tool_calls,
            }

        return llm_node

    def _build_structured_output_model(self, node_id: str, schema: StructuredOutputSchema) -> type[BaseModel]:
        """Build a Pydantic model from JSON-defined structured output schema."""

        # Type mapping from schema types to Python types
        type_map: dict[str, Any] = {
            "string": str,
            "str": str,
            "bool": bool,
            "int": int,
            "float": float,
            "list": list[Any],
            "dict": dict[str, Any],
        }

        fields: dict[str, tuple[Any, Any]] = {}
        for field_name, field_def in schema.fields.items():
            python_type = type_map.get(field_def.type, Any)
            if field_def.required:
                fields[field_name] = (python_type, Field(description=field_def.description))
            else:
                fields[field_name] = (
                    python_type | None,
                    Field(default=field_def.default, description=field_def.description),
                )

        # Create dynamic model
        model_name = f"{node_id.title().replace('_', '')}Output"
        return create_model(
            model_name,
            __doc__=schema.description,
            **fields,  # type: ignore[arg-type]
        )

    def _build_tool_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build a tool execution node.

        Supports two modes:
        1. Specific tool: Executes a named tool with template-based arguments
        2. __all__ mode: Executes all pending tool calls from the last AIMessage
           (used in ReAct pattern where LLM decides what tools to call)
        """
        tool_config = config.tool_config
        if not tool_config:
            raise ValueError(f"Tool node '{config.id}' missing tool_config")

        async def tool_node(state: StateDict) -> StateDict:
            logger.debug(f"Executing Tool node: {config.id} (tool: {tool_config.tool_name})")

            # Special case: __all__ means execute pending tool calls from last AIMessage
            if tool_config.tool_name == "__all__":
                return await self._execute_pending_tool_calls(config, state)

            # Normal case: execute a specific named tool
            tool = self.tool_registry.get(tool_config.tool_name)
            if not tool:
                raise ValueError(f"Tool not found: {tool_config.tool_name}")

            # Render arguments
            args: dict[str, str] = {}
            for key, template_str in tool_config.arguments_template.items():
                args[key] = self._render_template(template_str, state)

            # Execute tool with timeout
            try:
                result = await asyncio.wait_for(
                    tool.ainvoke(args),
                    timeout=tool_config.timeout_seconds,
                )
            except asyncio.TimeoutError:
                logger.error(f"Tool {tool_config.tool_name} timed out")
                result = {"error": f"Tool execution timed out after {tool_config.timeout_seconds}s"}

            logger.debug(f"Tool node {config.id} completed")
            return {tool_config.output_key: result}

        return tool_node

    async def _execute_pending_tool_calls(self, config: GraphNodeConfig, state: StateDict) -> StateDict:
        """Execute all pending tool calls from the last AIMessage.

        This implements the ReAct pattern where:
        1. LLM generates a response with tool_calls
        2. This function executes each tool call
        3. Results are returned as ToolMessages for the LLM to process
        """
        state_dict = self._state_to_dict(state)
        messages: list[BaseMessage] = state_dict.get("messages", [])

        # Find the last AIMessage with tool_calls
        last_ai_message: AIMessage | None = None
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
                last_ai_message = msg
                break

        if not last_ai_message or not last_ai_message.tool_calls:
            logger.warning(f"Tool node {config.id}: No pending tool calls found")
            return {"messages": [], "has_tool_calls": False}

        tool_calls = last_ai_message.tool_calls
        logger.info(f"Tool node {config.id}: Executing {len(tool_calls)} tool calls")

        # Execute each tool call
        tool_messages: list[ToolMessage] = []
        for tool_call in tool_calls:
            tool_name = tool_call.get("name", "")
            tool_id = tool_call.get("id", "")
            tool_args = tool_call.get("args", {})

            tool = self.tool_registry.get(tool_name)
            if not tool:
                logger.error(f"Tool not found: {tool_name}")
                tool_messages.append(
                    ToolMessage(
                        content=f"Error: Tool '{tool_name}' not found",
                        tool_call_id=tool_id,
                        name=tool_name,
                    )
                )
                continue

            try:
                # Execute the tool
                timeout = config.tool_config.timeout_seconds if config.tool_config else 30
                result = await asyncio.wait_for(
                    tool.ainvoke(tool_args),
                    timeout=timeout,
                )

                # Convert result to string if needed
                if isinstance(result, dict):
                    import json

                    result_str = json.dumps(result)
                else:
                    result_str = str(result)

                logger.debug(f"Tool {tool_name} completed successfully")
                tool_messages.append(
                    ToolMessage(
                        content=result_str,
                        tool_call_id=tool_id,
                        name=tool_name,
                    )
                )

            except asyncio.TimeoutError:
                logger.error(f"Tool {tool_name} timed out")
                tool_messages.append(
                    ToolMessage(
                        content="Error: Tool execution timed out",
                        tool_call_id=tool_id,
                        name=tool_name,
                    )
                )
            except Exception as e:
                logger.error(f"Tool {tool_name} failed: {e}")
                tool_messages.append(
                    ToolMessage(
                        content=f"Error: {str(e)}",
                        tool_call_id=tool_id,
                        name=tool_name,
                    )
                )

        logger.info(f"Tool node {config.id}: Completed {len(tool_messages)} tool executions")

        # Return tool messages and reset has_tool_calls
        return {
            "messages": tool_messages,
            "has_tool_calls": False,
            config.tool_config.output_key if config.tool_config else "tool_results": [
                {"name": tm.name, "result": tm.content} for tm in tool_messages
            ],
        }

    def _build_router_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build a routing/branching node."""
        router_config = config.router_config
        if not router_config:
            raise ValueError(f"Router node '{config.id}' missing router_config")

        async def router_node(state: StateDict) -> StateDict:
            logger.debug(f"Executing Router node: {config.id}")

            if router_config.strategy == "condition":
                # Evaluate conditions in order
                for condition in router_config.conditions:
                    if self._evaluate_condition(condition, state):
                        logger.debug(f"Router {config.id} matched condition, routing to {condition.target}")
                        return {"_next_node": condition.target}

                logger.debug(f"Router {config.id} using default route: {router_config.default_route}")
                return {"_next_node": router_config.default_route}

            elif router_config.strategy == "llm":
                # Use LLM to decide route
                if not router_config.llm_prompt:
                    raise ValueError("LLM routing strategy requires llm_prompt")

                prompt = self._render_template(router_config.llm_prompt, state)
                llm = await self.llm_factory()
                response = await llm.ainvoke(prompt)
                route = _extract_content_str(response.content).strip()

                if route in router_config.routes:
                    return {"_next_node": route}
                return {"_next_node": router_config.default_route}

            else:
                return {"_next_node": router_config.default_route}

        return router_node

    def _build_subagent_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build a subagent invocation node."""
        subagent_config = config.subagent_config
        if not subagent_config:
            raise ValueError(f"Subagent node '{config.id}' missing subagent_config")

        async def subagent_node(state: StateDict) -> StateDict:
            logger.debug(f"Executing Subagent node: {config.id} (agent: {subagent_config.agent_ref})")

            # Import here to avoid circular dependency
            from app.agents.system import system_agent_registry

            # Try to get system agent
            system_agent = system_agent_registry.get_instance(subagent_config.agent_ref)

            if system_agent:
                # Build subagent graph
                subagent_graph = system_agent.build_graph()

                # Map input state
                subagent_input: StateDict = {}
                for child_key, parent_template in subagent_config.input_mapping.items():
                    subagent_input[child_key] = self._render_template(parent_template, state)

                # Execute subagent
                try:
                    result = await asyncio.wait_for(
                        subagent_graph.ainvoke(subagent_input),
                        timeout=subagent_config.timeout_seconds,
                    )
                except asyncio.TimeoutError:
                    logger.error(f"Subagent {subagent_config.agent_ref} timed out")
                    result = {"error": "Subagent execution timed out"}

                # Map output state
                output: StateDict = {}
                for parent_key, child_key in subagent_config.output_mapping.items():
                    if child_key in result:
                        output[parent_key] = result[child_key]

                return output
            else:
                # TODO: Handle user-defined agent by UUID
                logger.warning(f"Subagent not found: {subagent_config.agent_ref}")
                return {"error": f"Subagent not found: {subagent_config.agent_ref}"}

        return subagent_node

    def _build_parallel_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build a parallel execution node."""
        parallel_config = config.parallel_config
        if not parallel_config:
            raise ValueError(f"Parallel node '{config.id}' missing parallel_config")

        async def parallel_node(state: StateDict) -> StateDict:
            logger.debug(f"Executing Parallel node: {config.id}")

            # This is a placeholder - actual parallel execution requires
            # more complex handling with LangGraph's parallel capabilities
            logger.warning("Parallel node execution not fully implemented")
            return {parallel_config.merge_key: []}

        return parallel_node

    def _build_transform_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build a data transformation node."""
        transform_config = config.transform_config
        if not transform_config:
            raise ValueError(f"Transform node '{config.id}' missing transform_config")

        async def transform_node(state: StateDict) -> StateDict:
            logger.debug(f"Executing Transform node: {config.id}")

            if transform_config.template:
                # Use Jinja2 template
                result: Any = self._render_template(transform_config.template, state)
            elif transform_config.expression:
                # Evaluate Python expression (restricted context)
                # WARNING: This should be sandboxed in production
                try:
                    result = eval(transform_config.expression, {"state": state, "__builtins__": {}})
                except Exception as e:
                    logger.error(f"Transform expression error: {e}")
                    result = None
            else:
                result = None

            return {transform_config.output_key: result}

        return transform_node

    def _build_human_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build a human-in-the-loop node."""
        human_config = config.human_config
        if not human_config:
            raise ValueError(f"Human node '{config.id}' missing human_config")

        async def human_node(state: StateDict) -> StateDict:
            logger.debug(f"Executing Human node: {config.id}")
            # Human nodes typically pause execution and wait for external input
            # This is handled at a higher level in the execution framework
            return {"_human_checkpoint": True, "_human_prompt": human_config.prompt_template}

        return human_node

    def _add_edges(self, graph: DynamicStateGraph) -> None:
        """Add all edges to the graph."""
        # Group edges by source node for conditional edges
        edges_by_source: dict[str, list[GraphEdgeConfig]] = {}
        for edge in self.config.edges:
            if edge.from_node not in edges_by_source:
                edges_by_source[edge.from_node] = []
            edges_by_source[edge.from_node].append(edge)

        # Process edges for each source
        for from_node, edges in edges_by_source.items():
            # Check if any edges have conditions
            conditional_edges = [e for e in edges if e.condition]
            unconditional_edges = [e for e in edges if not e.condition]

            if from_node == "START":
                # Entry point
                if unconditional_edges:
                    graph.add_edge(START, unconditional_edges[0].to_node)
                elif conditional_edges:
                    # Conditional entry (unusual but supported)
                    graph.add_conditional_edges(
                        START,
                        self._build_conditional_router(conditional_edges),
                        {e.to_node: e.to_node for e in conditional_edges},
                    )
            elif conditional_edges:
                # Add conditional edges
                # Build condition map, handling END specially
                condition_map: dict[Hashable, str] = {}
                for e in conditional_edges:
                    target = e.condition.target  # type: ignore[union-attr]
                    to_node = e.to_node
                    # Map to langgraph END constant if target is "END"
                    if to_node == "END":
                        condition_map[target] = END  # type: ignore[assignment]
                    else:
                        condition_map[target] = to_node

                if unconditional_edges:
                    condition_map["default"] = unconditional_edges[0].to_node
                else:
                    condition_map["default"] = END  # type: ignore[assignment]

                graph.add_conditional_edges(
                    from_node,
                    self._build_conditional_router(conditional_edges),
                    condition_map,
                )
            elif unconditional_edges:
                # Simple unconditional edge
                to_node = unconditional_edges[0].to_node
                if to_node == "END":
                    graph.add_edge(from_node, END)
                else:
                    graph.add_edge(from_node, to_node)

    def _build_conditional_router(self, edges: list[GraphEdgeConfig]) -> RouterFunction:
        """Build a routing function for conditional edges."""

        def router(state: StateDict) -> str:
            # Sort by priority (higher first)
            sorted_edges = sorted(edges, key=lambda e: e.priority, reverse=True)

            for edge in sorted_edges:
                if edge.condition and self._evaluate_condition(edge.condition, state):
                    return edge.condition.target

            return "default"

        return router

    def _evaluate_condition(self, condition: EdgeCondition, state: StateDict) -> bool:
        """Evaluate a condition against the current state."""
        state_dict = self._state_to_dict(state)
        value = state_dict.get(condition.state_key)

        match condition.operator:
            case "eq":
                return value == condition.value
            case "neq":
                return value != condition.value
            case "contains":
                return condition.value in value if value else False
            case "not_contains":
                return condition.value not in value if value else True
            case "gt":
                return value > condition.value if value is not None else False
            case "gte":
                return value >= condition.value if value is not None else False
            case "lt":
                return value < condition.value if value is not None else False
            case "lte":
                return value <= condition.value if value is not None else False
            case "in":
                return value in condition.value if condition.value else False
            case "not_in":
                return value not in condition.value if condition.value else True
            case "truthy":
                return bool(value)
            case "falsy":
                return not bool(value)
            case "matches":
                import re

                return bool(re.match(str(condition.value), str(value))) if value else False
            case _:
                return False


# Export
__all__ = ["GraphBuilder", "build_state_class"]
