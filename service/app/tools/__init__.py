"""
Xyzen Tool System

This module provides the unified tool infrastructure for agents:

Public API:
- BuiltinToolRegistry: Central registry for builtin LangChain tools
- register_builtin_tools(): Called at app startup to populate registry
- prepare_tools(): Main entry point for assembling agent tools

Submodules:
- builtin/: Builtin tool implementations (search, knowledge, image, research)
- dynamic/: User-created dynamic tools (DEPRECATED)
- capabilities: Tool capability system for filtering
- registry: Tool registration and metadata

Tool Categories:
| Category   | Tools                     | UI Toggle | Auto-enabled |
|------------|---------------------------|-----------|--------------|
| search     | web_search                | Yes       | -            |
| knowledge  | knowledge_*               | No        | Yes (with knowledge_set) |
| image      | generate_image, read_image| Yes       | -            |
| research   | think, ConductResearch    | No        | Component-internal |
"""

from app.tools.registry import BuiltinToolRegistry, ToolInfo, register_builtin_tools

__all__ = [
    "BuiltinToolRegistry",
    "ToolInfo",
    "register_builtin_tools",
]
