"""Tests for GraphConfig v3 canonicalizer."""

from typing import Any

from app.agents.graph.canonicalizer import canonicalize_graph_config
from app.schemas.graph_config import parse_graph_config


def test_canonicalizer_sorts_nodes_edges_and_entrypoints() -> None:
    raw: dict[str, Any] = {
        "schema_version": "3.0",
        "key": "ordering_test",
        "revision": 3,
        "graph": {
            "entrypoints": ["z_entry", "a_entry"],
            "nodes": [
                {
                    "id": "z_entry",
                    "kind": "llm",
                    "name": "Z Entry",
                    "reads": [],
                    "writes": [],
                    "config": {"prompt_template": "z", "tools_enabled": False},
                },
                {
                    "id": "a_entry",
                    "kind": "llm",
                    "name": "A Entry",
                    "reads": [],
                    "writes": [],
                    "config": {"prompt_template": "a", "tools_enabled": False},
                },
            ],
            "edges": [
                {"from_node": "z_entry", "to_node": "END", "priority": 0},
                {"from_node": "a_entry", "to_node": "END", "priority": 10},
                {"from_node": "a_entry", "to_node": "z_entry", "priority": 0},
            ],
        },
        "state": {"schema": {}, "reducers": {}},
        "limits": {"max_time_s": 300, "max_steps": 64, "max_concurrency": 10},
    }

    parsed = parse_graph_config(raw)
    canonical = canonicalize_graph_config(parsed)

    assert [n.id for n in canonical.graph.nodes] == ["a_entry", "z_entry"]
    assert canonical.graph.entrypoints == ["a_entry", "z_entry"]
    assert [(e.from_node, e.to_node, e.priority) for e in canonical.graph.edges] == [
        ("a_entry", "END", 10),
        ("a_entry", "z_entry", 0),
        ("z_entry", "END", 0),
    ]
