"""
Subagent tool package.

Provides the spawn_subagent tool that allows parent agents to dynamically
delegate tasks to other agents (builtin or user-created).
"""

from app.tools.builtin.subagent.tools import create_subagent_tool_for_session

__all__ = [
    "create_subagent_tool_for_session",
]
