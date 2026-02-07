"""ReAct builtin agent configuration ."""

from __future__ import annotations

from app.schemas.graph_config import GraphConfig, parse_graph_config

REACT_CONFIG: GraphConfig = parse_graph_config(
    {
        "schema_version": "3.0",
        "key": "react",
        "revision": 1,
        "graph": {
            "entrypoints": ["agent"],
            "nodes": [
                {
                    "id": "agent",
                    "name": "ReAct Agent",
                    "kind": "llm",
                    "description": "Reasoning + Acting agent with tool calling capability",
                    "reads": ["messages"],
                    "writes": ["messages", "response"],
                    "config": {
                        "prompt_template": "You are a helpful assistant.",
                        "tools_enabled": True,
                        "output_key": "response",
                    },
                },
                {
                    "id": "tools",
                    "name": "Tool Executor",
                    "kind": "tool",
                    "description": "Execute tool calls from the agent",
                    "reads": ["messages"],
                    "writes": ["messages", "tool_results"],
                    "config": {
                        "execute_all": True,
                    },
                },
            ],
            "edges": [
                {
                    "from_node": "agent",
                    "to_node": "tools",
                    "when": "has_tool_calls",
                },
                {
                    "from_node": "agent",
                    "to_node": "END",
                    "when": "no_tool_calls",
                },
                {
                    "from_node": "tools",
                    "to_node": "agent",
                },
            ],
        },
        "state": {"schema": {}, "reducers": {}},
        "limits": {
            "max_time_s": 300,
            "max_steps": 128,
            "max_concurrency": 10,
        },
        "prompt_config": {
            "custom_instructions": "",
        },
        "metadata": {
            "display_name": "ReAct Agent",
            "description": "Default agent with reasoning and tool-calling capability",
            "tags": ["reasoning", "tools", "react"],
            "agent_version": "2.0.0",
        },
        "ui": {
            "icon": "brain",
            "author": "Xyzen",
            "pattern": "react",
            "builtin_key": "react",
            "publishable": False,
        },
    }
)

__all__ = ["REACT_CONFIG"]
