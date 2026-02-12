"""Structural validation for GraphConfig."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from app.schemas.graph_config import (
    BuiltinEdgeCondition,
    EdgePredicate,
    GraphConfig,
    GraphEdgeConfig,
)

_BUILTIN_STATE_PATHS = {"messages", "execution_context"}


@dataclass(frozen=True)
class GraphConfigValidationError:
    """Structured validation error for graph configs."""

    code: str
    path: str
    message: str


def _build_adjacency(edges: Iterable[GraphEdgeConfig], node_ids: set[str]) -> dict[str, set[str]]:
    adjacency: dict[str, set[str]] = {node_id: set() for node_id in node_ids}
    for edge in edges:
        if edge.from_node in node_ids and edge.to_node in node_ids:
            adjacency[edge.from_node].add(edge.to_node)
    return adjacency


def _has_cycle(adjacency: dict[str, set[str]]) -> bool:
    white = set(adjacency.keys())
    gray: set[str] = set()
    black: set[str] = set()

    def visit(node: str) -> bool:
        white.discard(node)
        gray.add(node)

        for nxt in adjacency.get(node, set()):
            if nxt in black:
                continue
            if nxt in gray:
                return True
            if visit(nxt):
                return True

        gray.discard(node)
        black.add(node)
        return False

    while white:
        node = next(iter(white))
        if visit(node):
            return True
    return False


def _reachable_from_entrypoints(entrypoints: list[str], adjacency: dict[str, set[str]]) -> set[str]:
    visited: set[str] = set()
    queue = list(entrypoints)
    while queue:
        node = queue.pop(0)
        if node in visited:
            continue
        visited.add(node)
        for nxt in adjacency.get(node, set()):
            if nxt not in visited:
                queue.append(nxt)
    return visited


def _is_end_reachable(entrypoints: list[str], edges: list[GraphEdgeConfig]) -> bool:
    visited_nodes: set[str] = set()
    queue = list(entrypoints)

    outgoing: dict[str, list[GraphEdgeConfig]] = {}
    for edge in edges:
        outgoing.setdefault(edge.from_node, []).append(edge)

    while queue:
        node = queue.pop(0)
        if node in visited_nodes:
            continue
        visited_nodes.add(node)

        for edge in outgoing.get(node, []):
            if edge.to_node == "END":
                return True
            if edge.to_node not in visited_nodes:
                queue.append(edge.to_node)

    return False


def validate_graph_config(config: GraphConfig) -> list[GraphConfigValidationError]:
    """Validate a GraphConfig and return structured errors."""

    errors: list[GraphConfigValidationError] = []
    nodes = config.graph.nodes
    edges = config.graph.edges
    entrypoints = config.graph.entrypoints

    if not nodes:
        errors.append(
            GraphConfigValidationError(
                code="EMPTY_GRAPH",
                path="graph.nodes",
                message="Graph must contain at least one node.",
            )
        )
        return errors

    node_ids = [node.id for node in nodes]
    node_id_set = set(node_ids)

    duplicate_ids = {node_id for node_id in node_ids if node_ids.count(node_id) > 1}
    if duplicate_ids:
        errors.append(
            GraphConfigValidationError(
                code="DUPLICATE_NODE_ID",
                path="graph.nodes",
                message=f"Node IDs must be unique. Duplicates: {sorted(duplicate_ids)}.",
            )
        )

    # Runtime compiler currently supports one entrypoint while preserving entrypoints[] schema.
    if len(entrypoints) != 1:
        errors.append(
            GraphConfigValidationError(
                code="MULTIPLE_ENTRYPOINTS_UNSUPPORTED",
                path="graph.entrypoints",
                message="Current runtime requires exactly one entrypoint.",
            )
        )

    for idx, entrypoint in enumerate(entrypoints):
        if entrypoint not in node_id_set:
            errors.append(
                GraphConfigValidationError(
                    code="ENTRYPOINT_NOT_FOUND",
                    path=f"graph.entrypoints[{idx}]",
                    message=f"Entrypoint '{entrypoint}' does not exist in graph.nodes.",
                )
            )

    state_paths = set(config.state.state_schema.keys()) | _BUILTIN_STATE_PATHS

    edges_by_source: dict[str, list[tuple[int, GraphEdgeConfig]]] = {}
    for idx, edge in enumerate(edges):
        edge_path = f"graph.edges[{idx}]"
        edges_by_source.setdefault(edge.from_node, []).append((idx, edge))

        if edge.from_node == "START":
            errors.append(
                GraphConfigValidationError(
                    code="EDGE_FROM_START_FORBIDDEN",
                    path=f"{edge_path}.from_node",
                    message="Uses graph.entrypoints[]; START edges are not allowed.",
                )
            )
        elif edge.from_node == "END":
            errors.append(
                GraphConfigValidationError(
                    code="EDGE_FROM_END_FORBIDDEN",
                    path=f"{edge_path}.from_node",
                    message="END cannot be used as an edge source.",
                )
            )
        elif edge.from_node not in node_id_set:
            errors.append(
                GraphConfigValidationError(
                    code="EDGE_SOURCE_NOT_FOUND",
                    path=f"{edge_path}.from_node",
                    message=f"Edge source '{edge.from_node}' does not exist.",
                )
            )

        if edge.to_node == "START":
            errors.append(
                GraphConfigValidationError(
                    code="EDGE_TO_START_FORBIDDEN",
                    path=f"{edge_path}.to_node",
                    message="START cannot be used as an edge target.",
                )
            )
        elif edge.to_node != "END" and edge.to_node not in node_id_set:
            errors.append(
                GraphConfigValidationError(
                    code="EDGE_TARGET_NOT_FOUND",
                    path=f"{edge_path}.to_node",
                    message=f"Edge target '{edge.to_node}' does not exist.",
                )
            )

        if isinstance(edge.when, EdgePredicate) and edge.when.state_path not in state_paths:
            errors.append(
                GraphConfigValidationError(
                    code="PREDICATE_STATE_PATH_MISSING",
                    path=f"{edge_path}.when.state_path",
                    message=(
                        f"Predicate state_path '{edge.when.state_path}' is missing in state.schema "
                        "and is not a built-in state path."
                    ),
                )
            )

    # Determinism checks per source node.
    for source, edge_entries in edges_by_source.items():
        default_edges = [(idx, edge) for idx, edge in edge_entries if edge.when is None]
        if len(default_edges) > 1:
            errors.append(
                GraphConfigValidationError(
                    code="MULTIPLE_DEFAULT_EDGES",
                    path=f"graph.edges[{default_edges[1][0]}].when",
                    message=f"Node '{source}' has more than one unconditional edge.",
                )
            )

        has_tool_edges = [
            (idx, edge)
            for idx, edge in edge_entries
            if isinstance(edge.when, BuiltinEdgeCondition) and edge.when == BuiltinEdgeCondition.HAS_TOOL_CALLS
        ]
        no_tool_edges = [
            (idx, edge)
            for idx, edge in edge_entries
            if isinstance(edge.when, BuiltinEdgeCondition) and edge.when == BuiltinEdgeCondition.NO_TOOL_CALLS
        ]
        custom_predicate_edges = [(idx, edge) for idx, edge in edge_entries if isinstance(edge.when, EdgePredicate)]

        if len(has_tool_edges) > 1:
            errors.append(
                GraphConfigValidationError(
                    code="DUPLICATE_HAS_TOOL_CALLS_EDGE",
                    path=f"graph.edges[{has_tool_edges[1][0]}].when",
                    message=f"Node '{source}' has duplicate has_tool_calls edges.",
                )
            )
        if len(no_tool_edges) > 1:
            errors.append(
                GraphConfigValidationError(
                    code="DUPLICATE_NO_TOOL_CALLS_EDGE",
                    path=f"graph.edges[{no_tool_edges[1][0]}].when",
                    message=f"Node '{source}' has duplicate no_tool_calls edges.",
                )
            )
        if (has_tool_edges or no_tool_edges) and custom_predicate_edges:
            errors.append(
                GraphConfigValidationError(
                    code="MIXED_BUILTIN_AND_CUSTOM_ROUTING",
                    path=f"graph.edges[{custom_predicate_edges[0][0]}].when",
                    message=f"Node '{source}' mixes built-in tool routing and custom predicates.",
                )
            )

    adjacency = _build_adjacency(edges, node_id_set)
    reachable = _reachable_from_entrypoints(entrypoints, adjacency)
    unreachable = node_id_set - reachable
    if unreachable:
        errors.append(
            GraphConfigValidationError(
                code="UNREACHABLE_NODE",
                path="graph.nodes",
                message=f"Unreachable nodes from entrypoints: {sorted(unreachable)}.",
            )
        )

    if not _is_end_reachable(entrypoints, edges):
        errors.append(
            GraphConfigValidationError(
                code="END_UNREACHABLE",
                path="graph.edges",
                message="No execution path from entrypoints can reach END.",
            )
        )

    if _has_cycle(adjacency):
        if config.limits.max_steps <= 0 and config.limits.max_time_s <= 0:
            errors.append(
                GraphConfigValidationError(
                    code="CYCLE_LIMITS_REQUIRED",
                    path="limits",
                    message="Graphs with cycles require max_steps or max_time_s limits.",
                )
            )

    return errors


def ensure_valid_graph_config(config: GraphConfig) -> None:
    """Raise ValueError if config fails validation."""

    errors = validate_graph_config(config)
    if not errors:
        return

    formatted = "; ".join([f"{e.code} ({e.path}): {e.message}" for e in errors])
    raise ValueError(f"Invalid graph configuration: {formatted}")
