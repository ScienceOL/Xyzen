"""
Deep Research Components - Reusable components exported by the DeepResearch agent.

These components can be used in user-defined agents or other system agents.
"""

from __future__ import annotations

from typing import Any

from app.agents.components import ComponentMetadata, ComponentType, NodeComponent


class QueryAnalyzerComponent(NodeComponent):
    """
    Query Analyzer Component

    Analyzes research queries to extract:
    - Main topics
    - Named entities
    - Effective search terms
    - Query type classification
    """

    @property
    def metadata(self) -> ComponentMetadata:
        return ComponentMetadata(
            key="system:deep_research:query_analyzer",
            name="Query Analyzer",
            description="Analyzes research queries to extract topics, entities, and search terms",
            component_type=ComponentType.NODE,
            version="1.0.0",
            author="Xyzen",
            tags=["research", "analysis", "nlp", "query-understanding"],
            input_schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The research query to analyze",
                    }
                },
                "required": ["query"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "topics": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Main topics extracted from the query",
                    },
                    "entities": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Named entities found in the query",
                    },
                    "search_terms": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Generated search terms",
                    },
                    "query_type": {
                        "type": "string",
                        "enum": ["factual", "exploratory", "comparative", "analytical"],
                        "description": "Classification of the query type",
                    },
                },
            },
            required_tools=[],
            required_components=[],
        )

    def export_config(self) -> dict[str, Any]:
        """Export as node configuration."""
        return {
            "id": "query_analyzer",
            "name": "Query Analyzer",
            "type": "llm",
            "description": self.metadata.description,
            "llm_config": {
                "prompt_template": self.PROMPT_TEMPLATE,
                "output_key": "query_analysis",
                "temperature_override": 0.3,
                "tools_enabled": False,
            },
            "tags": self.metadata.tags,
        }

    def get_example_usage(self) -> str:
        return """
# Using the Query Analyzer component in a custom agent

# 1. Import the component
from app.agents.components import get_component_config

# 2. Get the component configuration
analyzer_config = get_component_config("system:deep_research:query_analyzer")

# 3. Add to your graph config
graph_config = {
    "nodes": [
        analyzer_config,  # Add the query analyzer node
        # ... your other nodes
    ],
    "edges": [
        {"from_node": "START", "to_node": "query_analyzer"},
        # ... your other edges
    ]
}
"""

    PROMPT_TEMPLATE = """Analyze the following research query and extract structured information.

Query: {{ state.query }}

Please provide your analysis in the following format:

## Topics
List 2-5 main topics that this query is about.

## Entities
List any named entities (people, organizations, places, technical terms).

## Search Terms
Generate 3-5 effective search queries to find information about this topic.

## Query Type
Classify this query as one of:
- factual: Looking for specific facts or data
- exploratory: Open-ended exploration of a topic
- comparative: Comparing multiple things
- analytical: Deep analysis or interpretation needed

Provide your structured analysis:"""


class SynthesisComponent(NodeComponent):
    """
    Synthesis Component

    Synthesizes research results into a comprehensive answer with:
    - Clear structure
    - Key findings
    - Proper citations
    """

    @property
    def metadata(self) -> ComponentMetadata:
        return ComponentMetadata(
            key="system:deep_research:synthesis",
            name="Research Synthesis",
            description="Synthesizes search results into comprehensive answers with citations",
            component_type=ComponentType.NODE,
            version="1.0.0",
            author="Xyzen",
            tags=["research", "synthesis", "citations", "summarization"],
            input_schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The original research query",
                    },
                    "search_results": {
                        "type": "array",
                        "description": "List of search results to synthesize",
                    },
                },
                "required": ["query", "search_results"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "synthesis": {
                        "type": "string",
                        "description": "The synthesized answer",
                    },
                    "citations": {
                        "type": "array",
                        "description": "List of citations used",
                    },
                },
            },
            required_tools=[],
            required_components=[],
        )

    def export_config(self) -> dict[str, Any]:
        """Export as node configuration."""
        return {
            "id": "synthesis",
            "name": "Research Synthesis",
            "type": "llm",
            "description": self.metadata.description,
            "llm_config": {
                "prompt_template": self.PROMPT_TEMPLATE,
                "output_key": "synthesis",
                "temperature_override": 0.5,
                "tools_enabled": False,
            },
            "tags": self.metadata.tags,
        }

    def get_example_usage(self) -> str:
        return """
# Using the Synthesis component in a custom agent

# 1. Import the component
from app.agents.components import get_component_config

# 2. Get the component configuration
synthesis_config = get_component_config("system:deep_research:synthesis")

# 3. Add to your graph config after search nodes
graph_config = {
    "nodes": [
        # ... search nodes
        synthesis_config,  # Add the synthesis node
    ],
    "edges": [
        # ... other edges
        {"from_node": "search", "to_node": "synthesis"},
        {"from_node": "synthesis", "to_node": "END"},
    ]
}
"""

    PROMPT_TEMPLATE = """Based on the following research results, synthesize a comprehensive answer.

## Original Query
{{ state.query }}

## Research Results
{% for result in state.search_results %}
### Source {{ loop.index }}
{{ result.content | default(result | string) }}

{% endfor %}

## Instructions
Please synthesize the information above into a comprehensive answer that:

1. **Directly addresses the query** - Start with the most relevant information
2. **Organizes logically** - Use clear structure and headings if helpful
3. **Cites sources** - Reference sources using [Source N] notation
4. **Acknowledges limitations** - Note any gaps or uncertainties

## Your Synthesis:"""


class ResearchSupervisorComponent(NodeComponent):
    """
    Research Supervisor Component

    Coordinates parallel research tasks by:
    - Analyzing the research brief
    - Delegating to sub-researchers
    - Tracking research progress
    - Deciding when to complete
    """

    @property
    def metadata(self) -> ComponentMetadata:
        return ComponentMetadata(
            key="system:deep_research:supervisor",
            name="Research Supervisor",
            description="Coordinates parallel research by delegating to sub-researchers",
            component_type=ComponentType.NODE,
            version="2.0.0",
            author="Xyzen",
            tags=["research", "supervisor", "delegation", "parallel", "coordination"],
            input_schema={
                "type": "object",
                "properties": {
                    "research_brief": {
                        "type": "string",
                        "description": "The research brief to investigate",
                    },
                    "max_concurrent_units": {
                        "type": "integer",
                        "description": "Maximum parallel research units",
                        "default": 5,
                    },
                },
                "required": ["research_brief"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "notes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Collected research notes from sub-agents",
                    },
                    "research_complete": {
                        "type": "boolean",
                        "description": "Whether research is complete",
                    },
                },
            },
            required_tools=["ConductResearch", "ResearchComplete", "think_tool"],
            required_components=[],
        )

    def export_config(self) -> dict[str, Any]:
        """Export as node configuration."""
        return {
            "id": "research_supervisor",
            "name": "Research Supervisor",
            "type": "llm",
            "description": self.metadata.description,
            "llm_config": {
                "prompt_template": self.PROMPT_TEMPLATE,
                "output_key": "notes",
                "tools_enabled": True,
            },
            "tags": self.metadata.tags,
        }

    def get_example_usage(self) -> str:
        return """
# Using the Research Supervisor component in a custom agent

# 1. Import the component
from app.agents.components import get_component_config

# 2. Get the component configuration
supervisor_config = get_component_config("system:deep_research:supervisor")

# 3. Add to your graph config
graph_config = {
    "nodes": [
        # ... brief generation node
        supervisor_config,  # Add the supervisor node
        # ... synthesis node
    ],
    "edges": [
        {"from_node": "write_brief", "to_node": "research_supervisor"},
        {"from_node": "research_supervisor", "to_node": "synthesis"},
    ]
}

# Note: The supervisor uses ConductResearch tool to spawn sub-researchers
# and think_tool for strategic planning.
"""

    PROMPT_TEMPLATE = """You are a research supervisor coordinating research on the following brief:

{{ state.research_brief }}

Your available tools:
1. **ConductResearch** - Delegate research to a sub-agent with a detailed topic description
2. **ResearchComplete** - Signal that you have gathered enough information
3. **think_tool** - Reflect on progress and plan next steps

Guidelines:
- Use think_tool before delegating to plan your approach
- Delegate clear, specific, non-overlapping topics
- Use parallel delegation for independent subtopics
- Stop when you have comprehensive coverage
- Maximum {{ state.max_concurrent_units | default(5) }} parallel units

Current research notes:
{% for note in state.notes %}
{{ note }}
{% endfor %}

Decide your next action:"""


# Export
__all__ = ["QueryAnalyzerComponent", "SynthesisComponent", "ResearchSupervisorComponent"]
