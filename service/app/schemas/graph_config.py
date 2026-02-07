"""
Graph Configuration Schema.

Canonical IR for executable graph definitions.
Enforces strict field boundaries and explicit entrypoints.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.prompt_config import PromptConfig


class GraphNodeKind(StrEnum):
    """Supported executable node kinds."""

    LLM = "llm"
    TOOL = "tool"
    TRANSFORM = "transform"
    COMPONENT = "component"


class StateFieldType(StrEnum):
    """Supported state field types."""

    STRING = "string"
    INT = "int"
    FLOAT = "float"
    BOOL = "bool"
    LIST = "list"
    DICT = "dict"
    ANY = "any"


class StateReducerType(StrEnum):
    """Supported state reducers."""

    REPLACE = "replace"
    ADD_MESSAGES = "add_messages"


class BuiltinEdgeCondition(StrEnum):
    """Built-in edge conditions."""

    HAS_TOOL_CALLS = "has_tool_calls"
    NO_TOOL_CALLS = "no_tool_calls"


class PredicateOperator(StrEnum):
    """Supported custom predicate operators."""

    EQUALS = "eq"
    NOT_EQUALS = "neq"
    TRUTHY = "truthy"
    FALSY = "falsy"


class StateFieldSchema(BaseModel):
    """State field schema definition."""

    model_config = ConfigDict(extra="forbid")

    type: StateFieldType = Field(description="State value type")
    description: str | None = Field(default=None, description="Human-readable description")
    default: Any = Field(default=None, description="Default value")


class GraphStateConfig(BaseModel):
    """State contract for the graph."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    state_schema: dict[str, StateFieldSchema] = Field(
        default_factory=dict,
        alias="schema",
        description="State field schema by path/key",
    )
    reducers: dict[str, StateReducerType] = Field(
        default_factory=dict,
        description="Reducer configuration by state path/key",
    )


class GraphExecutionLimits(BaseModel):
    """Execution safeguards for loops and runaway workflows."""

    model_config = ConfigDict(extra="forbid")

    max_time_s: int = Field(default=300, ge=1, le=3600)
    max_steps: int = Field(default=128, ge=1, le=100000)
    max_concurrency: int = Field(default=10, ge=1, le=256)


class ModelDependencyRef(BaseModel):
    """Model dependency declaration."""

    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1)
    provider: str | None = None
    version: str | None = None


class PromptDependencyRef(BaseModel):
    """Prompt dependency declaration."""

    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1)
    version: str | None = None


class ComponentDependencyRef(BaseModel):
    """Component dependency declaration."""

    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1)
    version: str = Field(default="*")


class GraphDeps(BaseModel):
    """External references used by this graph definition."""

    model_config = ConfigDict(extra="forbid")

    models: list[ModelDependencyRef] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    prompts: list[PromptDependencyRef] = Field(default_factory=list)
    components: list[ComponentDependencyRef] = Field(default_factory=list)


class GraphMetadata(BaseModel):
    """Display metadata that does not affect execution semantics."""

    model_config = ConfigDict(extra="forbid")

    display_name: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    agent_version: str | None = None


class LLMNodeConfig(BaseModel):
    """LLM node runtime configuration."""

    model_config = ConfigDict(extra="forbid")

    prompt_template: str = ""
    output_key: str = "response"
    model_override: str | None = None
    temperature_override: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = None
    tools_enabled: bool = True
    tool_filter: list[str] | None = None
    max_iterations: int = Field(default=10, ge=1)
    message_key: str | None = None


class ToolNodeConfig(BaseModel):
    """Tool node runtime configuration."""

    model_config = ConfigDict(extra="forbid")

    execute_all: bool = True
    tool_filter: list[str] | None = None
    output_key: str = "tool_results"
    timeout_seconds: int = Field(default=60, ge=1, le=600)


class TransformNodeConfig(BaseModel):
    """Transform node runtime configuration."""

    model_config = ConfigDict(extra="forbid")

    template: str
    output_key: str
    input_keys: list[str] = Field(default_factory=list)


class ComponentReference(BaseModel):
    """Reference to a registered executable component."""

    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1)
    version: str = Field(default="*")


class ComponentNodeConfig(BaseModel):
    """Component node runtime configuration."""

    model_config = ConfigDict(extra="forbid")

    component_ref: ComponentReference
    config_overrides: dict[str, Any] = Field(default_factory=dict)


class GraphNodeBase(BaseModel):
    """Common node fields."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str | None = None
    reads: list[str] = Field(default_factory=list)
    writes: list[str] = Field(default_factory=list)


class LLMGraphNode(GraphNodeBase):
    """LLM node."""

    kind: Literal[GraphNodeKind.LLM]
    config: LLMNodeConfig


class ToolGraphNode(GraphNodeBase):
    """Tool node."""

    kind: Literal[GraphNodeKind.TOOL]
    config: ToolNodeConfig


class TransformGraphNode(GraphNodeBase):
    """Transform node."""

    kind: Literal[GraphNodeKind.TRANSFORM]
    config: TransformNodeConfig


class ComponentGraphNode(GraphNodeBase):
    """Component node."""

    kind: Literal[GraphNodeKind.COMPONENT]
    config: ComponentNodeConfig


GraphNodeConfig = Annotated[
    LLMGraphNode | ToolGraphNode | TransformGraphNode | ComponentGraphNode,
    Field(discriminator="kind"),
]


class EdgePredicate(BaseModel):
    """Custom edge predicate on state."""

    model_config = ConfigDict(extra="forbid")

    state_path: str = Field(min_length=1)
    operator: PredicateOperator
    value: Any = None


class GraphEdgeConfig(BaseModel):
    """Directed edge in the graph."""

    model_config = ConfigDict(extra="forbid")

    from_node: str = Field(min_length=1, description="Node ID or START")
    to_node: str = Field(min_length=1, description="Node ID or END")
    when: BuiltinEdgeCondition | EdgePredicate | None = Field(
        default=None,
        description="Conditional predicate or built-in routing condition",
    )
    priority: int = 0
    label: str | None = None


class GraphIR(BaseModel):
    """Executable graph body."""

    model_config = ConfigDict(extra="forbid")

    nodes: list[GraphNodeConfig]
    edges: list[GraphEdgeConfig]
    entrypoints: list[str] = Field(min_length=1)

    @field_validator("entrypoints")
    @classmethod
    def _validate_entrypoints_unique(cls, entrypoints: list[str]) -> list[str]:
        if len(set(entrypoints)) != len(entrypoints):
            raise ValueError("graph.entrypoints must be unique")
        return entrypoints


class GraphConfig(BaseModel):
    """Canonical graph configuration."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["3.0"] = "3.0"
    key: str = Field(min_length=1)
    revision: int = Field(default=1, ge=1)
    graph: GraphIR
    state: GraphStateConfig = Field(default_factory=GraphStateConfig)
    deps: GraphDeps | None = None
    limits: GraphExecutionLimits = Field(default_factory=GraphExecutionLimits)

    # Kept in phase-1 for prompt compatibility with current runtime.
    prompt_config: PromptConfig | None = None

    metadata: GraphMetadata | None = None
    ui: dict[str, Any] | None = Field(
        default=None,
        description="UI-only metadata ignored by compiler",
    )


def is_graph_config(config: dict[str, Any]) -> bool:
    """Quick version check for raw graph config payloads."""

    return str(config.get("schema_version", "")).startswith("3.")


def parse_graph_config(config: dict[str, Any]) -> GraphConfig:
    """Parse and validate raw payload as GraphConfig."""

    return GraphConfig.model_validate(config)


__all__ = [
    "BuiltinEdgeCondition",
    "ComponentDependencyRef",
    "ComponentNodeConfig",
    "ComponentReference",
    "EdgePredicate",
    "GraphConfig",
    "GraphDeps",
    "GraphEdgeConfig",
    "GraphExecutionLimits",
    "GraphIR",
    "GraphMetadata",
    "GraphNodeConfig",
    "GraphNodeKind",
    "GraphStateConfig",
    "LLMNodeConfig",
    "ModelDependencyRef",
    "PredicateOperator",
    "PromptDependencyRef",
    "StateFieldSchema",
    "StateFieldType",
    "StateReducerType",
    "ToolNodeConfig",
    "TransformNodeConfig",
    "is_graph_config",
    "parse_graph_config",
]
