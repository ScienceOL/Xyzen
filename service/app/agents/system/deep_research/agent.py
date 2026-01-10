"""
Deep Research System Agent

A sophisticated multi-agent research system that:
1. Clarifies research scope with the user (optional)
2. Generates a structured research brief
3. Conducts research via LLM with tools
4. Synthesizes findings into a comprehensive report with citations

This agent uses GraphBuilder for JSON-configurable workflows.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from app.agents.components import BaseComponent
from app.agents.system.base import BaseSystemAgent
from app.agents.system.deep_research.configuration import DEFAULT_CONFIG, DeepResearchConfig
from app.agents.system.deep_research.graph_config import (
    create_deep_research_graph_config,
    create_state_schema,
)
from app.agents.system.deep_research.utils import get_research_tools
from app.agents.types import DynamicCompiledGraph
from app.schemas.graph_config import GraphConfig

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)


class DeepResearchAgent(BaseSystemAgent):
    """
    Deep Research Agent - Research workflow with GraphBuilder.

    This agent implements a research workflow:

    Main Flow:
      1. clarify_with_user - Ask clarifying questions if needed
      2. write_research_brief - Generate structured research brief
      3. research_supervisor - Coordinate research with tools
      4. final_report_generation - Synthesize comprehensive report

    Features:
      - JSON-configurable workflow via GraphConfig
      - Customizable prompts via prompt_templates
      - Tool-enabled research via LLM
      - Citation-rich final reports

    Note:
      Advanced features like parallel research and supervisor loops
      require future GraphBuilder enhancements. See metadata.pending_features
      in the exported GraphConfig for details.
    """

    SYSTEM_KEY = "deep_research"

    def __init__(self, config: DeepResearchConfig | None = None) -> None:
        super().__init__(
            name="Deep Research",
            description=(
                "Research system that generates comprehensive reports with citations. "
                "Uses structured workflow: clarification → research brief → "
                "research execution → final report synthesis."
            ),
            version="3.0.0",
            capabilities=[
                "deep-research",
                "citations",
                "structured-workflow",
                "tool-enabled",
                "json-configurable",
            ],
            tags=["research", "multi-phase", "citations", "configurable"],
            author="Xyzen",
        )
        self.config = config or DEFAULT_CONFIG
        self._main_graph: DynamicCompiledGraph | None = None
        self._graph_config: GraphConfig | None = None

    def configure(
        self,
        llm: "BaseChatModel | None" = None,
        tools: list["BaseTool"] | None = None,
    ) -> "DeepResearchAgent":
        """
        Configure runtime dependencies and build the graph.

        Args:
            llm: LangChain LLM to use for all operations
            tools: List of tools available to researchers (session tools)

        Returns:
            Self for method chaining
        """
        super().configure(llm, tools)

        if llm is not None:
            self._build_graph()

        return self

    def _build_graph(self) -> None:
        """Build graph using GraphBuilder from JSON config."""
        from app.agents.graph_builder import GraphBuilder

        if not self.llm:
            raise RuntimeError("LLM not configured. Call configure() first.")

        # Create the canonical graph config
        self._graph_config = create_deep_research_graph_config(
            max_concurrent_research_units=self.config.max_concurrent_research_units,
            max_researcher_iterations=self.config.max_researcher_iterations,
            allow_clarification=self.config.allow_clarification,
        )

        # Prepare tools
        research_tools = get_research_tools(self.tools or [])
        tool_registry = {t.name: t for t in research_tools}

        # Create LLM factory that returns the configured LLM
        llm = self.llm  # Capture for closure

        async def llm_factory(**kwargs: Any) -> "BaseChatModel":
            # In the future, this could support model overrides from config
            return llm

        # Build graph using GraphBuilder
        builder = GraphBuilder(
            config=self._graph_config,
            llm_factory=llm_factory,
            tool_registry=tool_registry,
        )

        self._main_graph = builder.build()

        logger.info(f"Built Deep Research agent using GraphBuilder (nodes={len(self._graph_config.nodes)})")

    def build_graph(self) -> DynamicCompiledGraph:
        """Build and return the Deep Research graph.

        Returns:
            Compiled StateGraph ready for execution

        Raises:
            RuntimeError: If configure() hasn't been called
        """
        if self._main_graph is None:
            if not self.llm:
                raise RuntimeError("LLM not configured. Call configure() first.")
            self._build_graph()

        return self._main_graph  # type: ignore[return-value]

    def get_state_schema(self) -> dict[str, Any]:
        """Return the state schema for this agent."""
        schema = create_state_schema()
        return {name: field.type for name, field in schema.fields.items()}

    def export_graph_config(self) -> GraphConfig:
        """Export as JSON GraphConfig for forking.

        This returns the canonical GraphConfig that can be used to:
        1. Reconstruct the agent workflow via GraphBuilder
        2. Fork and customize the agent configuration
        3. Visualize the workflow structure

        Note: The exported config includes TODO markers for features that
        require GraphBuilder enhancement (parallel execution, loops).
        """
        if self._graph_config:
            return self._graph_config

        return create_deep_research_graph_config(
            max_concurrent_research_units=self.config.max_concurrent_research_units,
            max_researcher_iterations=self.config.max_researcher_iterations,
            allow_clarification=self.config.allow_clarification,
        )

    def get_exported_components(self) -> list[BaseComponent]:
        """Return reusable components from this agent."""
        from app.agents.system.deep_research.components import (
            QueryAnalyzerComponent,
            ResearchSupervisorComponent,
            SynthesisComponent,
        )

        return [
            QueryAnalyzerComponent(),
            SynthesisComponent(),
            ResearchSupervisorComponent(),
        ]


# Export
__all__ = ["DeepResearchAgent", "DeepResearchConfig"]
