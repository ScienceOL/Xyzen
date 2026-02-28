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
- sandbox: Isolated code execution environments
- research: Deep research workflow tools (component-internal, not exported here)
- literature: Literature search and normalization
- file_reader: Read chat-attached files by file_id
- subagent: Subagent delegation (spawn_subagent)
- scheduled_task: Scheduled task creation and management
- skill_management: Skill lifecycle management (create, update, delete, list, detail)
"""

from app.tools.builtin.fetch import create_web_fetch_tool
from app.tools.builtin.file_reader import create_file_reader_tools, create_file_reader_tools_for_agent
from app.tools.builtin.image import create_image_tools, create_image_tools_for_agent
from app.tools.builtin.knowledge import create_knowledge_tools, create_knowledge_tools_for_agent
from app.tools.builtin.literature import create_literature_search_tool
from app.tools.builtin.memory import create_memory_tools, create_memory_tools_for_agent
from app.tools.builtin.sandbox import create_sandbox_tools, create_sandbox_tools_for_session
from app.tools.builtin.search import create_web_search_tool
from app.tools.builtin.scheduled_task import create_scheduled_task_tools, create_scheduled_task_tools_for_session
from app.tools.builtin.skill_management import create_skill_management_tools, create_skill_management_tools_for_session
from app.tools.builtin.subagent import create_subagent_tool_for_session

__all__ = [
    # Search
    "create_web_search_tool",
    # Fetch
    "create_web_fetch_tool",
    # Literature
    "create_literature_search_tool",
    # Knowledge
    "create_knowledge_tools",
    "create_knowledge_tools_for_agent",
    # File Reader
    "create_file_reader_tools",
    "create_file_reader_tools_for_agent",
    # Image
    "create_image_tools",
    "create_image_tools_for_agent",
    # Memory
    "create_memory_tools",
    "create_memory_tools_for_agent",
    # Sandbox
    "create_sandbox_tools",
    "create_sandbox_tools_for_session",
    # Subagent
    "create_subagent_tool_for_session",
    # Scheduled Task
    "create_scheduled_task_tools",
    "create_scheduled_task_tools_for_session",
    # Skill Management
    "create_skill_management_tools",
    "create_skill_management_tools_for_session",
]
