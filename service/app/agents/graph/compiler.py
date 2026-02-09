"""Compiler for GraphConfig."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.agents.graph.builder import GraphBuilder
from app.agents.types import DynamicCompiledGraph, LLMFactory
from app.agents.graph.canonicalizer import canonicalize_graph_config
from app.agents.graph.validator import ensure_valid_graph_config
from app.schemas.graph_config_legacy import (
    ConditionOperator,
    ConditionType,
    CustomCondition,
    GraphConfig as LegacyGraphConfig,
    GraphEdgeConfig as LegacyGraphEdgeConfig,
    GraphNodeConfig as LegacyGraphNodeConfig,
    LLMNodeConfig as LegacyLLMNodeConfig,
    NodeType,
    ReducerType,
    StateFieldSchema as LegacyStateFieldSchema,
    ToolNodeConfig as LegacyToolNodeConfig,
    TransformNodeConfig as LegacyTransformNodeConfig,
)
from app.schemas.graph_config_legacy import ComponentNodeConfig as LegacyComponentNodeConfig
from app.schemas.graph_config_legacy import ComponentReference as LegacyComponentReference
from app.schemas.graph_config import (
    BuiltinEdgeCondition,
    ComponentGraphNode,
    EdgePredicate,
    GraphConfig,
    GraphEdgeConfig,
    GraphNodeConfig,
    LLMGraphNode,
    PredicateOperator,
    StateReducerType,
    ToolGraphNode,
    TransformGraphNode,
)

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool
    from langgraph.store.base import BaseStore


_PREDICATE_OPERATOR_MAP: dict[PredicateOperator, ConditionOperator] = {
    PredicateOperator.EQUALS: ConditionOperator.EQUALS,
    PredicateOperator.NOT_EQUALS: ConditionOperator.NOT_EQUALS,
    PredicateOperator.TRUTHY: ConditionOperator.TRUTHY,
    PredicateOperator.FALSY: ConditionOperator.FALSY,
}


class GraphCompiler:
    """Compile graph config to executable LangGraph."""

    def __init__(
        self,
        config: GraphConfig,
        llm_factory: LLMFactory,
        tool_registry: dict[str, "BaseTool"],
        store: "BaseStore | None" = None,
    ) -> None:
        canonical = canonicalize_graph_config(config)
        ensure_valid_graph_config(canonical)

        self.config = canonical
        self._builder = GraphBuilder(
            config=self._to_legacy_graph_config(canonical),
            llm_factory=llm_factory,
            tool_registry=tool_registry,
            store=store,
        )

    async def build(self) -> DynamicCompiledGraph:
        """Build and compile a LangGraph from config."""

        return await self._builder.build()

    def get_node_component_keys(self) -> dict[str, str]:
        """Expose node->component mapping for frontend rendering."""

        return self._builder.get_node_component_keys()

    def _to_legacy_graph_config(self, config: GraphConfig) -> LegacyGraphConfig:
        """Bridge IR into current GraphBuilder-compatible schema."""

        entry_point = config.graph.entrypoints[0]
        custom_state_fields = self._to_legacy_state_fields(config)
        nodes = [self._to_legacy_node(node) for node in config.graph.nodes]
        edges = [LegacyGraphEdgeConfig(from_node="START", to_node=entry_point)] + [
            self._to_legacy_edge(edge) for edge in config.graph.edges
        ]

        metadata: dict[str, Any] = {
            "schema_version": config.schema_version,
            "key": config.key,
            "revision": config.revision,
            "limits": {
                "max_steps": config.limits.max_steps,
                "max_concurrency": config.limits.max_concurrency,
            },
        }
        if config.metadata is not None:
            metadata.update(config.metadata.model_dump(exclude_none=True))
        if config.deps is not None:
            metadata["deps"] = config.deps.model_dump(exclude_none=True)

        return LegacyGraphConfig(
            version="2.0",
            custom_state_fields=custom_state_fields,
            nodes=nodes,
            edges=edges,
            entry_point=entry_point,
            prompt_config=config.prompt_config,
            metadata=metadata,
            max_execution_time_seconds=config.limits.max_time_s,
        )

    def _to_legacy_state_fields(self, config: GraphConfig) -> dict[str, LegacyStateFieldSchema]:
        result: dict[str, LegacyStateFieldSchema] = {}
        for field_name, field_schema in config.state.state_schema.items():
            reducer = config.state.reducers.get(field_name, StateReducerType.REPLACE)
            legacy_reducer = ReducerType.ADD_MESSAGES if reducer == StateReducerType.ADD_MESSAGES else ReducerType.REPLACE
            result[field_name] = LegacyStateFieldSchema(
                type=field_schema.type.value,
                description=field_schema.description,
                default=field_schema.default,
                reducer=legacy_reducer,
            )
        return result

    def _to_legacy_node(self, node: GraphNodeConfig) -> LegacyGraphNodeConfig:
        if isinstance(node, LLMGraphNode):
            return LegacyGraphNodeConfig(
                id=node.id,
                name=node.name,
                type=NodeType.LLM,
                description=node.description,
                llm_config=LegacyLLMNodeConfig(
                    prompt_template=node.config.prompt_template,
                    output_key=node.config.output_key,
                    model_override=node.config.model_override,
                    temperature_override=node.config.temperature_override,
                    max_tokens=node.config.max_tokens,
                    tools_enabled=node.config.tools_enabled,
                    tool_filter=node.config.tool_filter,
                    max_iterations=node.config.max_iterations,
                    message_key=node.config.message_key,
                ),
            )

        if isinstance(node, ToolGraphNode):
            return LegacyGraphNodeConfig(
                id=node.id,
                name=node.name,
                type=NodeType.TOOL,
                description=node.description,
                tool_config=LegacyToolNodeConfig(
                    execute_all=node.config.execute_all,
                    tool_filter=node.config.tool_filter,
                    output_key=node.config.output_key,
                    timeout_seconds=node.config.timeout_seconds,
                ),
            )

        if isinstance(node, TransformGraphNode):
            return LegacyGraphNodeConfig(
                id=node.id,
                name=node.name,
                type=NodeType.TRANSFORM,
                description=node.description,
                transform_config=LegacyTransformNodeConfig(
                    template=node.config.template,
                    output_key=node.config.output_key,
                    input_keys=node.config.input_keys,
                ),
            )

        component_node = node
        if not isinstance(component_node, ComponentGraphNode):
            raise ValueError(f"Unsupported node type in compiler: {type(node).__name__}")

        return LegacyGraphNodeConfig(
            id=component_node.id,
            name=component_node.name,
            type=NodeType.COMPONENT,
            description=component_node.description,
            component_config=LegacyComponentNodeConfig(
                component_ref=LegacyComponentReference(
                    key=component_node.config.component_ref.key,
                    version=component_node.config.component_ref.version,
                ),
                config_overrides=component_node.config.config_overrides,
            ),
        )

    def _to_legacy_edge(self, edge: GraphEdgeConfig) -> LegacyGraphEdgeConfig:
        condition: ConditionType | CustomCondition | None = None
        if edge.when is None:
            condition = None
        elif isinstance(edge.when, BuiltinEdgeCondition):
            if edge.when == BuiltinEdgeCondition.HAS_TOOL_CALLS:
                condition = ConditionType.HAS_TOOL_CALLS
            else:
                condition = ConditionType.NO_TOOL_CALLS
        else:
            predicate = edge.when
            if not isinstance(predicate, EdgePredicate):
                raise ValueError(f"Unsupported edge predicate type in compiler: {type(edge.when).__name__}")
            condition = CustomCondition(
                state_key=predicate.state_path,
                operator=_PREDICATE_OPERATOR_MAP[predicate.operator],
                value=predicate.value,
                target=edge.to_node,
            )

        return LegacyGraphEdgeConfig(
            from_node=edge.from_node,
            to_node=edge.to_node,
            condition=condition,
            label=edge.label,
            priority=edge.priority,
        )
