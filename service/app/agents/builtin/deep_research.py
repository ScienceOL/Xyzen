"""
Deep Research Agent - Multi-phase research workflow configuration.

This module provides the GraphConfig for the Deep Research agent,
which implements a sophisticated research workflow using ExecutableComponents.

The workflow consists of:
1. clarify - Analyze the query and determine if user clarification is needed
2. brief - Generate a structured research brief
3. supervisor - Coordinate research with tools (ReAct loop)
4. final_report - Synthesize findings into a comprehensive report

Each phase is implemented as an ExecutableComponent that can be:
- Used independently in other agent configurations
- Customized via config_overrides
- Extended with additional phases

The Deep Research agent is the canonical example of a multi-phase
agent using the GraphBuilder + ExecutableComponent pattern.
"""

from __future__ import annotations

from app.agents.components.deep_research import create_deep_research_graph_config

# Deep Research configuration using the existing factory function
# This maintains backward compatibility while enabling the new unified path
DEEP_RESEARCH_CONFIG = create_deep_research_graph_config(
    allow_clarification=True,
    max_iterations=24,
    max_concurrent_units=12,
)


# Export
__all__ = ["DEEP_RESEARCH_CONFIG"]
