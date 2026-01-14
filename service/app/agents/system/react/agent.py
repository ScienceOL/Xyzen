"""
ReAct System Agent - Default tool-calling agent for chat conversations.

This module provides the standard ReAct (Reasoning + Acting) agent that uses
LangChain's create_agent for tool-calling conversations.

As a system agent, ReAct:
- Is the default agent when no agent is specified
- Can be forked by users to customize behavior
- Exports its configuration for JSON-based customization
"""

from __future__ import annotations

import logging
from typing import Any

from langchain.agents import create_agent
from langchain_core.tools import BaseTool
from langgraph.graph.state import CompiledStateGraph

from app.agents.components import BaseComponent
from app.agents.system.base import BaseSystemAgent
from app.schemas.graph_config_v2 import (
    ConditionType,
    GraphConfig,
    GraphEdgeConfig,
    GraphNodeConfig,
    LLMNodeConfig,
    NodeType,
    ToolNodeConfig,
)

logger = logging.getLogger(__name__)


class ReActAgent(BaseSystemAgent):
    """
    Default ReAct agent for tool-calling conversations.

    Uses LangGraph's prebuilt create_react_agent which implements
    the ReAct pattern: Reasoning + Acting with tool calls.

    This agent:
    - Processes user messages
    - Decides whether to use tools or respond directly
    - Executes tools and incorporates results
    - Generates final responses

    Supports combining provider-side tools (like Google Search) with
    client-side tools (like MCP tools) by binding them together.

    As a system agent, ReAct is available to all users and can be
    forked to create customized versions.
    """

    SYSTEM_KEY = "react"

    # Additional configuration options
    system_prompt: str
    google_search_enabled: bool

    def __init__(
        self,
        system_prompt: str = "",
        google_search_enabled: bool = False,
    ) -> None:
        """
        Initialize the ReAct agent.

        Args:
            system_prompt: System prompt to guide agent behavior
            google_search_enabled: Enable Google's builtin web search
        """
        super().__init__(
            name="ReAct Agent",
            description="Default tool-calling agent using ReAct pattern for reasoning and acting",
            version="1.0.0",
            capabilities=["tool-calling", "reasoning", "multi-turn-conversation"],
            tags=["default", "react", "chat", "tool-calling"],
            author="Xyzen",
        )
        self.system_prompt = system_prompt
        self.google_search_enabled = google_search_enabled

    def build_graph(self) -> CompiledStateGraph[Any, None, Any, Any]:
        """
        Build the ReAct agent graph using LangGraph's prebuilt implementation.

        When google_search_enabled is True, binds both the google_search
        provider tool and MCP tools together to the model.

        Returns:
            Compiled StateGraph ready for execution
        """
        if not self.llm:
            raise RuntimeError("LLM not configured. Call configure() first.")

        tools = self.tools or []
        logger.info(f"Building ReAct agent with {len(tools)} tools, google_search={self.google_search_enabled}")

        # Combine all tools for binding
        # MCP tools (client-side) are passed as-is
        # Provider-side web search is bound at model creation time.
        all_tools: list[BaseTool] = list(tools)

        # Use LangChain's create_agent (replacement for deprecated create_react_agent)
        # Pass all tools together so they're bound in a single call
        agent: CompiledStateGraph[Any, None, Any, Any] = create_agent(
            model=self.llm,
            tools=all_tools,
            system_prompt=self.system_prompt if self.system_prompt else None,
        )

        logger.debug("ReAct agent graph built successfully")
        return agent

    def get_state_schema(self) -> dict[str, Any]:
        """
        Return the state schema for ReAct agent.

        The prebuilt create_react_agent uses a standard messages-based schema.

        Returns:
            State schema definition
        """
        return {
            "messages": "list[BaseMessage] - Conversation messages",
        }

    def export_graph_config(self) -> GraphConfig:
        """
        Export the ReAct agent's workflow as a v2 GraphConfig.

        The ReAct pattern consists of:
        1. Agent node (LLM) - Reasons and decides whether to use tools
        2. Tool node - Executes any requested tool calls (uses LangGraph's ToolNode)
        3. Conditional routing via edges - Uses tools_condition for routing

        Note: v2 schema removes the separate router node - routing is done
        via conditional edges with ConditionType.HAS_TOOL_CALLS.

        Returns:
            GraphConfig v2 representing this agent's workflow
        """
        return GraphConfig(
            version="2.0",
            nodes=[
                # Agent node - LLM reasoning with tool binding
                GraphNodeConfig(
                    id="agent",
                    name="ReAct Agent",
                    type=NodeType.LLM,
                    description="Reasons about the task and decides whether to use tools or respond",
                    llm_config=LLMNodeConfig(
                        prompt_template=self.system_prompt or "You are a helpful assistant.",
                        output_key="response",
                        tools_enabled=True,
                    ),
                    position={"x": 250, "y": 100},
                ),
                # Tool execution node - uses LangGraph's ToolNode
                GraphNodeConfig(
                    id="tools",
                    name="Execute Tools",
                    type=NodeType.TOOL,
                    description="Executes tool calls from the agent",
                    tool_config=ToolNodeConfig(
                        execute_all=True,
                        output_key="tool_results",
                    ),
                    position={"x": 450, "y": 250},
                ),
            ],
            edges=[
                # START -> agent
                GraphEdgeConfig(from_node="START", to_node="agent"),
                # agent -> tools (if has tool calls)
                GraphEdgeConfig(
                    from_node="agent",
                    to_node="tools",
                    condition=ConditionType.HAS_TOOL_CALLS,
                ),
                # agent -> END (if no tool calls)
                GraphEdgeConfig(
                    from_node="agent",
                    to_node="END",
                    condition=ConditionType.NO_TOOL_CALLS,
                ),
                # tools -> agent (loop back)
                GraphEdgeConfig(from_node="tools", to_node="agent"),
            ],
            entry_point="agent",
            metadata={
                "author": "Xyzen",
                "version": "2.0.0",
                "description": "ReAct agent with tool-calling loop",
                "pattern": "react",
                "system_agent_key": "react",
            },
        )

    def get_exported_components(self) -> list[BaseComponent]:
        """
        Return list of reusable components this agent provides.

        The ReAct agent uses LangGraph's prebuilt implementation,
        so it doesn't export custom components.

        Returns:
            Empty list (no custom components)
        """
        return []

    def supports_streaming(self) -> bool:
        """ReAct agent supports streaming."""
        return True

    def get_required_tools(self) -> list[str]:
        """Return names of tools configured for this agent."""
        if self.tools:
            return [tool.name for tool in self.tools]
        return []


# Export
__all__ = ["ReActAgent"]
