"""
Builtin Tools Module

Provides native LangChain tools for common functionality:
- Web Search (SearXNG integration)
- Knowledge Base (file read/write/search)

These tools can be enabled per-agent via the `tool_ids` field.
"""

from app.tools.registry import BuiltinToolRegistry

__all__ = ["BuiltinToolRegistry"]
