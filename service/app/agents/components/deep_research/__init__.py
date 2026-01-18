"""
Deep Research Components - Multi-phase research workflow.

This module provides ExecutableComponents for the Deep Research agent:
- ClarifyWithUserComponent: Determines if clarification is needed
- ResearchBriefComponent: Generates research brief from user query
- ResearchSupervisorComponent: ReAct loop coordinating research with tools
- FinalReportComponent: Synthesizes findings into comprehensive report

Also includes:
- Graph configuration factory (create_deep_research_graph_config)
- Prompts, state models, and utilities
"""

from app.agents.components.deep_research.components import (
    ClarifyWithUserComponent,
    FinalReportComponent,
    ResearchBriefComponent,
    ResearchSupervisorComponent,
)
from app.agents.components.deep_research.configuration import DEFAULT_CONFIG, DeepResearchConfig
from app.agents.components.deep_research.graph_config import (
    DEFAULT_GRAPH_CONFIG,
    create_custom_state_fields,
    create_deep_research_graph_config,
)

__all__ = [
    # Components
    "ClarifyWithUserComponent",
    "ResearchBriefComponent",
    "ResearchSupervisorComponent",
    "FinalReportComponent",
    # Configuration
    "DeepResearchConfig",
    "DEFAULT_CONFIG",
    # Graph config factory
    "create_deep_research_graph_config",
    "create_custom_state_fields",
    "DEFAULT_GRAPH_CONFIG",
]
