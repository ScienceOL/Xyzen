"""
Builtin tool implementations.

Each file exports:
- create_X_tools() -> for registry templates (placeholders)
- create_X_tools_for_agent() -> for context-bound tools (actual working tools)

Tool Categories:
- search: Web search via SearXNG
- knowledge: Knowledge base file operations
- image: Image generation and analysis
- memory: Conversation history search (disabled)
- research: Deep research workflow tools (component-internal, not exported here)
"""

from app.tools.builtin.fetch import create_web_fetch_tool
from app.tools.builtin.image import create_image_tools, create_image_tools_for_agent
from app.tools.builtin.knowledge import create_knowledge_tools, create_knowledge_tools_for_agent
from app.tools.builtin.memory import create_memory_tools, create_memory_tools_for_agent
from app.tools.builtin.search import create_web_search_tool

__all__ = [
    # Search
    "create_web_search_tool",
    # Fetch
    "create_web_fetch_tool",
    # Knowledge
    "create_knowledge_tools",
    "create_knowledge_tools_for_agent",
    # Image
    "create_image_tools",
    "create_image_tools_for_agent",
    # Memory
    "create_memory_tools",
    "create_memory_tools_for_agent",
]
