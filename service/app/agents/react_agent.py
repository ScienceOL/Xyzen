"""
ReAct Agent - Default tool-calling agent for chat conversations.

This module provides the standard ReAct (Reasoning + Acting) agent that uses
LangChain's create_agent for tool-calling conversations.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool

from .base_graph_agent import BaseBuiltinGraphAgent

if TYPE_CHECKING:
    from langgraph.graph.state import CompiledStateGraph

logger = logging.getLogger(__name__)


class ReActAgent(BaseBuiltinGraphAgent):
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

    Attributes:
        llm: LangChain chat model for reasoning
        tools: List of tools the agent can use
        system_prompt: System prompt to guide agent behavior
        google_search_enabled: Whether to enable Google's builtin search
    """

    llm: BaseChatModel
    tools: list[BaseTool]
    system_prompt: str
    google_search_enabled: bool

    def __init__(
        self,
        llm: BaseChatModel,
        tools: list[BaseTool],
        system_prompt: str = "",
        google_search_enabled: bool = False,
        name: str = "ReAct Agent",
        description: str = "Default tool-calling agent using ReAct pattern",
        version: str = "1.0.0",
    ) -> None:
        """
        Initialize the ReAct agent.

        Args:
            llm: LangChain chat model for reasoning
            tools: List of tools the agent can use
            system_prompt: System prompt to guide agent behavior
            google_search_enabled: Enable Google's builtin web search
            name: Human-readable name
            description: Description of agent capabilities
            version: Version string
        """
        super().__init__(
            name=name,
            description=description,
            version=version,
            capabilities=["tool-calling", "reasoning", "multi-turn-conversation"],
            tags=["default", "react", "chat"],
        )
        self.llm = llm
        self.tools = tools
        self.system_prompt = system_prompt
        self.google_search_enabled = google_search_enabled

    def build_graph(self) -> "CompiledStateGraph":
        """
        Build the ReAct agent graph using LangGraph's prebuilt implementation.

        When google_search_enabled is True, binds both the google_search
        provider tool and MCP tools together to the model.

        Returns:
            Compiled StateGraph ready for execution
        """
        logger.info(f"Building ReAct agent with {len(self.tools)} tools, google_search={self.google_search_enabled}")

        # Combine all tools for binding
        # MCP tools (client-side) are passed as-is
        # Google search (provider-side) is added as a special dict format
        all_tools: list[BaseTool | dict[str, Any]] = list(self.tools)

        if self.google_search_enabled:
            # Add Google's builtin search as a provider-side tool
            # This format is recognized by Google models for native search
            all_tools.append({"google_search": {}})
            logger.info("Added google_search to agent tools")

        # Use LangChain's create_agent (replacement for deprecated create_react_agent)
        # Pass all tools together so they're bound in a single call
        agent: CompiledStateGraph = create_agent(
            model=self.llm,
            tools=all_tools,
            system_prompt=self.system_prompt if self.system_prompt else None,
        )

        logger.debug("Agent graph built successfully")
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

    def supports_streaming(self) -> bool:
        """ReAct agent supports streaming."""
        return True

    def get_required_tools(self) -> list[str]:
        """Return names of tools configured for this agent."""
        tool_names = [tool.name for tool in self.tools]
        if self.google_search_enabled:
            tool_names.append("google_search")
        return tool_names


# Note: This agent is NOT auto-discovered because it requires runtime parameters
# (llm, tools). It's instantiated via the factory instead.
