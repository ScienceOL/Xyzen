"""Canonicalization for GraphConfig."""

from __future__ import annotations

import json
from typing import Any

from app.schemas.graph_config import (
    BuiltinEdgeCondition,
    EdgePredicate,
    GraphConfig,
    GraphEdgeConfig,
    parse_graph_config,
)


def _edge_when_sort_key(when: BuiltinEdgeCondition | EdgePredicate | None) -> tuple[str, str, str, str]:
    if when is None:
        return ("0", "", "", "")

    if isinstance(when, BuiltinEdgeCondition):
        return ("1", when.value, "", "")

    return (
        "2",
        when.state_path,
        when.operator.value,
        json.dumps(when.value, sort_keys=True, default=str),
    )


def _edge_sort_key(edge: GraphEdgeConfig) -> tuple[str, int, str, str, str, str, str]:
    when_type, when_path, when_operator, when_value = _edge_when_sort_key(edge.when)
    return (
        edge.from_node,
        -edge.priority,
        when_type,
        when_path,
        when_operator,
        when_value,
        edge.to_node,
    )


def canonicalize_graph_config(config: GraphConfig) -> GraphConfig:
    """Return a deterministic canonical form for a valid GraphConfig."""

    nodes = sorted(config.graph.nodes, key=lambda node: node.id)
    edges = sorted(config.graph.edges, key=_edge_sort_key)
    entrypoints = sorted(config.graph.entrypoints)

    canonical_graph = config.graph.model_copy(
        update={
            "nodes": nodes,
            "edges": edges,
            "entrypoints": entrypoints,
        }
    )

    # Normalize optional sections into deterministic JSON shape.
    normalized_deps: Any = None
    if config.deps is not None:
        normalized_deps = config.deps.model_validate(config.deps.model_dump())

    normalized_metadata: Any = None
    if config.metadata is not None:
        normalized_metadata = config.metadata.model_validate(config.metadata.model_dump())

    return config.model_copy(
        update={
            "graph": canonical_graph,
            "deps": normalized_deps,
            "metadata": normalized_metadata,
        }
    )


def parse_and_canonicalize_graph_config(raw_config: dict[str, Any]) -> GraphConfig:
    """Parse a raw payload and canonicalize it into stable form."""

    parsed = parse_graph_config(raw_config)
    return canonicalize_graph_config(parsed)
