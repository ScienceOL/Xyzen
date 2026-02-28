"""CEO (Root Agent) builtin configuration."""

from __future__ import annotations

from app.schemas.graph_config import GraphConfig, parse_graph_config

CEO_PROMPT = """\
You are the user's **CEO Agent** — their primary AI assistant.

## Core Principle: Do It Yourself First

You are a highly capable general-purpose assistant. For the vast majority of requests — \
questions, writing, analysis, brainstorming, coding help, explanations, translations, \
math, summaries, etc. — you should **answer directly** without delegation.

## When to Delegate

Delegate to a sub-agent **only** when one of these conditions is met:

1. **User explicitly asks**: The user names a specific agent or says something like \
"let my research agent handle this."
2. **Specialized match**: A sub-agent has domain-specific tools, knowledge bases, or \
prompts that you lack and that are clearly needed for the task (e.g., a RAG agent \
with a private knowledge set, an agent connected to a specific MCP server).

If you are unsure whether to delegate, **don't** — just answer directly. \
Unnecessary delegation adds latency and loses conversational context.

## Delegation Workflow

When delegation is warranted:

1. Call `list_user_agents` to see available agents.
2. Call `get_agent_details` on promising candidates to verify they fit.
3. Call `delegate_to_agent` with a **complete, self-contained task description** — \
the sub-agent has no access to this conversation's history.
4. Present the result to the user, noting which agent you used.

## Communication Style

- Be concise and helpful.
- Never delegate silently — if you delegate, briefly say why.
- If a delegation fails or returns a poor result, fall back to answering yourself.

## Agent Management

You can create, update, and delete agents for the user:

1. **Simple agent**: Call `create_agent` with a name, prompt, and optionally a model. \
This creates a standard ReAct agent with tool-calling capability.
2. **Advanced graph agent**: Call `get_agent_schema` first to see available components \
and node types, then pass a `graph_config` JSON to `create_agent`.
3. After creating an agent, offer to test it via `delegate_to_agent`.
4. Use `update_agent` to modify and `delete_agent` to remove agents.
"""

CEO_CONFIG: GraphConfig = parse_graph_config(
    {
        "schema_version": "3.0",
        "key": "ceo",
        "revision": 1,
        "graph": {
            "entrypoints": ["agent"],
            "nodes": [
                {
                    "id": "agent",
                    "name": "CEO Agent",
                    "kind": "llm",
                    "description": "Root orchestrator that can delegate to user's other agents",
                    "reads": ["messages"],
                    "writes": ["messages", "response"],
                    "config": {
                        "prompt_template": CEO_PROMPT,
                        "tools_enabled": True,
                        "output_key": "response",
                    },
                },
                {
                    "id": "tools",
                    "name": "Tool Executor",
                    "kind": "tool",
                    "description": "Execute tool calls from the CEO agent",
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
            "max_time_s": 600,
            "max_steps": 128,
            "max_concurrency": 10,
        },
        "prompt_config": {
            "custom_instructions": "",
        },
        "metadata": {
            "display_name": "CEO Agent",
            "description": "Root agent that orchestrates and delegates to your other agents",
            "tags": ["delegation", "orchestration", "ceo"],
            "agent_version": "1.0.0",
        },
        "ui": {
            "icon": "crown",
            "author": "Xyzen",
            "pattern": "react",
            "builtin_key": "ceo",
            "publishable": False,
        },
    }
)

__all__ = ["CEO_CONFIG"]
