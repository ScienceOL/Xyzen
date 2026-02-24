"""
File reader tools for reading chat-attached files by file_id.

Exports:
- create_file_reader_tools() -> for registry templates (placeholders)
- create_file_reader_tools_for_agent() -> for context-bound tools (actual working tools)
"""

from app.tools.builtin.file_reader.tools import create_file_reader_tools, create_file_reader_tools_for_agent

__all__ = ["create_file_reader_tools", "create_file_reader_tools_for_agent"]
