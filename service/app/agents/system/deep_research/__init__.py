"""
Deep Research System Agent

A research system that provides:
- User clarification (optional)
- Research brief generation
- Tool-enabled research via LLM
- Comprehensive report synthesis with citations

Usage:
    from app.agents.system.deep_research import DeepResearchAgent

    agent = DeepResearchAgent()
    agent.configure(llm=my_llm, tools=[search_tool])
    graph = agent.build_graph()

    result = await graph.ainvoke({"messages": [HumanMessage(content="Research topic")]})

    # Customize configuration
    from app.agents.system.deep_research import DeepResearchConfig
    config = DeepResearchConfig(allow_clarification=False, max_researcher_iterations=4)
    agent = DeepResearchAgent(config=config)
"""

from app.agents.system.deep_research.agent import DeepResearchAgent
from app.agents.system.deep_research.components import (
    QueryAnalyzerComponent,
    ResearchSupervisorComponent,
    SynthesisComponent,
)
from app.agents.system.deep_research.configuration import DEFAULT_CONFIG, DeepResearchConfig
from app.agents.system.deep_research.graph_config import (
    DEFAULT_GRAPH_CONFIG,
    create_deep_research_graph_config,
    create_state_schema,
    get_default_prompts,
)

__all__ = [
    # Main agent
    "DeepResearchAgent",
    # Configuration
    "DeepResearchConfig",
    "DEFAULT_CONFIG",
    # Graph configuration (JSON-configurable)
    "create_deep_research_graph_config",
    "create_state_schema",
    "get_default_prompts",
    "DEFAULT_GRAPH_CONFIG",
    # Components
    "QueryAnalyzerComponent",
    "SynthesisComponent",
    "ResearchSupervisorComponent",
]
