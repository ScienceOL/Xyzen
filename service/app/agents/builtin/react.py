"""
ReAct Agent - Default tool-calling agent configuration.

This module provides the GraphConfig for the ReAct (Reasoning + Acting) agent,
which is the default agent used when no agent is specified in a chat session.

The ReAct pattern consists of:
1. An LLM node that reasons about tasks and decides whether to use tools
2. A tool node that executes any requested tool calls
3. Conditional routing based on whether tool calls are present

This config builds the ReAct pattern directly using LLM and TOOL nodes
(not as a component/subgraph) to ensure proper streaming support.
"""

from __future__ import annotations

from app.schemas.graph_config import (
    ConditionType,
    GraphConfig,
    GraphEdgeConfig,
    GraphNodeConfig,
    LLMNodeConfig,
    NodeType,
    ToolNodeConfig,
)
from app.schemas.prompt_config import PromptConfig

# ReAct Agent configuration using direct LLM and TOOL nodes (NOT subgraph)
# This ensures proper streaming support through LangGraph's messages mode
REACT_CONFIG = GraphConfig(
    version="2.0",
    nodes=[
        GraphNodeConfig(
            id="agent",
            name="ReAct Agent",
            type=NodeType.LLM,
            description="Reasoning + Acting agent with tool calling capability",
            llm_config=LLMNodeConfig(
                prompt_template="You are a helpful assistant.",
                tools_enabled=True,
                output_key="response",
            ),
            tags=["reasoning", "tools", "react"],
        ),
        GraphNodeConfig(
            id="tools",
            name="Tool Executor",
            type=NodeType.TOOL,
            description="Execute tool calls from the agent",
            tool_config=ToolNodeConfig(
                execute_all=True,
            ),
            tags=["tools"],
        ),
    ],
    edges=[
        GraphEdgeConfig(from_node="START", to_node="agent"),
        # Route to tools if there are tool calls, otherwise end
        GraphEdgeConfig(from_node="agent", to_node="tools", condition=ConditionType.HAS_TOOL_CALLS),
        GraphEdgeConfig(from_node="agent", to_node="END", condition=ConditionType.NO_TOOL_CALLS),
        # After tools, go back to agent
        GraphEdgeConfig(from_node="tools", to_node="agent"),
    ],
    entry_point="agent",
    prompt_config=PromptConfig(
        custom_instructions="",  # User should set their instructions here
    ),
    metadata={
        "builtin_key": "react",
        "display_name": "ReAct Agent",
        "description": "Default agent with reasoning and tool-calling capability",
        "icon": "brain",
        "author": "Xyzen",
        "version": "2.0.0",
        "pattern": "react",
        "system_agent_key": "react",  # For backward compatibility
    },
    max_execution_time_seconds=300,
)


# Export
__all__ = ["REACT_CONFIG"]
