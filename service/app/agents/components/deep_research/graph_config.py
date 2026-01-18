"""
Graph Configuration v2 for the Deep Research agent.

This module defines the v2 GraphConfig that uses ExecutableComponents
to build the Deep Research workflow. Each phase is a COMPONENT node
that references a registered ExecutableComponent.

Workflow:
    START
      │
      ▼
    [clarify] (optional) ─────► END (if need_clarification or skip_research)
      │
      ▼
    [brief]
      │
      ▼
    [supervisor] ⟳ (ReAct loop with tools)
      │
      ▼
    [final_report]
      │
      ▼
    END
"""

from __future__ import annotations

from app.schemas.graph_config import (
    ComponentNodeConfig,
    ComponentReference,
    ConditionOperator,
    CustomCondition,
    GraphConfig,
    GraphEdgeConfig,
    GraphNodeConfig,
    NodeType,
    ReducerType,
    StateFieldSchema,
)


def create_custom_state_fields() -> dict[str, StateFieldSchema]:
    """Create custom state fields for Deep Research workflow.

    The base 'messages' field is automatically included by GraphBuilder.
    These are additional fields needed for the research workflow.
    """
    return {
        "research_brief": StateFieldSchema(
            type="string",
            default="",
            description="Generated research brief that guides the research",
        ),
        "notes": StateFieldSchema(
            type="list",
            default=[],
            reducer=ReducerType.REPLACE,  # Components append internally
            description="Collected research notes from supervisor",
        ),
        "final_report": StateFieldSchema(
            type="string",
            default="",
            description="Final synthesized research report",
        ),
        "need_clarification": StateFieldSchema(
            type="bool",
            default=False,
            description="Whether user clarification is needed",
        ),
        "skip_research": StateFieldSchema(
            type="bool",
            default=False,
            description="Whether to skip research (for follow-up requests)",
        ),
    }


def create_deep_research_graph_config(
    allow_clarification: bool = True,
    max_iterations: int = 6,
    max_concurrent_units: int = 5,
) -> GraphConfig:
    """
    Create v2 GraphConfig for Deep Research using ExecutableComponents.

    This configuration references components that must be registered in
    the component_registry before the graph is built.

    Args:
        allow_clarification: Whether to include the clarification phase
        max_iterations: Maximum iterations for the research supervisor loop
        max_concurrent_units: Maximum parallel research units

    Returns:
        GraphConfig v2 with COMPONENT nodes
    """
    nodes: list[GraphNodeConfig] = []
    edges: list[GraphEdgeConfig] = []

    # --- Node Definitions ---

    # 1. Clarify with User (optional)
    if allow_clarification:
        nodes.append(
            GraphNodeConfig(
                id="clarify",
                name="Clarify with User",
                type=NodeType.COMPONENT,
                description="Analyze query and determine if clarification is needed",
                component_config=ComponentNodeConfig(
                    component_ref=ComponentReference(
                        key="deep_research:clarify",
                        version="^2.0",
                    ),
                ),
                tags=["clarification", "user-interaction"],
            )
        )

    # 2. Write Research Brief
    nodes.append(
        GraphNodeConfig(
            id="brief",
            name="Write Research Brief",
            type=NodeType.COMPONENT,
            description="Transform user messages into structured research brief",
            component_config=ComponentNodeConfig(
                component_ref=ComponentReference(
                    key="deep_research:brief",
                    version="^2.0",
                ),
            ),
            tags=["planning", "brief"],
        )
    )

    # 3. Research Supervisor
    nodes.append(
        GraphNodeConfig(
            id="supervisor",
            name="Research Supervisor",
            type=NodeType.COMPONENT,
            description="Coordinate research by delegating to sub-researchers",
            component_config=ComponentNodeConfig(
                component_ref=ComponentReference(
                    key="deep_research:supervisor",
                    version="^2.0",
                ),
                config_overrides={
                    "max_iterations": max_iterations,
                    "max_concurrent_units": max_concurrent_units,
                },
            ),
            tags=["supervisor", "delegation", "react"],
        )
    )

    # 4. Final Report Generation
    nodes.append(
        GraphNodeConfig(
            id="final_report",
            name="Final Report",
            type=NodeType.COMPONENT,
            description="Synthesize research findings into comprehensive report",
            component_config=ComponentNodeConfig(
                component_ref=ComponentReference(
                    key="deep_research:final_report",
                    version="^2.0",
                ),
            ),
            tags=["synthesis", "report"],
        )
    )

    # --- Edge Definitions ---

    if allow_clarification:
        # START -> clarify
        edges.append(
            GraphEdgeConfig(
                from_node="START",
                to_node="clarify",
            )
        )

        # clarify -> END (if needs clarification)
        edges.append(
            GraphEdgeConfig(
                from_node="clarify",
                to_node="END",
                condition=CustomCondition(
                    state_key="need_clarification",
                    operator=ConditionOperator.TRUTHY,
                    target="END",
                ),
                label="Ask clarifying question",
                priority=2,
            )
        )

        # clarify -> END (if skip_research for follow-up requests)
        edges.append(
            GraphEdgeConfig(
                from_node="clarify",
                to_node="END",
                condition=CustomCondition(
                    state_key="skip_research",
                    operator=ConditionOperator.TRUTHY,
                    target="END",
                ),
                label="Handle follow-up directly",
                priority=1,
            )
        )

        # clarify -> brief (if no clarification needed and not skipping)
        # This is the default edge when neither condition matches
        edges.append(
            GraphEdgeConfig(
                from_node="clarify",
                to_node="brief",
                condition=CustomCondition(
                    state_key="need_clarification",
                    operator=ConditionOperator.FALSY,
                    target="brief",
                ),
                label="Proceed to research",
                priority=0,
            )
        )
    else:
        # START -> brief (skip clarification)
        edges.append(
            GraphEdgeConfig(
                from_node="START",
                to_node="brief",
            )
        )

    # brief -> supervisor
    edges.append(
        GraphEdgeConfig(
            from_node="brief",
            to_node="supervisor",
        )
    )

    # supervisor -> final_report
    # The supervisor component handles its own ReAct loop internally
    edges.append(
        GraphEdgeConfig(
            from_node="supervisor",
            to_node="final_report",
        )
    )

    # final_report -> END
    edges.append(
        GraphEdgeConfig(
            from_node="final_report",
            to_node="END",
        )
    )

    # --- Build Complete Config ---

    entry_point = "clarify" if allow_clarification else "brief"

    return GraphConfig(
        version="2.0",
        custom_state_fields=create_custom_state_fields(),
        nodes=nodes,
        edges=edges,
        entry_point=entry_point,
        metadata={
            "author": "Xyzen",
            "version": "3.0.0",
            "description": "Deep Research agent using ExecutableComponents",
            "builtin_key": "deep_research",
            "pattern": "multi-phase-research",
            "config": {
                "allow_clarification": allow_clarification,
                "max_iterations": max_iterations,
                "max_concurrent_units": max_concurrent_units,
            },
        },
        max_execution_time_seconds=600,  # Deep research can take longer
    )


# Pre-built default config
DEFAULT_GRAPH_CONFIG = create_deep_research_graph_config()


__all__ = [
    "create_deep_research_graph_config",
    "create_custom_state_fields",
    "DEFAULT_GRAPH_CONFIG",
]
