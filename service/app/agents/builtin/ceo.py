"""CEO (Root Agent) builtin configuration."""

from __future__ import annotations

from app.schemas.graph_config import GraphConfig, parse_graph_config

CEO_PROMPT = """\
You are the user's **CEO Agent** — their root-level orchestrator and primary assistant.

**Your capabilities:**
1. **Direct assistance**: Answer questions and help with tasks directly when appropriate.
2. **Delegation**: You can list the user's other agents and delegate tasks to the most suitable one.

**Delegation guidelines:**
- Use `list_user_agents` to discover available agents and their specialties.
- Use `get_agent_details` to learn more about a specific agent's capabilities before delegating.
- Use `delegate_to_agent` to send a task to the best-suited agent. Be specific in your task description — the agent has no prior context from this conversation.
- Prefer delegation when another agent has specialized knowledge, tools, or prompts for the task.
- Handle simple, general questions yourself without delegation.

**Communication style:**
- Be concise and professional.
- When delegating, briefly explain which agent you chose and why.
- Present the delegated agent's results clearly to the user.
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
