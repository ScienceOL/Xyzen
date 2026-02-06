"""GraphConfig auto-upgrade helpers (legacy -> canonical)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.agents.graph.canonicalizer import canonicalize_graph_config
from app.agents.graph.validator import ensure_valid_graph_config
from app.schemas.graph_config_legacy import (
    ConditionType,
    GraphConfig as LegacyGraphConfig,
    GraphEdgeConfig as LegacyGraphEdgeConfig,
    GraphNodeConfig as LegacyGraphNodeConfig,
    NodeType,
    create_react_config,
    migrate_graph_config,
)
from app.schemas.graph_config import GraphConfig, parse_graph_config


@dataclass(frozen=True)
class GraphConfigMigrationWarning:
    """Non-fatal migration detail."""

    code: str
    path: str
    message: str


@dataclass(frozen=True)
class GraphConfigMigrationResult:
    """Structured migration output."""

    source_version: str
    config: GraphConfig
    warnings: list[GraphConfigMigrationWarning]


class GraphConfigMigrationError(ValueError):
    """Raised when migration cannot safely produce a valid config."""

    def __init__(self, code: str, path: str, message: str) -> None:
        super().__init__(f"{code} ({path}): {message}")
        self.code = code
        self.path = path
        self.message = message


def detect_graph_config_version(raw_config: dict[str, Any]) -> str:
    """Detect graph config version from raw payload."""

    schema_version = raw_config.get("schema_version")
    if schema_version:
        return str(schema_version)
    return str(raw_config.get("version", "1.0"))


def upgrade_graph_config(raw_config: dict[str, Any]) -> GraphConfigMigrationResult:
    """Upgrade a raw graph config payload to canonical form."""

    source_version = detect_graph_config_version(raw_config)
    warnings: list[GraphConfigMigrationWarning] = []

    if source_version.startswith("3."):
        try:
            parsed = parse_graph_config(raw_config)
            canonical = canonicalize_graph_config(parsed)
            ensure_valid_graph_config(canonical)
        except (ValidationError, ValueError) as exc:
            raise GraphConfigMigrationError(
                code="INVALID_V3_CONFIG",
                path="graph_config",
                message=str(exc),
            ) from exc
        return GraphConfigMigrationResult(
            source_version=source_version,
            config=canonical,
            warnings=warnings,
        )

    if _is_explicit_empty_graph(raw_config):
        raise GraphConfigMigrationError(
            code="EMPTY_GRAPH",
            path="graph_config.nodes",
            message="Empty graph cannot be auto-migrated.",
        )

    if source_version.startswith("2."):
        try:
            config_v2 = LegacyGraphConfig.model_validate(raw_config)
        except ValidationError as exc:
            raise GraphConfigMigrationError(
                code="INVALID_V2_CONFIG",
                path="graph_config",
                message=str(exc),
            ) from exc
    else:
        if not source_version.startswith("1."):
            warnings.append(
                GraphConfigMigrationWarning(
                    code="UNKNOWN_VERSION_TREATED_AS_V1",
                    path="graph_config.version",
                    message=f"Unknown version '{source_version}' treated as v1 payload.",
                )
            )
        try:
            config_v2 = migrate_graph_config(raw_config)
        except Exception as exc:
            raise GraphConfigMigrationError(
                code="INVALID_V1_CONFIG",
                path="graph_config",
                message=str(exc),
            ) from exc
        warnings.append(
            GraphConfigMigrationWarning(
                code="UPGRADED_V1_TO_V2",
                path="graph_config.version",
                message="Migrated through legacy v1->v2 transformer before conversion.",
            )
        )

    config_v3_raw = _convert_v2_to_v3_raw(
        config_v2=config_v2,
        source_version=source_version,
        warnings=warnings,
    )
    try:
        parsed_v3 = parse_graph_config(config_v3_raw)
        canonical_v3 = canonicalize_graph_config(parsed_v3)
        ensure_valid_graph_config(canonical_v3)
    except (ValidationError, ValueError) as exc:
        raise GraphConfigMigrationError(
            code="INVALID_MIGRATED_V3_CONFIG",
            path="graph_config",
            message=str(exc),
        ) from exc

    return GraphConfigMigrationResult(
        source_version=source_version,
        config=canonical_v3,
        warnings=warnings,
    )


def upgrade_or_create_default_graph_config(
    raw_config: dict[str, Any] | None,
    *,
    agent_prompt: str | None = None,
) -> GraphConfigMigrationResult:
    """Upgrade config to canonical form, or synthesize a default config when missing."""

    if raw_config is None:
        prompt = agent_prompt or "You are a helpful assistant."
        default_v2 = create_react_config(prompt=prompt).model_dump()
        result = upgrade_graph_config(default_v2)
        default_warning = GraphConfigMigrationWarning(
            code="DEFAULT_GRAPH_FROM_NULL",
            path="graph_config",
            message="graph_config was null; generated default ReAct config before migration.",
        )
        return GraphConfigMigrationResult(
            source_version="null",
            config=result.config,
            warnings=[default_warning, *result.warnings],
        )

    return upgrade_graph_config(raw_config)


def _is_explicit_empty_graph(raw_config: dict[str, Any]) -> bool:
    # v1/v2 shape
    raw_nodes = raw_config.get("nodes")
    if isinstance(raw_nodes, list) and not raw_nodes:
        return True
    # v3-like nested shape
    graph = raw_config.get("graph")
    if isinstance(graph, dict):
        graph_nodes = graph.get("nodes")
        if isinstance(graph_nodes, list) and not graph_nodes:
            return True
    return False


def _convert_v2_to_v3_raw(
    config_v2: LegacyGraphConfig,
    source_version: str,
    warnings: list[GraphConfigMigrationWarning],
) -> dict[str, Any]:
    node_ids: set[str] = set()
    v3_nodes: list[dict[str, Any]] = []

    for index, node in enumerate(config_v2.nodes):
        node_id = (node.id or "").strip()
        if not node_id:
            node_id = f"node_{index + 1}"
            warnings.append(
                GraphConfigMigrationWarning(
                    code="MISSING_NODE_ID_DEFAULTED",
                    path=f"nodes[{index}].id",
                    message=f"Node id missing; defaulted to '{node_id}'.",
                )
            )
        if node_id in node_ids:
            raise GraphConfigMigrationError(
                code="DUPLICATE_NODE_ID",
                path=f"nodes[{index}].id",
                message=f"Duplicate node id '{node_id}' cannot be auto-migrated.",
            )
        node_ids.add(node_id)
        v3_nodes.append(_convert_v2_node(node, node_id, index, warnings))

    if not v3_nodes:
        raise GraphConfigMigrationError(
            code="EMPTY_GRAPH",
            path="nodes",
            message="v2 graph has no executable nodes after conversion.",
        )

    entrypoints = _derive_entrypoints(config_v2, node_ids, warnings)
    v3_edges = _convert_v2_edges(config_v2.edges, node_ids, warnings)

    if not v3_edges:
        warnings.append(
            GraphConfigMigrationWarning(
                code="NO_EDGES_DEFAULTED_TO_END",
                path="edges",
                message=f"No valid edges after conversion; added '{entrypoints[0]} -> END'.",
            )
        )
        v3_edges = [{"from_node": entrypoints[0], "to_node": "END"}]

    metadata = _extract_metadata(config_v2)
    limits = _extract_limits(config_v2)
    deps = _extract_deps(config_v2)
    ui = _build_ui_payload(config_v2, source_version, warnings)

    key = _derive_key(config_v2)
    revision = _derive_revision(config_v2)

    payload: dict[str, Any] = {
        "schema_version": "3.0",
        "key": key,
        "revision": revision,
        "graph": {
            "nodes": v3_nodes,
            "edges": v3_edges,
            "entrypoints": entrypoints,
        },
        "state": _convert_state(config_v2),
        "limits": limits,
        "prompt_config": config_v2.prompt_config.model_dump(exclude_none=True) if config_v2.prompt_config else None,
        "metadata": metadata if metadata else None,
        "deps": deps if deps else None,
        "ui": ui if ui else None,
    }
    return payload


def _convert_v2_node(
    node: LegacyGraphNodeConfig,
    node_id: str,
    index: int,
    warnings: list[GraphConfigMigrationWarning],
) -> dict[str, Any]:
    node_name = node.name or node_id

    if node.type == NodeType.LLM:
        llm = node.llm_config
        if llm is None:
            warnings.append(
                GraphConfigMigrationWarning(
                    code="MISSING_LLM_CONFIG_DEFAULTED",
                    path=f"nodes[{index}].llm_config",
                    message="LLM node missing llm_config; default runtime values were applied.",
                )
            )
            config = {
                "prompt_template": "",
                "output_key": "response",
                "tools_enabled": True,
                "max_iterations": 10,
            }
        else:
            config = {
                "prompt_template": llm.prompt_template,
                "output_key": llm.output_key,
                "model_override": llm.model_override,
                "temperature_override": llm.temperature_override,
                "max_tokens": llm.max_tokens,
                "tools_enabled": llm.tools_enabled,
                "tool_filter": llm.tool_filter,
                "max_iterations": llm.max_iterations,
                "message_key": llm.message_key,
            }
        return {
            "id": node_id,
            "kind": "llm",
            "name": node_name,
            "description": node.description,
            "reads": ["messages"],
            "writes": ["messages", config["output_key"]],
            "config": config,
        }

    if node.type == NodeType.TOOL:
        tool = node.tool_config
        if tool is None:
            warnings.append(
                GraphConfigMigrationWarning(
                    code="MISSING_TOOL_CONFIG_DEFAULTED",
                    path=f"nodes[{index}].tool_config",
                    message="Tool node missing tool_config; default runtime values were applied.",
                )
            )
            config = {
                "execute_all": True,
                "tool_filter": None,
                "output_key": "tool_results",
                "timeout_seconds": 60,
            }
        else:
            config = {
                "execute_all": tool.execute_all,
                "tool_filter": tool.tool_filter,
                "output_key": tool.output_key,
                "timeout_seconds": tool.timeout_seconds,
            }
        return {
            "id": node_id,
            "kind": "tool",
            "name": node_name,
            "description": node.description,
            "reads": ["messages"],
            "writes": [config["output_key"]],
            "config": config,
        }

    if node.type == NodeType.TRANSFORM:
        transform = node.transform_config
        if transform is None:
            raise GraphConfigMigrationError(
                code="MISSING_TRANSFORM_CONFIG",
                path=f"nodes[{index}].transform_config",
                message="Transform node missing transform_config.",
            )
        return {
            "id": node_id,
            "kind": "transform",
            "name": node_name,
            "description": node.description,
            "reads": transform.input_keys,
            "writes": [transform.output_key],
            "config": {
                "template": transform.template,
                "output_key": transform.output_key,
                "input_keys": transform.input_keys,
            },
        }

    component = node.component_config
    if component is None:
        raise GraphConfigMigrationError(
            code="MISSING_COMPONENT_CONFIG",
            path=f"nodes[{index}].component_config",
            message="Component node missing component_config.",
        )
    return {
        "id": node_id,
        "kind": "component",
        "name": node_name,
        "description": node.description,
        "reads": [],
        "writes": [],
        "config": {
            "component_ref": {
                "key": component.component_ref.key,
                "version": component.component_ref.version,
            },
            "config_overrides": component.config_overrides,
        },
    }


def _derive_entrypoints(
    config_v2: LegacyGraphConfig,
    node_ids: set[str],
    warnings: list[GraphConfigMigrationWarning],
) -> list[str]:
    if config_v2.entry_point and config_v2.entry_point in node_ids:
        return [config_v2.entry_point]

    if config_v2.entry_point and config_v2.entry_point not in node_ids:
        warnings.append(
            GraphConfigMigrationWarning(
                code="INVALID_ENTRYPOINT_FALLBACK",
                path="entry_point",
                message=f"entry_point '{config_v2.entry_point}' does not exist; deriving entrypoint from edges.",
            )
        )

    start_targets: list[str] = []
    for edge in config_v2.edges:
        if edge.from_node == "START" and edge.to_node in node_ids and edge.to_node not in start_targets:
            start_targets.append(edge.to_node)

    if start_targets:
        if len(start_targets) > 1:
            warnings.append(
                GraphConfigMigrationWarning(
                    code="MULTIPLE_START_TARGETS_PICK_FIRST",
                    path="edges",
                    message=f"Multiple START targets found {start_targets}; selected '{start_targets[0]}'.",
                )
            )
        return [start_targets[0]]

    default_entrypoint = config_v2.nodes[0].id
    warnings.append(
        GraphConfigMigrationWarning(
            code="MISSING_ENTRYPOINT_FALLBACK",
            path="entry_point",
            message=f"No entrypoint found; defaulted to first node '{default_entrypoint}'.",
        )
    )
    return [default_entrypoint]


def _convert_v2_edges(
    edges: list[LegacyGraphEdgeConfig],
    node_ids: set[str],
    warnings: list[GraphConfigMigrationWarning],
) -> list[dict[str, Any]]:
    converted: list[dict[str, Any]] = []
    for index, edge in enumerate(edges):
        if edge.from_node == "START":
            continue

        if edge.from_node == "END":
            warnings.append(
                GraphConfigMigrationWarning(
                    code="EDGE_FROM_END_DROPPED",
                    path=f"edges[{index}]",
                    message="Dropped edge with END as source.",
                )
            )
            continue

        if edge.to_node == "START":
            warnings.append(
                GraphConfigMigrationWarning(
                    code="EDGE_TO_START_DROPPED",
                    path=f"edges[{index}]",
                    message="Dropped edge with START as target.",
                )
            )
            continue

        if edge.from_node not in node_ids:
            warnings.append(
                GraphConfigMigrationWarning(
                    code="EDGE_SOURCE_MISSING_DROPPED",
                    path=f"edges[{index}].from_node",
                    message=f"Dropped edge from unknown node '{edge.from_node}'.",
                )
            )
            continue

        if edge.to_node != "END" and edge.to_node not in node_ids:
            warnings.append(
                GraphConfigMigrationWarning(
                    code="EDGE_TARGET_MISSING_DROPPED",
                    path=f"edges[{index}].to_node",
                    message=f"Dropped edge to unknown node '{edge.to_node}'.",
                )
            )
            continue

        when: str | dict[str, Any] | None = None
        if edge.condition is None:
            when = None
        elif edge.condition == ConditionType.HAS_TOOL_CALLS:
            when = "has_tool_calls"
        elif edge.condition == ConditionType.NO_TOOL_CALLS:
            when = "no_tool_calls"
        else:
            condition = edge.condition
            if not condition.state_key:
                raise GraphConfigMigrationError(
                    code="MISSING_PREDICATE_STATE_KEY",
                    path=f"edges[{index}].condition.state_key",
                    message="Custom condition state_key is required for predicate migration.",
                )
            when = {
                "state_path": condition.state_key,
                "operator": condition.operator.value,
                "value": condition.value,
            }

        converted.append(
            {
                "from_node": edge.from_node,
                "to_node": edge.to_node,
                "when": when,
                "priority": edge.priority,
                "label": edge.label,
            }
        )
    return converted


def _convert_state(config_v2: LegacyGraphConfig) -> dict[str, Any]:
    schema: dict[str, Any] = {}
    reducers: dict[str, str] = {}
    for state_key, field in config_v2.custom_state_fields.items():
        schema[state_key] = {
            "type": field.type,
            "description": field.description,
            "default": field.default,
        }
        reducers[state_key] = field.reducer.value
    return {"schema": schema, "reducers": reducers}


def _extract_metadata(config_v2: LegacyGraphConfig) -> dict[str, Any]:
    raw = config_v2.metadata
    tags_raw = raw.get("tags", [])
    tags = [tag for tag in tags_raw if isinstance(tag, str)] if isinstance(tags_raw, list) else []
    metadata: dict[str, Any] = {
        "display_name": raw.get("display_name"),
        "description": raw.get("description"),
        "tags": tags,
        "agent_version": raw.get("agent_version") or raw.get("version"),
    }
    return {k: v for k, v in metadata.items() if v is not None}


def _extract_limits(config_v2: LegacyGraphConfig) -> dict[str, Any]:
    raw = config_v2.metadata
    limits_raw = raw.get("limits", {})
    max_steps = limits_raw.get("max_steps", 128) if isinstance(limits_raw, dict) else 128
    max_concurrency = limits_raw.get("max_concurrency", 10) if isinstance(limits_raw, dict) else 10
    return {
        "max_time_s": config_v2.max_execution_time_seconds,
        "max_steps": max_steps if isinstance(max_steps, int) else 128,
        "max_concurrency": max_concurrency if isinstance(max_concurrency, int) else 10,
    }


def _extract_deps(config_v2: LegacyGraphConfig) -> dict[str, Any]:
    tools: list[str] = []
    if config_v2.tool_config and config_v2.tool_config.tool_filter:
        tools = [tool for tool in config_v2.tool_config.tool_filter if tool]

    model_keys: set[str] = set()
    component_refs: set[tuple[str, str]] = set()
    for node in config_v2.nodes:
        if node.llm_config and node.llm_config.model_override:
            model_keys.add(node.llm_config.model_override)
        if node.component_config:
            component_refs.add((node.component_config.component_ref.key, node.component_config.component_ref.version))

    deps: dict[str, Any] = {
        "models": [{"key": key} for key in sorted(model_keys)],
        "tools": sorted(set(tools)),
        "prompts": [],
        "components": [{"key": key, "version": version} for key, version in sorted(component_refs)],
    }
    if not deps["models"] and not deps["tools"] and not deps["components"]:
        return {}
    return deps


def _build_ui_payload(
    config_v2: LegacyGraphConfig,
    source_version: str,
    warnings: list[GraphConfigMigrationWarning],
) -> dict[str, Any]:
    positions: dict[str, dict[str, float]] = {}
    for node in config_v2.nodes:
        if isinstance(node.position, dict):
            x = node.position.get("x")
            y = node.position.get("y")
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                positions[node.id] = {"x": float(x), "y": float(y)}

    migration_payload = {
        "from_version": source_version,
        "warning_codes": [warning.code for warning in warnings],
    }

    ui: dict[str, Any] = {"migration": migration_payload}
    if positions:
        ui["positions"] = positions
    return ui


def _derive_key(config_v2: LegacyGraphConfig) -> str:
    metadata = config_v2.metadata
    key_candidates = [
        metadata.get("key"),
        metadata.get("builtin_key"),
        metadata.get("system_agent_key"),
        metadata.get("display_name"),
        metadata.get("pattern"),
    ]
    for candidate in key_candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return "migrated_graph"


def _derive_revision(config_v2: LegacyGraphConfig) -> int:
    metadata = config_v2.metadata
    raw_revision = metadata.get("revision")
    if isinstance(raw_revision, int) and raw_revision >= 1:
        return raw_revision
    return 1


__all__ = [
    "GraphConfigMigrationError",
    "GraphConfigMigrationResult",
    "GraphConfigMigrationWarning",
    "detect_graph_config_version",
    "upgrade_graph_config",
    "upgrade_or_create_default_graph_config",
]
