"""
Graph Configuration Schema v2 - Simplified and aligned with LangGraph patterns.

This module defines a simplified JSON schema for graph-based agents that:
1. Removes redundant Router node type (uses conditional edges instead)
2. Uses LangGraph's native ToolNode and tools_condition
3. Simplifies state schema to use add_messages reducer
4. Removes unimplemented node types (PARALLEL, HUMAN, SUBAGENT)

Migration from v1 is supported via migrate_graph_config().
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


# --- Enums ---


class NodeType(StrEnum):
    """Simplified node types aligned with LangGraph patterns.

    Removed from v1:
    - ROUTER: Use conditional edges instead
    - PARALLEL: Not implemented, requires LangGraph's Send API
    - HUMAN: Not implemented, requires interrupt/checkpoint support
    - SUBAGENT: Not implemented, requires proper subgraph composition
    """

    LLM = "llm"  # LLM call with optional structured output
    TOOL = "tool"  # Tool execution (uses LangGraph's ToolNode)
    TRANSFORM = "transform"  # Data transformation
    COMPONENT = "component"  # Reference to a registered ExecutableComponent


class ReducerType(StrEnum):
    """Simplified reducer types.

    v1 had: REPLACE, APPEND, MERGE, ADD, MESSAGES
    v2 simplifies to just two needed types.
    """

    REPLACE = "replace"  # Replace value (default)
    ADD_MESSAGES = "add_messages"  # LangGraph's native message reducer


class ConditionType(StrEnum):
    """Built-in condition types for edge routing."""

    HAS_TOOL_CALLS = "has_tool_calls"  # Check if last message has tool calls
    NO_TOOL_CALLS = "no_tool_calls"  # Check if last message has no tool calls


class ConditionOperator(StrEnum):
    """Operators for custom conditions."""

    EQUALS = "eq"
    NOT_EQUALS = "neq"
    TRUTHY = "truthy"
    FALSY = "falsy"


# --- State Schema ---


class StateFieldSchema(BaseModel):
    """Schema for a custom state field."""

    type: Literal["string", "int", "float", "bool", "list", "dict", "any"] = Field(description="Field type")
    description: str | None = Field(default=None, description="Human-readable description")
    default: Any = Field(default=None, description="Default value")
    reducer: ReducerType = Field(
        default=ReducerType.REPLACE,
        description="How to combine multiple updates",
    )


# --- Tool Configuration ---


class ToolSetConfig(BaseModel):
    """Tool configuration for the graph.

    Uses LangGraph's ToolNode for execution.
    """

    # Filter to specific tools (None = all available tools)
    tool_filter: list[str] | None = Field(
        default=None,
        description="List of tool names to enable. None means all tools.",
    )

    # Execution settings
    timeout_seconds: int = Field(
        default=60,
        ge=1,
        le=600,
        description="Tool execution timeout",
    )
    max_parallel: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Maximum parallel tool executions",
    )


# --- Structured Output ---


class StructuredOutputField(BaseModel):
    """Definition of a field in structured output schema."""

    type: Literal["string", "bool", "int", "float", "list", "dict"] = Field(description="Field type")
    description: str = Field(default="", description="Field description for LLM guidance")
    required: bool = Field(default=True, description="Whether the field is required")


class StructuredOutputSchema(BaseModel):
    """JSON-based schema for structured LLM output."""

    fields: dict[str, StructuredOutputField] = Field(description="Field definitions for the structured output")
    description: str = Field(default="", description="Description of what this output represents")


# --- Node Configurations ---


class LLMNodeConfig(BaseModel):
    """Configuration for LLM nodes."""

    prompt_template: str = Field(description="Jinja2 template for the prompt. Access state via {{ state.field_name }}")
    output_key: str = Field(
        default="response",
        description="State key to store the LLM response",
    )
    model_override: str | None = Field(
        default=None,
        description="Override the agent's default model",
    )
    temperature_override: float | None = Field(
        default=None,
        ge=0.0,
        le=2.0,
        description="Override temperature",
    )
    max_tokens: int | None = Field(
        default=None,
        description="Maximum tokens in response",
    )
    tools_enabled: bool = Field(
        default=True,
        description="Whether to bind tools to this LLM call",
    )
    tool_filter: list[str] | None = Field(
        default=None,
        description="Specific tool names to enable (None = all)",
    )
    max_iterations: int = Field(
        default=10,
        ge=1,
        description="Maximum iterations for tool loops",
    )
    structured_output: StructuredOutputSchema | None = Field(
        default=None,
        description="Schema for structured JSON output",
    )
    message_key: str | None = Field(
        default=None,
        description="Field from structured output to use as user-facing message",
    )


class ToolNodeConfig(BaseModel):
    """Configuration for tool execution nodes.

    Uses LangGraph's ToolNode internally.
    """

    # Tool selection
    execute_all: bool = Field(
        default=True,
        description="Execute all pending tool calls from the last AI message",
    )
    tool_filter: list[str] | None = Field(
        default=None,
        description="Filter to specific tools (None = all)",
    )
    output_key: str = Field(
        default="tool_results",
        description="State key to store tool results",
    )
    timeout_seconds: int = Field(
        default=60,
        ge=1,
        le=600,
        description="Tool execution timeout",
    )


class TransformNodeConfig(BaseModel):
    """Configuration for data transformation nodes."""

    template: str = Field(description="Jinja2 template for the transformation")
    output_key: str = Field(description="State key to store the transformation result")
    input_keys: list[str] = Field(
        default_factory=list,
        description="State keys required for this transformation",
    )


# --- Component Node Configuration ---


class ComponentReference(BaseModel):
    """Reference to a registered ExecutableComponent."""

    key: str = Field(description="Component key (e.g., 'system:deep_research:supervisor', 'stdlib:react')")
    version: str = Field(
        default="*",
        description="SemVer constraint (e.g., '^2.0', '>=1.0.0', '*' for any)",
    )


class ComponentNodeConfig(BaseModel):
    """Configuration for component nodes.

    Component nodes reference ExecutableComponents from the component registry.
    At build time, the component is resolved and its build_graph() method is called.
    """

    component_ref: ComponentReference = Field(description="Reference to the component (key and version constraint)")
    config_overrides: dict[str, Any] = Field(
        default_factory=dict,
        description="Runtime configuration overrides passed to build_graph()",
    )


# --- Edge Conditions ---


class CustomCondition(BaseModel):
    """Custom routing condition based on state."""

    state_key: str = Field(description="State key to evaluate")
    operator: ConditionOperator = Field(description="Comparison operator")
    value: Any = Field(default=None, description="Value to compare against")
    target: str = Field(description="Target node if condition matches")


# --- Graph Node ---


class GraphNodeConfig(BaseModel):
    """Configuration for a single graph node."""

    id: str = Field(description="Unique identifier within the graph")
    name: str = Field(description="Human-readable display name")
    type: NodeType = Field(description="Node type determining execution behavior")
    description: str | None = Field(default=None, description="Description of what this node does")

    # Type-specific configurations (exactly one should be set based on type)
    llm_config: LLMNodeConfig | None = None
    tool_config: ToolNodeConfig | None = None
    transform_config: TransformNodeConfig | None = None
    component_config: ComponentNodeConfig | None = None

    # UI positioning for visual editor
    position: dict[str, float] | None = Field(
        default=None,
        description="Position for visual editor: {'x': float, 'y': float}",
    )

    # Metadata
    tags: list[str] = Field(default_factory=list, description="Tags for categorization")


# --- Graph Edge ---


class GraphEdgeConfig(BaseModel):
    """Configuration for an edge between nodes.

    Supports both built-in conditions (has_tool_calls, no_tool_calls)
    and custom conditions based on state values.
    """

    from_node: str = Field(description="Source node ID (use 'START' for entry point)")
    to_node: str = Field(description="Target node ID (use 'END' for exit point)")

    # Condition (if None, unconditional edge)
    # Can be a built-in condition type or a custom condition
    condition: ConditionType | CustomCondition | None = Field(
        default=None,
        description="Optional condition for this edge",
    )

    label: str | None = Field(default=None, description="Label for UI display")
    priority: int = Field(
        default=0,
        description="Priority when multiple edges match (higher = checked first)",
    )


# --- Complete Graph Configuration ---


class GraphConfig(BaseModel):
    """Complete graph configuration v2.

    Simplified schema aligned with LangGraph patterns:
    - No separate router nodes (use conditional edges)
    - Uses LangGraph's ToolNode and tools_condition
    - Simplified state with add_messages reducer
    """

    version: str = Field(default="2.0", description="Schema version")

    # Custom state fields (messages field is always added automatically)
    custom_state_fields: dict[str, StateFieldSchema] = Field(
        default_factory=dict,
        description="Additional state fields beyond 'messages'",
    )

    # Graph structure
    nodes: list[GraphNodeConfig] = Field(description="All nodes in the graph")
    edges: list[GraphEdgeConfig] = Field(description="Connections between nodes")

    # Entry point (defaults to first node)
    entry_point: str | None = Field(
        default=None,
        description="Node ID to start execution (defaults to first node)",
    )

    # Tool configuration
    tool_config: ToolSetConfig | None = Field(
        default=None,
        description="Global tool configuration",
    )

    # Metadata
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata (author, description, pattern, etc.)",
    )

    # Execution settings
    max_execution_time_seconds: int = Field(
        default=300,
        ge=1,
        le=3600,
        description="Maximum total execution time",
    )


# --- Validation ---


def validate_graph_config(config: GraphConfig) -> list[str]:
    """Validate a v2 graph configuration for structural correctness.

    Returns a list of validation errors (empty if valid).
    """
    errors: list[str] = []
    node_ids = {node.id for node in config.nodes}

    # Check entry_point
    entry = config.entry_point or (config.nodes[0].id if config.nodes else None)
    if entry and entry not in node_ids:
        errors.append(f"Entry point '{entry}' not found in nodes")

    # Check edge references
    valid_refs = node_ids | {"START", "END"}
    for edge in config.edges:
        if edge.from_node not in valid_refs:
            errors.append(f"Edge from_node '{edge.from_node}' not found")
        if edge.to_node not in valid_refs:
            errors.append(f"Edge to_node '{edge.to_node}' not found")

    # Check node configs match types
    for node in config.nodes:
        match node.type:
            case NodeType.LLM:
                if not node.llm_config:
                    errors.append(f"Node '{node.id}' is type LLM but missing llm_config")
            case NodeType.TOOL:
                if not node.tool_config:
                    errors.append(f"Node '{node.id}' is type TOOL but missing tool_config")
            case NodeType.TRANSFORM:
                if not node.transform_config:
                    errors.append(f"Node '{node.id}' is type TRANSFORM but missing transform_config")
            case NodeType.COMPONENT:
                if not node.component_config:
                    errors.append(f"Node '{node.id}' is type COMPONENT but missing component_config")
                elif not node.component_config.component_ref.key:
                    errors.append(f"Node '{node.id}' component_config missing component_ref.key")

    # Check reachability
    reachable = {"START"}
    changed = True
    while changed:
        changed = False
        for edge in config.edges:
            if edge.from_node in reachable and edge.to_node not in reachable:
                reachable.add(edge.to_node)
                changed = True

    unreachable = node_ids - reachable
    if unreachable:
        errors.append(f"Unreachable nodes: {unreachable}")

    return errors


# --- Migration from v1 ---


def migrate_v1_to_v2(v1_config: dict[str, Any]) -> GraphConfig:
    """Migrate a v1 GraphConfig to v2 format.

    Handles:
    - Empty configs: Returns default ReAct config
    - Converting router nodes to conditional edges
    - Simplifying state schema
    - Updating tool node configs
    - Preserving metadata
    """
    # Extract v1 data
    v1_nodes = v1_config.get("nodes", [])
    v1_edges = v1_config.get("edges", [])

    # Handle empty configs by returning a default ReAct config
    # This ensures old agents with unconfigured graphs still work
    if not v1_nodes:
        return create_react_config(
            prompt="You are a helpful assistant.",
            tools_enabled=True,
        )

    nodes: list[GraphNodeConfig] = []
    edges: list[GraphEdgeConfig] = []
    custom_state_fields: dict[str, StateFieldSchema] = {}

    v1_state = v1_config.get("state_schema", {}).get("fields", {})

    # Migrate state fields (skip 'messages' and 'has_tool_calls' as they're handled automatically)
    for field_name, field_def in v1_state.items():
        if field_name in ("messages", "has_tool_calls"):
            continue

        # Map v1 reducer to v2
        v1_reducer = field_def.get("reducer", "replace")
        v2_reducer = ReducerType.ADD_MESSAGES if v1_reducer == "messages" else ReducerType.REPLACE

        custom_state_fields[field_name] = StateFieldSchema(
            type=field_def.get("type", "any"),
            description=field_def.get("description"),
            default=field_def.get("default"),
            reducer=v2_reducer,
        )

    # Track router nodes for edge conversion
    router_nodes: dict[str, dict] = {}

    # Migrate nodes
    for v1_node in v1_nodes:
        node_type = v1_node.get("type", "llm")
        node_id = v1_node.get("id", "")

        # Skip router nodes - they become conditional edges
        if node_type == "router":
            router_nodes[node_id] = v1_node
            continue

        # Skip unimplemented types
        if node_type in ("parallel", "human", "subagent"):
            continue

        # Convert node
        v2_node = GraphNodeConfig(
            id=node_id,
            name=v1_node.get("name", node_id),
            type=NodeType(node_type) if node_type in ("llm", "tool", "transform") else NodeType.LLM,
            description=v1_node.get("description"),
            position=v1_node.get("position"),
            tags=v1_node.get("tags", []),
        )

        # Migrate type-specific config
        if node_type == "llm" and v1_node.get("llm_config"):
            v1_llm = v1_node["llm_config"]
            v2_node.llm_config = LLMNodeConfig(
                prompt_template=v1_llm.get("prompt_template", ""),
                output_key=v1_llm.get("output_key", "response"),
                model_override=v1_llm.get("model_override"),
                temperature_override=v1_llm.get("temperature_override"),
                max_tokens=v1_llm.get("max_tokens"),
                tools_enabled=v1_llm.get("tools_enabled", True),
                tool_filter=v1_llm.get("tool_filter"),
                max_iterations=v1_llm.get("max_iterations", 10),
            )

        elif node_type == "tool" and v1_node.get("tool_config"):
            v1_tool = v1_node["tool_config"]
            # Convert __all__ magic string to execute_all=True
            is_all = v1_tool.get("tool_name") == "__all__"
            v2_node.tool_config = ToolNodeConfig(
                execute_all=is_all,
                tool_filter=None if is_all else [v1_tool.get("tool_name", "")],
                output_key=v1_tool.get("output_key", "tool_results"),
                timeout_seconds=v1_tool.get("timeout_seconds", 60),
            )

        elif node_type == "transform" and v1_node.get("transform_config"):
            v1_transform = v1_node["transform_config"]
            v2_node.transform_config = TransformNodeConfig(
                template=v1_transform.get("template", ""),
                output_key=v1_transform.get("output_key", "result"),
                input_keys=v1_transform.get("input_keys", []),
            )

        nodes.append(v2_node)

    # Migrate edges, converting router references to conditional edges
    for v1_edge in v1_edges:
        from_node = v1_edge.get("from_node", "")
        to_node = v1_edge.get("to_node", "")

        # Skip edges to/from router nodes - we'll handle them specially
        if from_node in router_nodes:
            # This edge comes FROM a router - convert to conditional edge
            _router = router_nodes[from_node]  # noqa: F841

            # Find the condition for this target
            v1_condition = v1_edge.get("condition")
            if v1_condition:
                # Check if it's a tool_calls condition
                state_key = v1_condition.get("state_key", "")
                value = v1_condition.get("value")

                if state_key == "has_tool_calls":
                    condition = ConditionType.HAS_TOOL_CALLS if value else ConditionType.NO_TOOL_CALLS
                else:
                    condition = CustomCondition(
                        state_key=state_key,
                        operator=ConditionOperator(v1_condition.get("operator", "eq")),
                        value=value,
                        target=to_node,
                    )
            else:
                condition = None

            # Find the node that leads TO this router
            for other_edge in v1_edges:
                if other_edge.get("to_node") == from_node:
                    edges.append(
                        GraphEdgeConfig(
                            from_node=other_edge.get("from_node", ""),
                            to_node=to_node,
                            condition=condition,
                            label=v1_edge.get("label"),
                            priority=v1_edge.get("priority", 0),
                        )
                    )
            continue

        if to_node in router_nodes:
            # Skip edges TO router nodes - they're handled above
            continue

        # Regular edge
        v1_condition = v1_edge.get("condition")
        condition = None
        if v1_condition:
            state_key = v1_condition.get("state_key", "")
            value = v1_condition.get("value")
            if state_key == "has_tool_calls":
                condition = ConditionType.HAS_TOOL_CALLS if value else ConditionType.NO_TOOL_CALLS
            else:
                condition = CustomCondition(
                    state_key=state_key,
                    operator=ConditionOperator(v1_condition.get("operator", "eq")),
                    value=value,
                    target=to_node,
                )

        edges.append(
            GraphEdgeConfig(
                from_node=from_node,
                to_node=to_node,
                condition=condition,
                label=v1_edge.get("label"),
                priority=v1_edge.get("priority", 0),
            )
        )

    # Build v2 config
    return GraphConfig(
        version="2.0",
        custom_state_fields=custom_state_fields,
        nodes=nodes,
        edges=edges,
        entry_point=v1_config.get("entry_point"),
        metadata={
            **v1_config.get("metadata", {}),
            "migrated_from": "v1",
        },
        max_execution_time_seconds=v1_config.get("max_execution_time_seconds", 300),
    )


def migrate_graph_config(config: dict[str, Any]) -> GraphConfig:
    """Migrate a graph config from any version to v2.

    Args:
        config: Raw config dict (may be v1 or v2)

    Returns:
        GraphConfig v2 instance
    """
    version = config.get("version", "1.0")

    if version.startswith("2."):
        return GraphConfig.model_validate(config)

    if version.startswith("1."):
        return migrate_v1_to_v2(config)

    # Unknown version - try to parse as v2
    return GraphConfig.model_validate(config)


# --- Factory Functions ---


def create_react_config(
    prompt: str = "You are a helpful assistant.",
    model: str | None = None,
    temperature: float | None = None,
    tools_enabled: bool = True,
    max_iterations: int = 10,
) -> GraphConfig:
    """Create a standard ReAct agent configuration.

    This is the canonical way to create a ReAct-style agent config.
    Replaces the need for frontend to duplicate this logic.
    """
    return GraphConfig(
        version="2.0",
        nodes=[
            GraphNodeConfig(
                id="agent",
                name="Agent",
                type=NodeType.LLM,
                description="Reasons about the task and decides whether to use tools or respond",
                llm_config=LLMNodeConfig(
                    prompt_template=prompt,
                    output_key="response",
                    model_override=model,
                    temperature_override=temperature,
                    tools_enabled=tools_enabled,
                    max_iterations=max_iterations,
                ),
                position={"x": 250, "y": 100},
            ),
            GraphNodeConfig(
                id="tools",
                name="Execute Tools",
                type=NodeType.TOOL,
                description="Executes tool calls from the agent",
                tool_config=ToolNodeConfig(
                    execute_all=True,
                    output_key="tool_results",
                ),
                position={"x": 450, "y": 250},
            ),
        ],
        edges=[
            GraphEdgeConfig(from_node="START", to_node="agent"),
            GraphEdgeConfig(
                from_node="agent",
                to_node="tools",
                condition=ConditionType.HAS_TOOL_CALLS,
            ),
            GraphEdgeConfig(
                from_node="agent",
                to_node="END",
                condition=ConditionType.NO_TOOL_CALLS,
            ),
            GraphEdgeConfig(from_node="tools", to_node="agent"),
        ],
        entry_point="agent",
        metadata={
            "pattern": "react",
            "description": "ReAct agent with tool-calling loop",
        },
    )


# --- Exports ---


__all__ = [
    # Enums
    "NodeType",
    "ReducerType",
    "ConditionType",
    "ConditionOperator",
    # State
    "StateFieldSchema",
    # Tool config
    "ToolSetConfig",
    # Structured output
    "StructuredOutputField",
    "StructuredOutputSchema",
    # Node configs
    "LLMNodeConfig",
    "ToolNodeConfig",
    "TransformNodeConfig",
    # Component configs
    "ComponentReference",
    "ComponentNodeConfig",
    # Edge
    "CustomCondition",
    "GraphEdgeConfig",
    # Node
    "GraphNodeConfig",
    # Main config
    "GraphConfig",
    # Functions
    "validate_graph_config",
    "migrate_graph_config",
    "migrate_v1_to_v2",
    "create_react_config",
]
