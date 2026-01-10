"""
Graph Configuration Schema for JSON-configurable agents.

This module defines the complete JSON schema for graph-based agents,
allowing users to configure agent workflows via JSON configuration.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class NodeType(StrEnum):
    """Types of nodes in a graph agent."""

    LLM = "llm"  # LLM reasoning node
    TOOL = "tool"  # Tool execution node
    ROUTER = "router"  # Conditional routing node
    SUBAGENT = "subagent"  # Nested agent invocation
    TRANSFORM = "transform"  # Data transformation
    PARALLEL = "parallel"  # Parallel execution of multiple branches
    HUMAN = "human"  # Human-in-the-loop checkpoint


class ConditionOperator(StrEnum):
    """Operators for edge conditions."""

    EQUALS = "eq"
    NOT_EQUALS = "neq"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    GREATER_THAN = "gt"
    GREATER_THAN_OR_EQUAL = "gte"
    LESS_THAN = "lt"
    LESS_THAN_OR_EQUAL = "lte"
    IN = "in"
    NOT_IN = "not_in"
    TRUTHY = "truthy"
    FALSY = "falsy"
    MATCHES = "matches"  # Regex match


class ReducerType(StrEnum):
    """Reducer types for state fields with multiple updates."""

    REPLACE = "replace"  # Replace value (default)
    APPEND = "append"  # Append to list
    MERGE = "merge"  # Merge dictionaries
    ADD = "add"  # Add numbers
    MESSAGES = "messages"  # Special reducer for message lists


# --- State Schema Definitions ---


class StateFieldSchema(BaseModel):
    """Schema for a single state field."""

    type: str = Field(description="Field type: 'string', 'int', 'float', 'bool', 'list', 'dict', 'messages', 'any'")
    description: str | None = Field(default=None, description="Human-readable field description")
    default: Any = Field(default=None, description="Default value for the field")
    reducer: ReducerType | None = Field(
        default=None,
        description="How to combine multiple updates to this field",
    )
    required: bool = Field(default=False, description="Whether this field is required")


class GraphStateSchema(BaseModel):
    """Complete state schema for a graph agent."""

    fields: dict[str, StateFieldSchema] = Field(
        default_factory=dict,
        description="Field definitions. 'messages' and 'execution_context' are always added automatically.",
    )


# --- Node Configuration Definitions ---


class StructuredOutputField(BaseModel):
    """Definition of a field in structured output schema."""

    type: str = Field(description="Field type: 'string', 'bool', 'int', 'float', 'list', 'dict'")
    description: str = Field(default="", description="Field description for LLM guidance")
    default: Any = Field(default=None, description="Default value if not provided")
    required: bool = Field(default=True, description="Whether the field is required")


class StructuredOutputSchema(BaseModel):
    """JSON-based schema for structured LLM output.

    This allows defining output structure directly in JSON config,
    which is then converted to a Pydantic model at runtime.
    """

    fields: dict[str, StructuredOutputField] = Field(description="Field definitions for the structured output")
    description: str = Field(default="", description="Description of what this output represents")


class LLMNodeConfig(BaseModel):
    """Configuration for LLM reasoning nodes."""

    prompt_template: str = Field(description="Jinja2 template for the prompt. Access state via {{ state.field_name }}")
    output_key: str = Field(default="response", description="State key to store the LLM response")
    model_override: str | None = Field(default=None, description="Override the agent's default model")
    temperature_override: float | None = Field(default=None, ge=0.0, le=2.0, description="Override temperature")
    max_tokens: int | None = Field(default=None, description="Maximum tokens in response")
    tools_enabled: bool = Field(default=True, description="Whether to bind tools to this LLM call")
    tool_filter: list[str] | None = Field(default=None, description="Specific tool names to enable (None = all)")
    max_iterations: int = Field(default=10, ge=1, description="Maximum iterations for ReAct-style tool loops")
    stop_sequences: list[str] | None = Field(default=None, description="Stop sequences for generation")

    # Structured output configuration
    structured_output: StructuredOutputSchema | None = Field(
        default=None,
        description="Schema for structured JSON output. When set, LLM response is parsed into fields.",
    )
    message_key: str | None = Field(
        default=None,
        description="Field from structured output to use as user-facing message (prevents raw JSON display).",
    )
    message_key_condition: dict[str, str] | None = Field(
        default=None,
        description=(
            "Conditional message field selection. Format: {'condition_field': 'bool_field', "
            "'true_key': 'field_if_true', 'false_key': 'field_if_false'}. "
            "Example: {'condition_field': 'need_clarification', 'true_key': 'question', 'false_key': 'verification'}"
        ),
    )


class ToolNodeConfig(BaseModel):
    """Configuration for tool execution nodes."""

    tool_name: str = Field(description="Name of the tool (MCP tool name or built-in)")
    arguments_template: dict[str, str] = Field(
        default_factory=dict,
        description="Jinja2 templates for tool arguments. Keys are argument names.",
    )
    output_key: str = Field(default="tool_result", description="State key to store the tool result")
    timeout_seconds: int = Field(default=60, ge=1, le=600, description="Tool execution timeout")
    retry_count: int = Field(default=0, ge=0, le=3, description="Number of retries on failure")


class EdgeCondition(BaseModel):
    """Condition for conditional routing."""

    state_key: str = Field(description="State key to evaluate")
    operator: ConditionOperator = Field(description="Comparison operator")
    value: Any = Field(default=None, description="Value to compare against (not needed for truthy/falsy)")
    target: str = Field(description="Target node name if condition matches")


class RouterNodeConfig(BaseModel):
    """Configuration for routing/branching decisions."""

    strategy: Literal["condition", "llm", "state_check"] = Field(
        default="condition",
        description="Routing strategy: 'condition' (rule-based), 'llm' (AI decides), 'state_check'",
    )
    conditions: list[EdgeCondition] = Field(
        default_factory=list,
        description="List of conditions to evaluate (for 'condition' strategy)",
    )
    llm_prompt: str | None = Field(
        default=None,
        description="Prompt for LLM to decide route (for 'llm' strategy). Should output route name.",
    )
    routes: list[str] = Field(
        default_factory=list,
        description="Valid route names the router can choose from",
    )
    default_route: str = Field(default="END", description="Fallback route if no conditions match")


class SubagentNodeConfig(BaseModel):
    """Configuration for invoking nested agents."""

    agent_ref: str = Field(
        description="Agent reference: UUID for user agents, key for system agents (e.g., 'deep_research')"
    )
    input_mapping: dict[str, str] = Field(
        default_factory=dict,
        description="Map parent state keys to child input. Values are Jinja2 expressions.",
    )
    output_mapping: dict[str, str] = Field(
        default_factory=dict,
        description="Map child output keys to parent state keys",
    )
    inherit_context: bool = Field(default=True, description="Whether to pass execution context to the subagent")
    inherit_tools: bool = Field(default=True, description="Whether subagent inherits parent's tools")
    timeout_seconds: int = Field(default=300, ge=1, le=3600, description="Subagent execution timeout")


class ParallelNodeConfig(BaseModel):
    """Configuration for parallel execution of multiple branches."""

    branches: list[str] = Field(description="Node names to execute in parallel")
    join_strategy: Literal["wait_all", "wait_any", "wait_n"] = Field(
        default="wait_all",
        description="How to wait for branches: all, any, or N branches",
    )
    wait_count: int | None = Field(default=None, description="Number of branches to wait for (for 'wait_n' strategy)")
    merge_strategy: Literal["merge_dicts", "list", "first", "custom"] = Field(
        default="merge_dicts",
        description="How to merge results from parallel branches",
    )
    merge_key: str = Field(default="parallel_results", description="State key to store merged results")
    timeout_seconds: int = Field(default=120, ge=1, le=600, description="Timeout for parallel execution")


class TransformNodeConfig(BaseModel):
    """Configuration for data transformation."""

    expression: str | None = Field(
        default=None,
        description="Python expression evaluated in restricted context. Use state['key'] to access values.",
    )
    template: str | None = Field(default=None, description="Jinja2 template for complex transformations")
    output_key: str = Field(description="State key to store the transformation result")
    input_keys: list[str] = Field(default_factory=list, description="State keys required for this transformation")


class HumanNodeConfig(BaseModel):
    """Configuration for human-in-the-loop checkpoints."""

    prompt_template: str = Field(description="Message to display to the human")
    input_type: Literal["text", "choice", "confirm", "form"] = Field(
        default="text", description="Type of human input expected"
    )
    choices: list[str] | None = Field(default=None, description="Available choices (for 'choice' input type)")
    form_schema: dict[str, Any] | None = Field(
        default=None, description="JSON Schema for form input (for 'form' input type)"
    )
    output_key: str = Field(default="human_input", description="State key to store human response")
    timeout_seconds: int | None = Field(default=None, description="Timeout for human response (None = no timeout)")


# --- Graph Node Definition ---


class GraphNodeConfig(BaseModel):
    """Complete configuration for a single graph node."""

    id: str = Field(description="Unique identifier within the graph")
    name: str = Field(description="Human-readable display name")
    type: NodeType = Field(description="Node type determining execution behavior")
    description: str | None = Field(default=None, description="Description of what this node does")

    # Type-specific configurations (exactly one should be set based on type)
    llm_config: LLMNodeConfig | None = None
    tool_config: ToolNodeConfig | None = None
    router_config: RouterNodeConfig | None = None
    subagent_config: SubagentNodeConfig | None = None
    parallel_config: ParallelNodeConfig | None = None
    transform_config: TransformNodeConfig | None = None
    human_config: HumanNodeConfig | None = None

    # UI positioning for visual editor
    position: dict[str, float] | None = Field(
        default=None, description="Position for visual editor: {'x': float, 'y': float}"
    )

    # Error handling
    on_error: Literal["raise", "continue", "retry", "fallback"] = Field(
        default="raise", description="Error handling strategy"
    )
    retry_count: int = Field(default=0, ge=0, le=5, description="Retries before failing")
    fallback_node: str | None = Field(default=None, description="Node to execute on error (for 'fallback' strategy)")

    # Metadata
    tags: list[str] = Field(default_factory=list, description="Tags for categorization")


# --- Graph Edge Definition ---


class GraphEdgeConfig(BaseModel):
    """Configuration for an edge between nodes."""

    from_node: str = Field(description="Source node ID (use 'START' for entry point)")
    to_node: str = Field(description="Target node ID (use 'END' for exit point)")
    condition: EdgeCondition | None = Field(
        default=None, description="Optional condition for this edge (None = unconditional)"
    )
    label: str | None = Field(default=None, description="Label for UI display")
    priority: int = Field(default=0, description="Priority when multiple edges match (higher = checked first)")


# --- Complete Graph Configuration ---


class GraphConfig(BaseModel):
    """
    Complete graph configuration stored in agent.graph_config.

    This schema defines everything needed to build and execute a graph-based agent.
    """

    version: str = Field(default="1.0", description="Schema version for compatibility")

    # State definition
    state_schema: GraphStateSchema = Field(
        default_factory=GraphStateSchema,
        description="State schema defining fields passed between nodes",
    )

    # Graph structure
    nodes: list[GraphNodeConfig] = Field(description="All nodes in the graph")
    edges: list[GraphEdgeConfig] = Field(description="Connections between nodes")

    # Entry and exit
    entry_point: str = Field(description="Node ID to start execution (first node after START)")
    exit_points: list[str] = Field(
        default_factory=lambda: ["END"],
        description="Node IDs that terminate execution",
    )

    # Reusable prompt templates
    prompt_templates: dict[str, str] = Field(
        default_factory=dict,
        description="Named prompt templates that can be referenced via {{ prompt_templates.name }}",
    )

    # Component references for importing reusable components
    imported_components: list[str] = Field(
        default_factory=list,
        description="Component registry keys to import (e.g., 'system:deep_research:query_analyzer')",
    )

    # Metadata
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata (author, description, etc.)",
    )

    # Execution settings
    max_execution_time_seconds: int = Field(default=300, ge=1, le=3600, description="Maximum total execution time")
    enable_checkpoints: bool = Field(default=True, description="Whether to save checkpoints for resumption")


# --- Helper Functions ---


def validate_graph_config(config: GraphConfig) -> list[str]:
    """
    Validate a graph configuration for structural correctness.

    Returns a list of validation errors (empty if valid).
    """
    errors: list[str] = []

    # Check that entry_point exists
    node_ids = {node.id for node in config.nodes}
    if config.entry_point not in node_ids:
        errors.append(f"Entry point '{config.entry_point}' not found in nodes")

    # Check that all edge references are valid
    valid_refs = node_ids | {"START", "END"}
    for edge in config.edges:
        if edge.from_node not in valid_refs:
            errors.append(f"Edge from_node '{edge.from_node}' not found")
        if edge.to_node not in valid_refs:
            errors.append(f"Edge to_node '{edge.to_node}' not found")

    # Check that each node has the correct config for its type
    for node in config.nodes:
        match node.type:
            case NodeType.LLM:
                if not node.llm_config:
                    errors.append(f"Node '{node.id}' is type LLM but missing llm_config")
            case NodeType.TOOL:
                if not node.tool_config:
                    errors.append(f"Node '{node.id}' is type TOOL but missing tool_config")
            case NodeType.ROUTER:
                if not node.router_config:
                    errors.append(f"Node '{node.id}' is type ROUTER but missing router_config")
            case NodeType.SUBAGENT:
                if not node.subagent_config:
                    errors.append(f"Node '{node.id}' is type SUBAGENT but missing subagent_config")
            case NodeType.PARALLEL:
                if not node.parallel_config:
                    errors.append(f"Node '{node.id}' is type PARALLEL but missing parallel_config")
            case NodeType.TRANSFORM:
                if not node.transform_config:
                    errors.append(f"Node '{node.id}' is type TRANSFORM but missing transform_config")
            case NodeType.HUMAN:
                if not node.human_config:
                    errors.append(f"Node '{node.id}' is type HUMAN but missing human_config")

    # Check for unreachable nodes
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

    # Check for nodes that don't lead to END
    leads_to_end: set[str] = {"END"}
    changed = True
    while changed:
        changed = False
        for edge in config.edges:
            if edge.to_node in leads_to_end and edge.from_node not in leads_to_end:
                leads_to_end.add(edge.from_node)
                changed = True

    dead_ends = node_ids - leads_to_end
    if dead_ends:
        errors.append(f"Nodes that don't lead to END: {dead_ends}")

    return errors


# Export commonly used types
__all__ = [
    "NodeType",
    "ConditionOperator",
    "ReducerType",
    "StateFieldSchema",
    "GraphStateSchema",
    "LLMNodeConfig",
    "ToolNodeConfig",
    "RouterNodeConfig",
    "SubagentNodeConfig",
    "ParallelNodeConfig",
    "TransformNodeConfig",
    "HumanNodeConfig",
    "GraphNodeConfig",
    "EdgeCondition",
    "GraphEdgeConfig",
    "GraphConfig",
    "validate_graph_config",
]
