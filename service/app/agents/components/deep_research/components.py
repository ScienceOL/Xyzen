"""
Deep Research ExecutableComponents - Runnable components for the Deep Research agent.

These components implement the Deep Research workflow phases as ExecutableComponents
that can be composed via GraphConfig v2. Each component builds its own subgraph.

Components:
- ClarifyWithUserComponent: Determines if clarification/follow-up is needed
- ResearchBriefComponent: Generates research brief from user query
- ResearchSupervisorComponent: ReAct loop coordinating research with tools
- FinalReportComponent: Synthesizes findings into comprehensive report
"""

from __future__ import annotations

import logging
import operator
from typing import TYPE_CHECKING, Annotated, Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from pydantic import BaseModel, ConfigDict, Field

from app.agents.components import ComponentMetadata, ComponentType
from app.agents.components.executable import ExecutableComponent
from app.agents.components.deep_research.prompts import (
    CLARIFY_WITH_USER_PROMPT,
    FINAL_REPORT_PROMPT,
    LEAD_RESEARCHER_PROMPT,
    RESEARCH_BRIEF_PROMPT,
)
from app.agents.components.deep_research.state import ClarifyWithUser
from app.agents.components.deep_research.utils import get_buffer_string, get_today_str
from app.agents.utils import extract_text_from_content
from app.tools.capabilities import ToolCapability

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool
    from langgraph.graph.state import CompiledStateGraph

    from app.agents.types import LLMFactory

logger = logging.getLogger(__name__)


# --- Component State Schemas ---


class ClarifyState(BaseModel):
    """State for ClarifyWithUserComponent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    messages: Annotated[list[BaseMessage], add_messages] = Field(default_factory=list)
    need_clarification: bool = False
    skip_research: bool = False


class BriefState(BaseModel):
    """State for ResearchBriefComponent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    messages: Annotated[list[BaseMessage], add_messages] = Field(default_factory=list)
    research_brief: str = ""


class SupervisorState(BaseModel):
    """State for ResearchSupervisorComponent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    messages: Annotated[list[BaseMessage], add_messages] = Field(default_factory=list)
    research_brief: str = ""
    notes: Annotated[list[str], operator.add] = Field(default_factory=list)


class FinalReportState(BaseModel):
    """State for FinalReportComponent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    messages: Annotated[list[BaseMessage], add_messages] = Field(default_factory=list)
    research_brief: str = ""
    notes: Annotated[list[str], operator.add] = Field(default_factory=list)
    final_report: str = ""


# --- ExecutableComponents ---


class ClarifyWithUserComponent(ExecutableComponent):
    """
    Clarify With User Component

    Analyzes user messages to determine:
    1. If clarification is needed for ambiguous research requests
    2. If this is a follow-up request (translation, summary, etc.) that doesn't need research
    3. If research should proceed as normal

    Uses structured output with ClarifyWithUser pydantic model.
    No tools required - pure LLM reasoning.
    """

    @property
    def metadata(self) -> ComponentMetadata:
        return ComponentMetadata(
            key="deep_research:clarify",
            name="Clarify With User",
            description=(
                "Analyzes user messages to determine if clarification is needed, "
                "if this is a follow-up request, or if research should proceed."
            ),
            component_type=ComponentType.SUBGRAPH,
            version="2.0.0",
            author="Xyzen",
            tags=["research", "clarification", "structured-output", "deep-research"],
            required_capabilities=[],  # No tools needed
            config_schema_json={
                "type": "object",
                "properties": {},
            },
            input_schema={
                "type": "object",
                "properties": {
                    "messages": {
                        "type": "array",
                        "description": "Conversation messages",
                    },
                },
                "required": ["messages"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "need_clarification": {
                        "type": "boolean",
                        "description": "Whether clarification is needed",
                    },
                    "skip_research": {
                        "type": "boolean",
                        "description": "Whether to skip research (follow-up request)",
                    },
                    "messages": {
                        "type": "array",
                        "description": "Updated messages with clarification/response",
                    },
                },
            },
        )

    async def build_graph(
        self,
        llm_factory: "LLMFactory",
        tools: list["BaseTool"],
        config: dict[str, Any] | None = None,
    ) -> "CompiledStateGraph":
        """Build clarification graph with structured output."""
        logger.info("Building ClarifyWithUserComponent graph")

        workflow: StateGraph[ClarifyState] = StateGraph(ClarifyState)

        async def clarify_node(state: ClarifyState) -> dict[str, Any]:
            """LLM node with structured output for clarification."""
            # Get LLM configured for structured output
            llm = await llm_factory(temperature=0.3)
            llm_with_struct = llm.with_structured_output(ClarifyWithUser)

            # Format prompt - cast to list for type compatibility
            messages_str = get_buffer_string(list(state.messages))
            date_str = get_today_str()
            prompt = CLARIFY_WITH_USER_PROMPT.format(messages=messages_str, date=date_str)

            # Invoke with structured output
            response = await llm_with_struct.ainvoke([HumanMessage(content=prompt)])
            # Ensure we have the right type
            result = response if isinstance(response, ClarifyWithUser) else ClarifyWithUser.model_validate(response)

            # Determine user-facing message
            user_message = result.question if result.need_clarification else result.verification

            logger.info(
                f"ClarifyWithUser: need_clarification={result.need_clarification}, skip_research={result.skip_research}"
            )

            return {
                "need_clarification": result.need_clarification,
                "skip_research": result.skip_research,
                "messages": [AIMessage(content=user_message)] if user_message else [],
            }

        workflow.add_node("clarify", clarify_node)
        workflow.add_edge(START, "clarify")
        workflow.add_edge("clarify", END)

        compiled = workflow.compile()
        logger.info("ClarifyWithUserComponent graph compiled")
        return compiled


class ResearchBriefComponent(ExecutableComponent):
    """
    Research Brief Component

    Transforms user messages into a structured research brief that guides
    the research phase. Uses RESEARCH_BRIEF_PROMPT to generate detailed,
    specific research questions.

    No tools required - pure LLM generation.
    """

    @property
    def metadata(self) -> ComponentMetadata:
        return ComponentMetadata(
            key="deep_research:brief",
            name="Research Brief Generator",
            description=(
                "Transforms user messages into a structured research brief with detailed, specific research questions."
            ),
            component_type=ComponentType.SUBGRAPH,
            version="2.0.0",
            author="Xyzen",
            tags=["research", "brief", "planning", "deep-research"],
            required_capabilities=[],  # No tools needed
            config_schema_json={
                "type": "object",
                "properties": {},
            },
            input_schema={
                "type": "object",
                "properties": {
                    "messages": {
                        "type": "array",
                        "description": "Conversation messages",
                    },
                },
                "required": ["messages"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "research_brief": {
                        "type": "string",
                        "description": "Generated research brief",
                    },
                    "messages": {
                        "type": "array",
                        "description": "Updated messages",
                    },
                },
            },
        )

    async def build_graph(
        self,
        llm_factory: "LLMFactory",
        tools: list["BaseTool"],
        config: dict[str, Any] | None = None,
    ) -> "CompiledStateGraph":
        """Build research brief generation graph."""
        logger.info("Building ResearchBriefComponent graph")

        workflow: StateGraph[BriefState] = StateGraph(BriefState)

        async def brief_node(state: BriefState) -> dict[str, Any]:
            """Generate research brief from user messages."""
            llm = await llm_factory(temperature=0.5)

            # Format prompt - cast to list for type compatibility
            messages_str = get_buffer_string(list(state.messages))
            date_str = get_today_str()
            prompt = RESEARCH_BRIEF_PROMPT.format(messages=messages_str, date=date_str)

            # Invoke LLM
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            brief = extract_text_from_content(response.content)

            logger.info(f"Generated research brief: {brief[:100]}...")

            return {
                "research_brief": brief,
                "messages": [AIMessage(content=f"Research brief generated: {brief[:200]}...")],
            }

        workflow.add_node("brief", brief_node)
        workflow.add_edge(START, "brief")
        workflow.add_edge("brief", END)

        compiled = workflow.compile()
        logger.info("ResearchBriefComponent graph compiled")
        return compiled


class ResearchSupervisorComponent(ExecutableComponent):
    """
    Research Supervisor Component

    Coordinates research by delegating to ConductResearch tool and using
    think_tool for strategic planning. Implements a ReAct-style loop:

    1. LLM reasons about research progress
    2. Calls ConductResearch to delegate research tasks
    3. Calls think_tool to reflect on findings
    4. Calls ResearchComplete when done

    Required capabilities: research, think
    """

    @property
    def metadata(self) -> ComponentMetadata:
        return ComponentMetadata(
            key="deep_research:supervisor",
            name="Research Supervisor",
            description=(
                "Coordinates research by delegating to sub-researchers. "
                "Uses ConductResearch, ResearchComplete, and think_tool."
            ),
            component_type=ComponentType.SUBGRAPH,
            version="2.0.0",
            author="Xyzen",
            tags=["research", "supervisor", "delegation", "react", "deep-research"],
            # Request WEB_SEARCH tools (session tools) - research tools are created internally
            required_capabilities=[
                ToolCapability.WEB_SEARCH,
            ],
            config_schema_json={
                "type": "object",
                "properties": {
                    "max_iterations": {
                        "type": "integer",
                        "description": "Maximum iterations for research loop",
                        "default": 6,
                        "minimum": 1,
                        "maximum": 20,
                    },
                    "max_concurrent_units": {
                        "type": "integer",
                        "description": "Maximum parallel research units",
                        "default": 5,
                        "minimum": 1,
                        "maximum": 10,
                    },
                },
            },
            input_schema={
                "type": "object",
                "properties": {
                    "messages": {
                        "type": "array",
                        "description": "Conversation messages",
                    },
                    "research_brief": {
                        "type": "string",
                        "description": "Research brief to investigate",
                    },
                },
                "required": ["messages", "research_brief"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "notes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Collected research notes",
                    },
                    "messages": {
                        "type": "array",
                        "description": "Updated messages",
                    },
                },
            },
        )

    async def build_graph(
        self,
        llm_factory: "LLMFactory",
        tools: list["BaseTool"],
        config: dict[str, Any] | None = None,
    ) -> "CompiledStateGraph":
        """Build supervisor ReAct loop graph.

        Args:
            llm_factory: Factory to create LLM instances
            tools: Session tools (web_search, etc.) - research tools are created internally
            config: Optional configuration overrides
        """
        from app.tools.builtin.research import get_research_tools

        cfg = config or {}
        max_iterations = cfg.get("max_iterations", 6)
        max_concurrent_units = cfg.get("max_concurrent_units", 5)

        # Create research tools from session tools
        # This wraps session tools with ConductResearch, ResearchComplete, think_tool
        research_tools = get_research_tools(tools)

        logger.info(
            f"Building ResearchSupervisorComponent graph with {len(research_tools)} research tools "
            f"(from {len(tools)} session tools), max_iterations={max_iterations}"
        )

        if not research_tools:
            raise ValueError("ResearchSupervisorComponent requires research tools")

        workflow: StateGraph[SupervisorState] = StateGraph(SupervisorState)

        # Track iterations
        iteration_count = 0

        async def supervisor_node(state: SupervisorState) -> dict[str, Any]:
            """Supervisor LLM node with tools."""
            nonlocal iteration_count
            iteration_count += 1

            if iteration_count > max_iterations:
                logger.warning(f"Supervisor hit max_iterations ({max_iterations})")
                return {
                    "messages": [
                        AIMessage(
                            content=f"Reached maximum iterations ({max_iterations}). "
                            "Proceeding with collected findings."
                        )
                    ]
                }

            # Get LLM with tools bound
            llm = await llm_factory()
            llm_with_tools = llm.bind_tools(research_tools)

            # Format prompt
            date_str = get_today_str()
            prompt = LEAD_RESEARCHER_PROMPT.format(
                date=date_str,
                research_brief=state.research_brief,
                max_researcher_iterations=max_iterations,
                max_concurrent_research_units=max_concurrent_units,
            )

            # Build messages - include system prompt and conversation
            messages = [SystemMessage(content=prompt)] + list(state.messages)

            # Invoke LLM
            response = await llm_with_tools.ainvoke(messages)

            # Extract response details for logging
            tool_calls_count = (
                len(response.tool_calls) if hasattr(response, "tool_calls") and response.tool_calls else 0
            )
            content = response.content if hasattr(response, "content") else None
            content_preview = None
            if content:
                if isinstance(content, str):
                    content_preview = content[:100]
                elif isinstance(content, list):
                    # Handle structured content
                    texts = [
                        item.get("text", "")
                        for item in content
                        if isinstance(item, dict) and item.get("type") == "text"
                    ]
                    content_preview = "".join(texts)[:100] if texts else str(content)[:100]

            logger.info(
                f"Supervisor iteration {iteration_count}: "
                f"tool_calls={tool_calls_count}, content_preview={content_preview}"
            )

            return {"messages": [response]}

        # Tool node using LangGraph's ToolNode
        tool_node = ToolNode(research_tools)

        async def tools_node(state: SupervisorState) -> dict[str, Any]:
            """Execute tools and collect notes from results."""
            result = await tool_node.ainvoke(state)

            # Extract notes from tool results
            notes: list[str] = []
            if "messages" in result:
                for msg in result["messages"]:
                    if hasattr(msg, "content") and msg.content:
                        content = msg.content if isinstance(msg.content, str) else str(msg.content)
                        # Only add substantial content as notes
                        if len(content) > 50:
                            notes.append(content)

            return {
                "messages": result.get("messages", []),
                "notes": notes,
            }

        # Add nodes
        workflow.add_node("supervisor", supervisor_node)
        workflow.add_node("tools", tools_node)

        # Add edges with tools_condition for routing
        workflow.add_edge(START, "supervisor")
        workflow.add_conditional_edges("supervisor", tools_condition)
        workflow.add_edge("tools", "supervisor")

        compiled = workflow.compile()
        logger.info("ResearchSupervisorComponent graph compiled")
        return compiled


class FinalReportComponent(ExecutableComponent):
    """
    Final Report Component

    Synthesizes all research findings into a comprehensive, well-structured
    report with citations. Uses FINAL_REPORT_PROMPT to generate the report.

    No tools required - pure LLM synthesis.
    """

    @property
    def metadata(self) -> ComponentMetadata:
        return ComponentMetadata(
            key="deep_research:final_report",
            name="Final Report Generator",
            description=(
                "Synthesizes research findings into a comprehensive report "
                "with proper structure, citations, and markdown formatting."
            ),
            component_type=ComponentType.SUBGRAPH,
            version="2.0.0",
            author="Xyzen",
            tags=["research", "synthesis", "report", "citations", "deep-research"],
            required_capabilities=[],  # No tools needed
            config_schema_json={
                "type": "object",
                "properties": {},
            },
            input_schema={
                "type": "object",
                "properties": {
                    "messages": {
                        "type": "array",
                        "description": "Conversation messages",
                    },
                    "research_brief": {
                        "type": "string",
                        "description": "Original research brief",
                    },
                    "notes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Research findings/notes",
                    },
                },
                "required": ["messages", "research_brief", "notes"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "final_report": {
                        "type": "string",
                        "description": "Generated comprehensive report",
                    },
                    "messages": {
                        "type": "array",
                        "description": "Updated messages with report",
                    },
                },
            },
        )

    async def build_graph(
        self,
        llm_factory: "LLMFactory",
        tools: list["BaseTool"],
        config: dict[str, Any] | None = None,
    ) -> "CompiledStateGraph":
        """Build final report generation graph."""
        logger.info("Building FinalReportComponent graph")

        workflow: StateGraph[FinalReportState] = StateGraph(FinalReportState)

        async def report_node(state: FinalReportState) -> dict[str, Any]:
            """Generate final report from research findings."""
            llm = await llm_factory()

            # Format prompt with research context - cast to list for type compatibility
            messages_str = get_buffer_string(list(state.messages))
            date_str = get_today_str()
            findings = "\n\n".join(state.notes) if state.notes else "No research notes collected."

            prompt = FINAL_REPORT_PROMPT.format(
                research_brief=state.research_brief,
                messages=messages_str,
                date=date_str,
                findings=findings,
            )

            # Invoke LLM
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            report = extract_text_from_content(response.content)

            logger.info(f"Generated final report: {len(report)} characters")

            return {
                "final_report": report,
                "messages": [AIMessage(content=report)],
            }

        workflow.add_node("report", report_node)
        workflow.add_edge(START, "report")
        workflow.add_edge("report", END)

        compiled = workflow.compile()
        logger.info("FinalReportComponent graph compiled")
        return compiled


# Export
__all__ = [
    "ClarifyWithUserComponent",
    "ResearchBriefComponent",
    "ResearchSupervisorComponent",
    "FinalReportComponent",
]
