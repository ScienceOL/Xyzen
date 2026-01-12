"""
Canonical GraphConfig definition for the Deep Research agent.

This module defines the complete JSON-serializable configuration that can
fully reconstruct the Deep Research workflow. It serves as the single source
of truth for the agent's structure.

NOTE: The current GraphBuilder does not yet support:
- Parallel execution nodes (for concurrent researchers)
- Loop constructs (for supervisor iteration)
- Dynamic subagent spawning

These features are planned for a future GraphBuilder enhancement.
Until then, `use_graph_builder=True` will use a simplified workflow,
while `use_graph_builder=False` uses the full Python-coded implementation.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.schemas.graph_config import (
    ConditionOperator,
    EdgeCondition,
    GraphConfig,
    GraphEdgeConfig,
    GraphNodeConfig,
    GraphStateSchema,
    LLMNodeConfig,
    NodeType,
    ReducerType,
    StateFieldSchema,
)

if TYPE_CHECKING:
    pass


def get_default_prompts() -> dict[str, str]:
    """Return the default prompt templates for Deep Research.

    These can be overridden when forking the agent.
    """
    from app.agents.system.deep_research.prompts import (
        CLARIFY_WITH_USER_PROMPT,
        COMPRESS_RESEARCH_HUMAN_MESSAGE,
        COMPRESS_RESEARCH_SYSTEM_PROMPT,
        FINAL_REPORT_PROMPT,
        LEAD_RESEARCHER_PROMPT,
        RESEARCH_BRIEF_PROMPT,
        RESEARCHER_PROMPT,
    )

    return {
        "clarify_with_user": CLARIFY_WITH_USER_PROMPT,
        "research_brief": RESEARCH_BRIEF_PROMPT,
        "lead_researcher": LEAD_RESEARCHER_PROMPT,
        "researcher": RESEARCHER_PROMPT,
        "compress_research_system": COMPRESS_RESEARCH_SYSTEM_PROMPT,
        "compress_research_human": COMPRESS_RESEARCH_HUMAN_MESSAGE,
        "final_report": FINAL_REPORT_PROMPT,
    }


def create_state_schema() -> GraphStateSchema:
    """Create the state schema for Deep Research workflow."""
    return GraphStateSchema(
        fields={
            "messages": StateFieldSchema(
                type="messages",
                default=[],
                reducer=ReducerType.MESSAGES,
                description="Conversation messages with the user",
            ),
            "research_brief": StateFieldSchema(
                type="string",
                default="",
                description="Generated research brief that guides the research",
            ),
            "supervisor_messages": StateFieldSchema(
                type="list",
                default=[],
                reducer=ReducerType.APPEND,
                description="Messages for the research supervisor context",
            ),
            "notes": StateFieldSchema(
                type="list",
                default=[],
                reducer=ReducerType.APPEND,
                description="Compressed research notes from sub-agents",
            ),
            "raw_notes": StateFieldSchema(
                type="list",
                default=[],
                reducer=ReducerType.APPEND,
                description="Raw research findings before compression",
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
                description="Whether to skip research (for follow-up requests like translation)",
            ),
            "research_iterations": StateFieldSchema(
                type="int",
                default=0,
                description="Current iteration count in research loop",
            ),
        }
    )


def create_deep_research_graph_config(
    max_concurrent_research_units: int = 5,
    max_researcher_iterations: int = 6,
    allow_clarification: bool = True,
) -> GraphConfig:
    """
    Create the canonical GraphConfig for Deep Research.

    This configuration represents the complete workflow structure.
    Note: Some advanced features (parallel execution, loops) require
    GraphBuilder enhancements that are not yet implemented.

    Args:
        max_concurrent_research_units: Max parallel researchers
        max_researcher_iterations: Max supervisor iterations
        allow_clarification: Whether to include clarification phase

    Returns:
        Complete GraphConfig for the Deep Research agent
    """
    nodes: list[GraphNodeConfig] = []
    edges: list[GraphEdgeConfig] = []

    # --- Node Definitions ---

    # 1. Clarify with User (optional)
    if allow_clarification:
        from app.schemas.graph_config import StructuredOutputField, StructuredOutputSchema

        # Define structured output schema for clarification
        # Supports three modes: follow_up (skip research), new_research, needs_clarification
        clarification_schema = StructuredOutputSchema(
            description="Response for user clarification decision",
            fields={
                "request_type": StructuredOutputField(
                    type="string",
                    description="Type of request: 'follow_up' (no research needed), 'new_research', or 'needs_clarification'",
                    required=True,
                    default="new_research",
                ),
                "need_clarification": StructuredOutputField(
                    type="bool",
                    description="Whether the user needs to be asked a clarifying question",
                    required=True,
                ),
                "skip_research": StructuredOutputField(
                    type="bool",
                    description="Whether to skip research (true for follow-up requests like translation)",
                    required=True,
                    default=False,
                ),
                "question": StructuredOutputField(
                    type="string",
                    description="A question to ask the user to clarify the report scope (if need_clarification is true)",
                    default="",
                    required=False,
                ),
                "verification": StructuredOutputField(
                    type="string",
                    description="Verification message OR complete response for follow-up requests",
                    default="",
                    required=False,
                ),
            },
        )

        nodes.append(
            GraphNodeConfig(
                id="clarify_with_user",
                name="Clarify with User",
                type=NodeType.LLM,
                description="Analyze query and ask clarifying questions if needed",
                llm_config=LLMNodeConfig(
                    prompt_template="{{ prompt_templates.clarify_with_user }}",
                    output_key="clarification_response",
                    temperature_override=0.3,
                    tools_enabled=False,
                    # Structured output parsing
                    structured_output=clarification_schema,
                    # Conditional message selection:
                    # - If need_clarification is True: show 'question'
                    # - If need_clarification is False: show 'verification'
                    message_key_condition={
                        "condition_field": "need_clarification",
                        "true_key": "question",
                        "false_key": "verification",
                    },
                ),
                tags=["clarification", "user-interaction"],
            )
        )

    # 2. Write Research Brief
    nodes.append(
        GraphNodeConfig(
            id="write_research_brief",
            name="Write Research Brief",
            type=NodeType.LLM,
            description="Transform user messages into a structured research brief",
            llm_config=LLMNodeConfig(
                prompt_template="{{ prompt_templates.research_brief }}",
                output_key="research_brief",
                temperature_override=0.5,
                tools_enabled=False,
            ),
            tags=["planning", "brief"],
        )
    )

    # 3. Research Supervisor
    # TODO: This node needs parallel execution support in GraphBuilder
    # Currently, the Python implementation handles the supervisor loop
    # and parallel researcher spawning. This is a placeholder for future
    # GraphBuilder enhancement.
    nodes.append(
        GraphNodeConfig(
            id="research_supervisor",
            name="Research Supervisor",
            type=NodeType.LLM,
            description=(
                "Coordinate research by delegating to sub-researchers. "
                "NOTE: Full parallel execution requires GraphBuilder enhancement."
            ),
            llm_config=LLMNodeConfig(
                prompt_template="{{ prompt_templates.lead_researcher }}",
                output_key="supervisor_response",
                tools_enabled=True,
                max_iterations=max_researcher_iterations,
            ),
            tags=["supervisor", "delegation", "parallel"],
        )
    )

    # 4. Final Report Generation
    nodes.append(
        GraphNodeConfig(
            id="final_report_generation",
            name="Final Report Generation",
            type=NodeType.LLM,
            description="Synthesize all research findings into a comprehensive report",
            llm_config=LLMNodeConfig(
                prompt_template="{{ prompt_templates.final_report }}",
                output_key="final_report",
                tools_enabled=False,
            ),
            tags=["synthesis", "report"],
        )
    )

    # --- Edge Definitions ---

    if allow_clarification:
        # START -> clarify_with_user
        edges.append(GraphEdgeConfig(from_node="START", to_node="clarify_with_user"))

        # clarify_with_user -> END (if needs clarification)
        edges.append(
            GraphEdgeConfig(
                from_node="clarify_with_user",
                to_node="END",
                condition=EdgeCondition(
                    state_key="need_clarification",
                    operator=ConditionOperator.TRUTHY,
                    value=None,
                    target="END",
                ),
                label="Ask clarifying question",
                priority=2,
            )
        )

        # clarify_with_user -> END (if skip_research for follow-up requests)
        edges.append(
            GraphEdgeConfig(
                from_node="clarify_with_user",
                to_node="END",
                condition=EdgeCondition(
                    state_key="skip_research",
                    operator=ConditionOperator.TRUTHY,
                    value=None,
                    target="END",
                ),
                label="Handle follow-up request directly",
                priority=1,
            )
        )

        # clarify_with_user -> write_research_brief (if no clarification needed and not skipping research)
        edges.append(
            GraphEdgeConfig(
                from_node="clarify_with_user",
                to_node="write_research_brief",
                condition=EdgeCondition(
                    state_key="need_clarification",
                    operator=ConditionOperator.FALSY,
                    value=None,
                    target="write_research_brief",
                ),
                label="Proceed to research",
                priority=0,
            )
        )
    else:
        # START -> write_research_brief (skip clarification)
        edges.append(GraphEdgeConfig(from_node="START", to_node="write_research_brief"))

    # write_research_brief -> research_supervisor
    edges.append(GraphEdgeConfig(from_node="write_research_brief", to_node="research_supervisor"))

    # research_supervisor -> final_report_generation
    edges.append(GraphEdgeConfig(from_node="research_supervisor", to_node="final_report_generation"))

    # final_report_generation -> END
    edges.append(GraphEdgeConfig(from_node="final_report_generation", to_node="END"))

    # --- Build Complete Config ---

    entry_point = "clarify_with_user" if allow_clarification else "write_research_brief"

    return GraphConfig(
        version="2.0",
        state_schema=create_state_schema(),
        nodes=nodes,
        edges=edges,
        entry_point=entry_point,
        prompt_templates=get_default_prompts(),
        metadata={
            "author": "Xyzen",
            "version": "2.0.0",
            "description": "Deep Research agent with supervisor pattern and parallel research",
            "system_agent_key": "deep_research",
            # Configuration parameters stored in metadata for reference
            "config": {
                "max_concurrent_research_units": max_concurrent_research_units,
                "max_researcher_iterations": max_researcher_iterations,
                "allow_clarification": allow_clarification,
            },
            # TODO markers for future GraphBuilder enhancements
            "pending_features": [
                "parallel_execution: research_supervisor needs to spawn parallel researchers",
                "loop_construct: supervisor should iterate until ResearchComplete called",
                "dynamic_spawning: spawn N researchers based on ConductResearch tool calls",
            ],
        },
        max_execution_time_seconds=600,  # Deep research can take longer
        enable_checkpoints=True,
    )


# Pre-built default config
DEFAULT_GRAPH_CONFIG = create_deep_research_graph_config()


__all__ = [
    "create_deep_research_graph_config",
    "create_state_schema",
    "get_default_prompts",
    "DEFAULT_GRAPH_CONFIG",
]
