"""Deep Research builtin agent configuration ."""

from __future__ import annotations

from app.schemas.graph_config import GraphConfig, parse_graph_config


def create_deep_research_config(
    *,
    allow_clarification: bool = True,
    max_iterations: int = 24,
    max_concurrent_units: int = 12,
) -> GraphConfig:
    entrypoint = "clarify" if allow_clarification else "brief"

    nodes: list[dict[str, object]] = []
    edges: list[dict[str, object]] = []

    if allow_clarification:
        nodes.append(
            {
                "id": "clarify",
                "name": "Clarify with User",
                "kind": "component",
                "description": "Analyze query and determine if clarification is needed",
                "reads": ["messages"],
                "writes": ["messages", "need_clarification", "skip_research"],
                "config": {
                    "component_ref": {"key": "deep_research:clarify", "version": "^2.0"},
                },
            }
        )
        edges.extend(
            [
                {
                    "from_node": "clarify",
                    "to_node": "END",
                    "when": {
                        "state_path": "need_clarification",
                        "operator": "truthy",
                    },
                    "label": "Ask clarifying question",
                    "priority": 2,
                },
                {
                    "from_node": "clarify",
                    "to_node": "END",
                    "when": {
                        "state_path": "skip_research",
                        "operator": "truthy",
                    },
                    "label": "Handle follow-up directly",
                    "priority": 1,
                },
                {
                    "from_node": "clarify",
                    "to_node": "brief",
                    "when": {
                        "state_path": "need_clarification",
                        "operator": "falsy",
                    },
                    "label": "Proceed to research",
                    "priority": 0,
                },
            ]
        )

    nodes.extend(
        [
            {
                "id": "brief",
                "name": "Write Research Brief",
                "kind": "component",
                "description": "Transform user messages into structured research brief",
                "reads": ["messages"],
                "writes": ["research_brief"],
                "config": {
                    "component_ref": {"key": "deep_research:brief", "version": "^2.0"},
                },
            },
            {
                "id": "supervisor",
                "name": "Research Supervisor",
                "kind": "component",
                "description": "Coordinate research by delegating to sub-researchers",
                "reads": ["messages", "research_brief", "notes"],
                "writes": ["notes"],
                "config": {
                    "component_ref": {"key": "deep_research:supervisor", "version": "^2.0"},
                    "config_overrides": {
                        "max_iterations": max_iterations,
                        "max_concurrent_units": max_concurrent_units,
                    },
                },
            },
            {
                "id": "final_report",
                "name": "Final Report",
                "kind": "component",
                "description": "Synthesize research findings into comprehensive report",
                "reads": ["messages", "research_brief", "notes"],
                "writes": ["messages", "final_report"],
                "config": {
                    "component_ref": {"key": "deep_research:final_report", "version": "^2.0"},
                },
            },
        ]
    )

    if allow_clarification:
        edges.append({"from_node": "brief", "to_node": "supervisor"})
    else:
        edges.extend(
            [
                {"from_node": "brief", "to_node": "supervisor"},
            ]
        )
    edges.extend(
        [
            {"from_node": "supervisor", "to_node": "final_report"},
            {"from_node": "final_report", "to_node": "END"},
        ]
    )

    return parse_graph_config(
        {
            "schema_version": "3.0",
            "key": "deep_research",
            "revision": 1,
            "graph": {
                "entrypoints": [entrypoint],
                "nodes": nodes,
                "edges": edges,
            },
            "state": {
                "schema": {
                    "research_brief": {
                        "type": "string",
                        "default": "",
                        "description": "Generated research brief that guides the research",
                    },
                    "notes": {
                        "type": "list",
                        "default": [],
                        "description": "Collected research notes from supervisor",
                    },
                    "final_report": {
                        "type": "string",
                        "default": "",
                        "description": "Final synthesized research report",
                    },
                    "need_clarification": {
                        "type": "bool",
                        "default": False,
                        "description": "Whether user clarification is needed",
                    },
                    "skip_research": {
                        "type": "bool",
                        "default": False,
                        "description": "Whether to skip research for follow-up requests",
                    },
                },
                "reducers": {
                    "notes": "replace",
                },
            },
            "deps": {
                "models": [],
                "tools": [],
                "prompts": [],
                "components": [
                    {"key": "deep_research:brief", "version": "^2.0"},
                    {"key": "deep_research:clarify", "version": "^2.0"},
                    {"key": "deep_research:final_report", "version": "^2.0"},
                    {"key": "deep_research:supervisor", "version": "^2.0"},
                ],
            },
            "limits": {
                "max_time_s": 600,
                "max_steps": 256,
                "max_concurrency": max_concurrent_units,
            },
            "prompt_config": {
                "custom_instructions": "",
            },
            "metadata": {
                "display_name": "Deep Research",
                "description": "Multi-phase deep research workflow",
                "tags": ["research", "multi-phase", "components"],
                "agent_version": "3.0.0",
            },
            "ui": {
                "icon": "microscope",
                "author": "Xyzen",
                "pattern": "multi-phase-research",
                "builtin_key": "deep_research",
                "publishable": True,
                "config": {
                    "allow_clarification": allow_clarification,
                    "max_iterations": max_iterations,
                    "max_concurrent_units": max_concurrent_units,
                },
            },
        }
    )


DEEP_RESEARCH_CONFIG = create_deep_research_config(
    allow_clarification=True,
    max_iterations=24,
    max_concurrent_units=12,
)

__all__ = ["DEEP_RESEARCH_CONFIG", "create_deep_research_config"]
