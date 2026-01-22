"""
Knowledge Base Tools for LangChain Agents.

This module provides tools for knowledge base file operations.
These tools require runtime context (user_id, knowledge_set_id) to function.

Unlike web search which works context-free, knowledge tools are created per-agent
with the agent's knowledge_set_id bound at creation time.
"""

from __future__ import annotations

from .schemas import (
    KnowledgeHelpInput,
    KnowledgeListFilesInput,
    KnowledgeReadFileInput,
    KnowledgeSearchFilesInput,
    KnowledgeWriteFileInput,
)
from .tools import create_knowledge_tools, create_knowledge_tools_for_agent

__all__ = [
    "create_knowledge_tools",
    "create_knowledge_tools_for_agent",
    "KnowledgeListFilesInput",
    "KnowledgeReadFileInput",
    "KnowledgeWriteFileInput",
    "KnowledgeSearchFilesInput",
    "KnowledgeHelpInput",
]
