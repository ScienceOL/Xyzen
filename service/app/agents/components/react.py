"""
ReAct Component - Reasoning + Acting pattern implementation.

This module provides the ReActComponent, a reusable ExecutableComponent that
implements the ReAct pattern: an LLM reasons about tasks and calls tools as needed.

This is the core building block for tool-using agents and can be:
- Used directly in JSON graph configs as a "component" node
- Composed with other components in larger workflows
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

from app.agents.components import ComponentMetadata, ComponentType
from app.agents.components.executable import ExecutableComponent

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool
    from langgraph.graph.state import CompiledStateGraph

    from app.agents.types import LLMFactory

logger = logging.getLogger(__name__)


class ReActComponent(ExecutableComponent):
    """
    ReAct Reasoning Component

    Implements the ReAct pattern (Reason + Act):
    - LLM reasons about the task
    - Calls tools when needed
    - Loops until task is complete (no more tool calls)

    This is the core building block for tool-using agents.
    It uses LangGraph's prebuilt ToolNode and tools_condition
    for battle-tested tool execution.

    Configuration options:
    - system_prompt: Instructions for the LLM (default: "You are a helpful assistant.")
    - max_iterations: Maximum number of tool-calling iterations (default: 10)

    Required capabilities: None (uses all provided tools)

    Example JSON config:
    {
        "id": "agent",
        "type": "component",
        "component_config": {
            "component_ref": {"key": "react", "version": "^1.0"},
            "config_overrides": {
                "system_prompt": "You are a research assistant.",
                "max_iterations": 5
            }
        }
    }
    """

    @property
    def metadata(self) -> ComponentMetadata:
        return ComponentMetadata(
            key="react",
            name="ReAct Reasoning Engine",
            description=(
                "Reasoning + Acting loop with tool calling. "
                "The LLM reasons about tasks, calls tools when needed, "
                "and loops until the task is complete."
            ),
            component_type=ComponentType.SUBGRAPH,
            version="1.0.0",
            author="Xyzen",
            tags=["reasoning", "tools", "loop", "react"],
            required_capabilities=[],  # Uses all provided tools
            config_schema_json={
                "type": "object",
                "properties": {
                    "system_prompt": {
                        "type": "string",
                        "description": "Instructions for the LLM",
                        "default": "You are a helpful assistant.",
                    },
                    "max_iterations": {
                        "type": "integer",
                        "description": "Maximum tool-calling iterations",
                        "default": 10,
                        "minimum": 1,
                        "maximum": 100,
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
                },
                "required": ["messages"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "messages": {
                        "type": "array",
                        "description": "Updated messages with LLM responses and tool results",
                    },
                },
            },
        )

    def build_graph(
        self,
        llm_factory: "LLMFactory",
        tools: list["BaseTool"],
        config: dict[str, Any] | None = None,
    ) -> "CompiledStateGraph":
        """
        Build ReAct agent graph using LangGraph primitives.

        Args:
            llm_factory: Factory to create LLM instances
            tools: All tools to make available (no filtering, uses all)
            config: Runtime configuration (system_prompt, max_iterations)

        Returns:
            Compiled StateGraph implementing the ReAct pattern
        """
        cfg = config or {}
        system_prompt = cfg.get("system_prompt", "You are a helpful assistant.")
        max_iterations = cfg.get("max_iterations", 10)

        logger.info(f"Building ReActComponent graph with {len(tools)} tools")

        # Create state graph with MessagesState
        workflow: StateGraph[MessagesState] = StateGraph(MessagesState)

        # Track iterations to prevent infinite loops
        iteration_count = 0

        # Agent node: LLM with tools bound
        async def agent_node(state: MessagesState) -> dict[str, Any]:
            nonlocal iteration_count
            iteration_count += 1

            if iteration_count > max_iterations:
                logger.warning(f"ReActComponent hit max_iterations ({max_iterations})")
                from langchain_core.messages import AIMessage

                return {
                    "messages": [
                        AIMessage(
                            content=f"I've reached the maximum number of iterations ({max_iterations}). "
                            "Let me provide what I have so far."
                        )
                    ]
                }

            # Get LLM from factory
            llm = await llm_factory()

            # Bind tools if available
            if tools:
                llm_with_tools = llm.bind_tools(tools)
            else:
                llm_with_tools = llm

            # Build messages with system prompt
            messages = [SystemMessage(content=system_prompt)] + list(state["messages"])

            # Invoke LLM
            response = await llm_with_tools.ainvoke(messages)

            return {"messages": [response]}

        # Add nodes
        workflow.add_node("agent", agent_node)

        if tools:
            # Add tool node using LangGraph's ToolNode
            tool_node = ToolNode(tools)
            workflow.add_node("tools", tool_node)

            # Add edges
            workflow.add_edge(START, "agent")
            workflow.add_conditional_edges("agent", tools_condition)
            workflow.add_edge("tools", "agent")
        else:
            # No tools - simple flow
            workflow.add_edge(START, "agent")
            workflow.add_edge("agent", END)

        # Compile and return
        compiled = workflow.compile()
        logger.info("ReActComponent graph compiled successfully")
        return compiled

    def get_example_usage(self) -> str | None:
        return """
# Using ReActComponent in a JSON graph config

{
    "version": "2.0",
    "nodes": [
        {
            "id": "react_agent",
            "name": "Research Agent",
            "type": "component",
            "component_config": {
                "component_ref": {
                    "key": "react",
                    "version": "^1.0"
                },
                "config_overrides": {
                    "system_prompt": "You are a research assistant.",
                    "max_iterations": 5
                }
            }
        }
    ],
    "edges": [
        {"from_node": "START", "to_node": "react_agent"},
        {"from_node": "react_agent", "to_node": "END"}
    ]
}

# Or using it programmatically in Python:

from app.agents.components.react import ReActComponent

component = ReActComponent()
graph = component.build_graph(
    llm_factory=my_llm_factory,
    tools=[search_tool, calculator_tool],
    config={"system_prompt": "You are a helpful assistant."}
)

result = await graph.ainvoke({"messages": [HumanMessage(content="Hello")]})
"""


# Export
__all__ = ["ReActComponent"]
