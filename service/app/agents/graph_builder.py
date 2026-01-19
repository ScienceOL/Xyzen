"""
Graph Builder v2 - Compiles v2 GraphConfig into LangGraph CompiledStateGraph.

This module uses LangGraph's native primitives:
- ToolNode for tool execution (instead of custom _execute_pending_tool_calls)
- tools_condition for routing (instead of manual has_tool_calls checking)
- add_messages reducer (instead of custom messages_reducer)

Key differences from v1:
- No router nodes (routing is done via conditional edges)
- Simplified state schema
- Uses LangGraph's battle-tested components
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Annotated, Any

from jinja2 import Template
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from pydantic import BaseModel, ConfigDict, Field, create_model

from app.agents.types import (
    DynamicCompiledGraph,
    DynamicStateGraph,
    LLMFactory,
    NodeFunction,
    StateDict,
)
from app.agents.utils import extract_text_from_content
from app.schemas.graph_config import (
    ConditionType,
    CustomCondition,
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


# --- State Builder ---


def build_state_class(config: GraphConfig) -> type[BaseModel]:
    """
    Build a Pydantic state class from v2 GraphConfig.

    Always includes:
    - messages: list[BaseMessage] with add_messages reducer
    - execution_context: dict for runtime context

    Custom fields from config.custom_state_fields are added with their
    specified types and reducers.
    """
    fields: dict[str, tuple[Any, Any]] = {}

    # Built-in fields (always present)
    fields["messages"] = (
        Annotated[list[BaseMessage], add_messages],
        Field(default_factory=list),
    )
    fields["execution_context"] = (dict[str, Any], Field(default_factory=dict))

    # Type mapping
    type_map: dict[str, Any] = {
        "string": str,
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "list": list[Any],
        "dict": dict[str, Any],
        "any": Any,
    }

    # Add custom fields
    for field_name, field_schema in config.custom_state_fields.items():
        python_type = type_map.get(field_schema.type, Any)

        # Handle add_messages reducer for custom message fields
        if field_schema.reducer == ReducerType.ADD_MESSAGES:
            fields[field_name] = (
                Annotated[list[BaseMessage], add_messages],
                Field(default=field_schema.default or []),
            )
        else:
            fields[field_name] = (
                python_type | None,
                Field(default=field_schema.default),
            )

    # Create dynamic model
    # Note: create_model with **fields has complex overloads that pyright can't resolve
    DynamicState: type[BaseModel] = create_model(
        "DynamicGraphStateV2",
        __config__=ConfigDict(arbitrary_types_allowed=True),
        **fields,  # type: ignore[call-overload]
    )
    return DynamicState


# --- Graph Builder ---


class GraphBuilder:
    """
    Builds LangGraph from v2 GraphConfig using native LangGraph primitives.

    Key features:
    - Uses ToolNode for tool execution
    - Uses tools_condition for routing
    - No separate router nodes
    - Simplified state management
    """

    config: GraphConfig
    llm_factory: LLMFactory
    tool_registry: dict[str, "BaseTool"]
    context: dict[str, Any]
    state_class: type[BaseModel]
    _template_cache: dict[str, Template]
    _tool_node: ToolNode | None

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
            config: v2 GraphConfig defining the agent workflow
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

        # Build ToolNode if we have tools
        self._tool_node = None
        if tool_registry:
            tools = list(tool_registry.values())
            # Apply global tool filter if configured
            if config.tool_config and config.tool_config.tool_filter:
                tools = [t for t in tools if t.name in config.tool_config.tool_filter]
            if tools:
                self._tool_node = ToolNode(tools)

    async def build(self) -> DynamicCompiledGraph:
        """
        Build and compile the LangGraph from configuration.

        Returns:
            CompiledStateGraph ready for execution
        """
        logger.info(f"Building v2 graph with {len(self.config.nodes)} nodes")

        # Create graph with dynamic state
        graph: DynamicStateGraph = StateGraph(self.state_class)

        # Add all nodes
        for node_config in self.config.nodes:
            node_fn = await self._build_node(node_config)
            # Note: LangGraph's add_node has strict typing that doesn't match our dynamic state
            graph.add_node(node_config.id, node_fn)  # type: ignore[arg-type]
            logger.debug(f"Added node: {node_config.id} ({node_config.type})")

        # Add edges
        self._add_edges(graph)

        # Compile and return
        compiled: DynamicCompiledGraph = graph.compile()
        logger.info("Graph v2 compiled successfully")
        return compiled

    def get_node_component_keys(self) -> dict[str, str]:
        """
        Extract mapping of node_id -> component_key for COMPONENT nodes.

        This is used to pass component information to the frontend for
        specialized rendering of different component outputs.

        Returns:
            Dictionary mapping node IDs to their component keys.
            Only includes nodes of type COMPONENT.
        """
        mapping: dict[str, str] = {}
        for node_config in self.config.nodes:
            if node_config.type == NodeType.COMPONENT and node_config.component_config:
                mapping[node_config.id] = node_config.component_config.component_ref.key
        return mapping

    def _get_template(self, template_str: str) -> Template:
        """Get or create a cached Jinja2 template."""
        if template_str not in self._template_cache:
            self._template_cache[template_str] = Template(template_str)
        return self._template_cache[template_str]

    def _state_to_dict(self, state: StateDict | BaseModel) -> dict[str, Any]:
        """Convert state to dict."""
        if isinstance(state, BaseModel):
            return state.model_dump()
        return dict(state) if state else {}

    def _format_messages_for_prompt(self, messages: list[BaseMessage]) -> str:
        """Format messages into a string for prompt templates."""
        if not messages:
            return ""

        formatted_parts: list[str] = []
        for msg in messages:
            role = msg.__class__.__name__.replace("Message", "")
            content = msg.content if hasattr(msg, "content") else str(msg)
            if isinstance(content, list):
                content = " ".join(str(c.get("text", c)) if isinstance(c, dict) else str(c) for c in content)
            formatted_parts.append(f"{role}: {content}")

        return "\n".join(formatted_parts)

    def _render_template(self, template_str: str, state: StateDict | BaseModel) -> str:
        """Render a template with state and context."""
        import datetime
        import re

        template = self._get_template(template_str)
        state_dict = self._state_to_dict(state)

        # Jinja2 rendering
        rendered = template.render(
            state=state_dict,
            context=self.context,
        )

        # Format args for backward compatibility
        format_args: dict[str, Any] = {}

        messages = state_dict.get("messages", [])
        if messages and isinstance(messages[0], BaseMessage):
            format_args["messages"] = self._format_messages_for_prompt(messages)
        else:
            format_args["messages"] = str(messages) if messages else ""

        format_args["date"] = datetime.datetime.now().strftime("%Y-%m-%d")

        for key, value in state_dict.items():
            if key not in format_args and not isinstance(value, (list, dict)):
                format_args[key] = str(value) if value is not None else ""

        def replace_placeholder(match: re.Match[str]) -> str:
            key = match.group(1)
            return str(format_args.get(key, match.group(0)))

        rendered = re.sub(r"\{(\w+)\}", replace_placeholder, rendered)
        return rendered

    async def _build_node(self, config: GraphNodeConfig) -> NodeFunction | DynamicCompiledGraph:
        """Build a node function or subgraph from configuration."""
        match config.type:
            case NodeType.LLM:
                return await self._build_llm_node(config)
            case NodeType.TOOL:
                return self._build_tool_node(config)
            case NodeType.TRANSFORM:
                return self._build_transform_node(config)
            case NodeType.COMPONENT:
                return await self._build_component_node(config)
            case _:
                raise ValueError(f"Unknown node type: {config.type}")

    async def _build_llm_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build an LLM node using LangGraph patterns.

        Creates the LLM BEFORE compilation to enable proper streaming interception.
        """
        llm_config = config.llm_config
        if not llm_config:
            raise ValueError(f"LLM node '{config.id}' missing llm_config")

        # Pre-build structured output model if configured
        structured_model: type[BaseModel] | None = None
        if llm_config.structured_output:
            structured_model = self._build_structured_output_model(config.id, llm_config.structured_output)

        # Create LLM BEFORE building the node function
        # This is critical for LangGraph to properly intercept and stream tokens
        base_llm = await self.llm_factory(
            model=llm_config.model_override,
            temperature=llm_config.temperature_override,
        )

        # Configure LLM based on mode
        if structured_model:
            configured_llm = base_llm.with_structured_output(structured_model)
        elif llm_config.tools_enabled and self.tool_registry:
            tools_to_bind = list(self.tool_registry.values())
            if llm_config.tool_filter:
                tools_to_bind = [t for t in tools_to_bind if t.name in llm_config.tool_filter]
            if tools_to_bind:
                configured_llm = base_llm.bind_tools(tools_to_bind)
            else:
                configured_llm = base_llm
        else:
            configured_llm = base_llm

        async def llm_node(state: StateDict) -> StateDict:
            logger.info(f"[LLM Node: {config.id}] Starting execution")

            # Access messages directly from state
            # LangGraph passes state as dict with 'messages' key containing BaseMessage objects
            messages: list[BaseMessage] = list(state.get("messages", []))

            # Render prompt template
            prompt = self._render_template(llm_config.prompt_template, state)

            # Build messages for LLM
            llm_messages = messages + [HumanMessage(content=prompt)]

            # Invoke LLM (using pre-created configured_llm)
            response = await configured_llm.ainvoke(llm_messages)

            # Handle structured output
            if structured_model and isinstance(response, BaseModel):
                response_dict = response.model_dump()

                # Determine user-facing message
                user_message = ""
                if llm_config.message_key and llm_config.message_key in response_dict:
                    user_message = str(response_dict[llm_config.message_key])
                else:
                    user_message = next(
                        (str(v) for v in response_dict.values() if isinstance(v, str) and v),
                        "",
                    )

                logger.info(f"[LLM Node: {config.id}] Structured output completed")

                result: StateDict = {
                    llm_config.output_key: response_dict,
                    "messages": [AIMessage(content=user_message)],
                }
                result.update(response_dict)
                return result

            # Handle regular text response
            content_str = extract_text_from_content(getattr(response, "content", response))
            tool_calls = getattr(response, "tool_calls", None) or []

            logger.info(f"[LLM Node: {config.id}] Text output completed, tool_calls: {len(tool_calls)}")

            # Build AIMessage preserving tool_calls
            ai_message = AIMessage(
                content=content_str,
                tool_calls=tool_calls,
            )

            return {
                llm_config.output_key: content_str,
                "messages": [ai_message],
            }

        return llm_node

    def _build_structured_output_model(self, node_id: str, schema: StructuredOutputSchema) -> type[BaseModel]:
        """Build a Pydantic model from structured output schema."""
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
                    Field(default=None, description=field_def.description),
                )

        model_name = f"{node_id.title().replace('_', '')}Output"
        # Note: create_model with **fields has complex overloads that pyright can't resolve
        return create_model(
            model_name,
            __doc__=schema.description,
            **fields,  # type: ignore[call-overload]
        )

    def _build_tool_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build a tool node using LangGraph's ToolNode.

        This replaces the custom _execute_pending_tool_calls with
        LangGraph's battle-tested ToolNode implementation.
        """
        tool_config = config.tool_config
        if not tool_config:
            raise ValueError(f"Tool node '{config.id}' missing tool_config")

        # Get tools for this node
        # If execute_all=True OR no tool_filter specified, use all tools
        if tool_config.execute_all or not tool_config.tool_filter:
            # Use all tools (or filtered by global config)
            tool_node = self._tool_node
        else:
            # Use specific tools from filter
            tools = [t for t in self.tool_registry.values() if t.name in tool_config.tool_filter]
            tool_node = ToolNode(tools) if tools else None

        if not tool_node:
            raise ValueError(f"Tool node '{config.id}' has no tools configured")

        async def execute_tools(state: StateDict) -> StateDict:
            logger.info(f"[Tool Node: {config.id}] Executing tools")

            # ToolNode expects state with messages
            result = await tool_node.ainvoke(state)

            logger.info(f"[Tool Node: {config.id}] Tools executed")
            return result

        return execute_tools

    def _build_transform_node(self, config: GraphNodeConfig) -> NodeFunction:
        """Build a data transformation node."""
        transform_config = config.transform_config
        if not transform_config:
            raise ValueError(f"Transform node '{config.id}' missing transform_config")

        async def transform_node(state: StateDict) -> StateDict:
            logger.debug(f"Executing Transform node: {config.id}")

            result: Any = self._render_template(transform_config.template, state)
            return {transform_config.output_key: result}

        return transform_node

    async def _build_component_node(self, config: GraphNodeConfig) -> NodeFunction | DynamicCompiledGraph:
        """Build a node that invokes a registered ExecutableComponent.

        This resolves the component from the registry, filters tools by the
        component's required capabilities, and builds the component's subgraph.

        Returns the compiled subgraph directly (not wrapped in a function) so that
        LangGraph can properly propagate streaming through the subgraph.
        """
        from app.agents.components import component_registry
        from app.agents.components.executable import ExecutableComponent

        comp_config = config.component_config
        if not comp_config:
            raise ValueError(f"Component node '{config.id}' missing component_config")

        # Resolve component from registry with version matching
        component = component_registry.resolve(
            comp_config.component_ref.key,
            comp_config.component_ref.version,
        )

        if not component:
            raise ValueError(
                f"Component '{comp_config.component_ref.key}' (version {comp_config.component_ref.version}) not found"
            )

        if not isinstance(component, ExecutableComponent):
            raise ValueError(f"Component '{comp_config.component_ref.key}' is not an ExecutableComponent")

        # Filter tools by component's required capabilities
        filtered_tools = self._filter_tools_by_capabilities(component.metadata.required_capabilities)

        # Build the component's subgraph (async to create LLM before compilation)
        subgraph = await component.build_graph(
            llm_factory=self.llm_factory,
            tools=filtered_tools,
            config=comp_config.config_overrides,
        )

        logger.info(
            f"[Component Node: {config.id}] Built component '{comp_config.component_ref.key}' "
            f"with {len(filtered_tools)} tools"
        )

        # Return the compiled subgraph directly - LangGraph will handle streaming propagation
        return subgraph

    def _filter_tools_by_capabilities(self, required_capabilities: list[str]) -> list["BaseTool"]:
        """Filter tools to those matching required capabilities.

        Args:
            required_capabilities: List of capability strings required by the component

        Returns:
            List of tools that have at least one matching capability.
            If required_capabilities is empty, returns all tools.

        Raises:
            ValueError: If any required capability has no matching tools
        """
        from app.tools.capabilities import filter_tools_by_capabilities, get_tool_capabilities

        all_tools = list(self.tool_registry.values())

        if not required_capabilities:
            return all_tools

        filtered = filter_tools_by_capabilities(all_tools, required_capabilities)

        # Validate all required capabilities are satisfied
        for cap in required_capabilities:
            cap_tools = [t for t in filtered if cap in get_tool_capabilities(t)]
            if not cap_tools:
                raise ValueError(
                    f"Component requires '{cap}' capability but no matching tools are available. "
                    f"Available tools: {[t.name for t in all_tools]}"
                )

        return filtered

    def _add_edges(self, graph: DynamicStateGraph) -> None:
        """Add edges to the graph, using tools_condition for tool routing."""
        # Group edges by source
        edges_by_source: dict[str, list[GraphEdgeConfig]] = {}
        for edge in self.config.edges:
            if edge.from_node not in edges_by_source:
                edges_by_source[edge.from_node] = []
            edges_by_source[edge.from_node].append(edge)

        for from_node, edges in edges_by_source.items():
            conditional_edges = [e for e in edges if e.condition]
            unconditional_edges = [e for e in edges if not e.condition]

            if from_node == "START":
                # Entry point
                entry = self.config.entry_point or self.config.nodes[0].id
                graph.add_edge(START, entry)

            elif conditional_edges:
                # Check if this is a tool routing pattern
                has_tool_condition = any(
                    isinstance(e.condition, ConditionType)
                    and e.condition in (ConditionType.HAS_TOOL_CALLS, ConditionType.NO_TOOL_CALLS)
                    for e in conditional_edges
                )

                if has_tool_condition:
                    # Use LangGraph's tools_condition
                    self._add_tool_routing(graph, from_node, conditional_edges)
                else:
                    # Custom condition routing
                    self._add_custom_routing(graph, from_node, conditional_edges, unconditional_edges)

            elif unconditional_edges:
                to_node = unconditional_edges[0].to_node
                if to_node == "END":
                    graph.add_edge(from_node, END)
                else:
                    graph.add_edge(from_node, to_node)

    def _add_tool_routing(
        self,
        graph: DynamicStateGraph,
        from_node: str,
        edges: list[GraphEdgeConfig],
    ) -> None:
        """Add tool-based routing using LangGraph's tools_condition."""
        # Find targets for tool calls and no tool calls
        tool_target = None
        end_target = None

        for edge in edges:
            if isinstance(edge.condition, ConditionType):
                if edge.condition == ConditionType.HAS_TOOL_CALLS:
                    tool_target = edge.to_node
                elif edge.condition == ConditionType.NO_TOOL_CALLS:
                    end_target = edge.to_node

        # Build condition map
        # Note: END is a special constant that tools_condition returns
        condition_map: dict[str, str] = {}
        if tool_target:
            condition_map["tools"] = tool_target
        if end_target:
            if end_target == "END":
                condition_map[END] = END
            else:
                condition_map[END] = end_target

        # Use tools_condition for routing
        graph.add_conditional_edges(
            from_node,
            tools_condition,
            condition_map,  # type: ignore[arg-type]
        )

    def _add_custom_routing(
        self,
        graph: DynamicStateGraph,
        from_node: str,
        conditional_edges: list[GraphEdgeConfig],
        unconditional_edges: list[GraphEdgeConfig],
    ) -> None:
        """Add custom condition-based routing."""

        def router(state: StateDict) -> str:
            state_dict = self._state_to_dict(state)

            # Sort by priority
            sorted_edges = sorted(conditional_edges, key=lambda e: e.priority, reverse=True)

            for edge in sorted_edges:
                if isinstance(edge.condition, CustomCondition):
                    if self._evaluate_custom_condition(edge.condition, state_dict):
                        return edge.condition.target

            return "default"

        # Build condition map
        condition_map: dict[str, str] = {}
        for edge in conditional_edges:
            if isinstance(edge.condition, CustomCondition):
                target = edge.condition.target
                to_node = edge.to_node
                condition_map[target] = END if to_node == "END" else to_node

        if unconditional_edges:
            condition_map["default"] = unconditional_edges[0].to_node
        else:
            condition_map["default"] = END

        graph.add_conditional_edges(from_node, router, condition_map)  # type: ignore[arg-type]

    def _evaluate_custom_condition(self, condition: CustomCondition, state_dict: dict[str, Any]) -> bool:
        """Evaluate a custom condition against state."""
        value = state_dict.get(condition.state_key)

        match condition.operator:
            case "eq":
                return value == condition.value
            case "neq":
                return value != condition.value
            case "truthy":
                return bool(value)
            case "falsy":
                return not bool(value)
            case _:
                return False


# --- Exports ---

__all__ = ["GraphBuilder", "build_state_class"]
