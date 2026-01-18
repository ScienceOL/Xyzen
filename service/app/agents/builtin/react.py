"""
ReAct Agent - Default tool-calling agent configuration.

This module provides the GraphConfig for the ReAct (Reasoning + Acting) agent,
which is the default agent used when no agent is specified in a chat session.

The ReAct pattern consists of:
1. An LLM node that reasons about tasks and decides whether to use tools
2. A tool node that executes any requested tool calls
3. Conditional routing based on whether tool calls are present

This config uses the stdlib:react component, which implements the ReAct
pattern using LangGraph's prebuilt ToolNode and tools_condition.
"""

from __future__ import annotations

from app.schemas.graph_config import (
    ComponentNodeConfig,
    ComponentReference,
    GraphConfig,
    GraphEdgeConfig,
    GraphNodeConfig,
    NodeType,
)

# ReAct Agent configuration using stdlib:react component
REACT_CONFIG = GraphConfig(
    version="2.0",
    nodes=[
        GraphNodeConfig(
            id="agent",
            name="ReAct Agent",
            type=NodeType.COMPONENT,
            description="Reasoning + Acting agent with tool calling capability",
            component_config=ComponentNodeConfig(
                component_ref=ComponentReference(
                    key="react",
                    version="^1.0",
                ),
                # Default config - can be overridden at runtime
                config_overrides={
                    "system_prompt": "You are a helpful assistant.",
                    "max_iterations": 10,
                },
            ),
            tags=["reasoning", "tools", "react"],
        ),
    ],
    edges=[
        GraphEdgeConfig(from_node="START", to_node="agent"),
        GraphEdgeConfig(from_node="agent", to_node="END"),
    ],
    entry_point="agent",
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
