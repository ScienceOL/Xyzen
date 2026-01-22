"""
Knowledge tool factory functions.

Creates LangChain tools for knowledge base operations.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from langchain_core.tools import BaseTool, StructuredTool

from .help_content import get_help_content
from .operations import list_files, read_file, search_files, write_file
from .schemas import (
    KnowledgeHelpInput,
    KnowledgeListFilesInput,
    KnowledgeReadFileInput,
    KnowledgeSearchFilesInput,
    KnowledgeWriteFileInput,
)


def create_knowledge_tools() -> dict[str, BaseTool]:
    """
    Create knowledge tools with placeholder implementations.

    Note: Knowledge tools require runtime context (user_id, knowledge_set_id).
    The actual tool instances are created per-agent with context bound.
    This function returns template tools for the registry.

    Returns:
        Dict mapping tool_id to BaseTool placeholder instances.
    """
    # These are placeholder tools - actual execution requires context binding
    # See create_knowledge_tools_for_agent() for runtime creation

    tools: dict[str, BaseTool] = {}

    # List files tool
    async def list_files_placeholder() -> dict[str, Any]:
        return {"error": "Knowledge tools require agent context binding", "success": False}

    tools["knowledge_list"] = StructuredTool(
        name="knowledge_list",
        description=(
            "List all files in the agent's knowledge base. Returns a list of filenames "
            "that can be read or searched. Use this first to discover available files."
        ),
        args_schema=KnowledgeListFilesInput,
        coroutine=list_files_placeholder,
    )

    # Read file tool
    async def read_file_placeholder(filename: str) -> dict[str, Any]:
        return {"error": "Knowledge tools require agent context binding", "success": False}

    tools["knowledge_read"] = StructuredTool(
        name="knowledge_read",
        description=(
            "Read the content of a file from the agent's knowledge base. "
            "Supports: PDF (text + tables), DOCX (text + tables), XLSX (all sheets), "
            "PPTX (text + speaker notes), HTML (text extraction), JSON/YAML/XML (formatted), "
            "images (OCR text extraction from PNG/JPG/GIF/WEBP), and plain text files. "
            "Use knowledge_list first to see available files."
        ),
        args_schema=KnowledgeReadFileInput,
        coroutine=read_file_placeholder,
    )

    # Write file tool
    async def write_file_placeholder(filename: str, content: str) -> dict[str, Any]:
        return {"error": "Knowledge tools require agent context binding", "success": False}

    tools["knowledge_write"] = StructuredTool(
        name="knowledge_write",
        description=(
            "Create or update a file in the agent's knowledge base. "
            "Supports: PDF, DOCX, XLSX, PPTX, HTML, JSON, YAML, XML, and plain text. "
            "For rich documents with images, tables, and formatting, provide a JSON specification. "
            "Use knowledge_help with topic='pptx' or 'pdf' for detailed examples. "
            "For beautiful AI-generated presentations: use generate_image to create slide images, "
            "then use knowledge_write with mode='image_slides' and the image_id values. "
            "Call knowledge_help(topic='image_slides') for the complete workflow."
        ),
        args_schema=KnowledgeWriteFileInput,
        coroutine=write_file_placeholder,
    )

    # Search files tool
    async def search_files_placeholder(query: str) -> dict[str, Any]:
        return {"error": "Knowledge tools require agent context binding", "success": False}

    tools["knowledge_search"] = StructuredTool(
        name="knowledge_search",
        description=(
            "Search for files by name in the agent's knowledge base. Returns matching filenames that can then be read."
        ),
        args_schema=KnowledgeSearchFilesInput,
        coroutine=search_files_placeholder,
    )

    # Help tool
    async def help_placeholder(topic: str | None = None) -> dict[str, Any]:
        return get_help_content(topic)

    tools["knowledge_help"] = StructuredTool(
        name="knowledge_help",
        description=(
            "Get detailed help and examples for using knowledge tools. "
            "Call without arguments for overview, or with topic='pptx', 'pdf', 'xlsx', "
            "'images', 'tables', 'image_slides', or 'all' for specific guides with JSON examples."
        ),
        args_schema=KnowledgeHelpInput,
        coroutine=help_placeholder,
    )

    return tools


def create_knowledge_tools_for_agent(user_id: str, knowledge_set_id: UUID) -> list[BaseTool]:
    """
    Create knowledge tools bound to a specific agent's context.

    This creates actual working tools with user_id and knowledge_set_id
    captured in closures.

    Args:
        user_id: The user ID for access control
        knowledge_set_id: The knowledge set ID to operate on

    Returns:
        List of BaseTool instances with context bound
    """
    tools: list[BaseTool] = []

    # List files tool
    async def list_files_bound() -> dict[str, Any]:
        return await list_files(user_id, knowledge_set_id)

    tools.append(
        StructuredTool(
            name="knowledge_list",
            description=(
                "List all files in your knowledge base. Returns filenames that can be read or searched. "
                "Use this first to discover available files."
            ),
            args_schema=KnowledgeListFilesInput,
            coroutine=list_files_bound,
        )
    )

    # Read file tool
    async def read_file_bound(filename: str) -> dict[str, Any]:
        return await read_file(user_id, knowledge_set_id, filename)

    tools.append(
        StructuredTool(
            name="knowledge_read",
            description=(
                "Read the content of a file from your knowledge base. "
                "Supports: PDF (text + tables), DOCX (text + tables), XLSX (all sheets), "
                "PPTX (text + speaker notes), HTML (text extraction), JSON/YAML/XML (formatted), "
                "images (OCR text extraction from PNG/JPG/GIF/WEBP), and plain text files. "
                "Use knowledge_list first to see available files."
            ),
            args_schema=KnowledgeReadFileInput,
            coroutine=read_file_bound,
        )
    )

    # Write file tool
    async def write_file_bound(filename: str, content: str) -> dict[str, Any]:
        return await write_file(user_id, knowledge_set_id, filename, content)

    tools.append(
        StructuredTool(
            name="knowledge_write",
            description=(
                "Create or update a file in your knowledge base. "
                "Supports: PDF, DOCX, XLSX, PPTX, HTML, JSON, YAML, XML, and plain text. "
                "For rich documents with images, tables, and formatting, provide a JSON specification. "
                "Use knowledge_help with topic='pptx' or 'pdf' for detailed examples. "
                "For beautiful AI-generated presentations: use generate_image to create slide images, "
                "then use knowledge_write with mode='image_slides' and the image_id values. "
                "Call knowledge_help(topic='image_slides') for the complete workflow."
            ),
            args_schema=KnowledgeWriteFileInput,
            coroutine=write_file_bound,
        )
    )

    # Search files tool
    async def search_files_bound(query: str) -> dict[str, Any]:
        return await search_files(user_id, knowledge_set_id, query)

    tools.append(
        StructuredTool(
            name="knowledge_search",
            description=(
                "Search for files by name in your knowledge base. Returns matching filenames that can then be read."
            ),
            args_schema=KnowledgeSearchFilesInput,
            coroutine=search_files_bound,
        )
    )

    # Help tool (no context needed - static content)
    async def help_bound(topic: str | None = None) -> dict[str, Any]:
        return get_help_content(topic)

    tools.append(
        StructuredTool(
            name="knowledge_help",
            description=(
                "Get detailed help and examples for using knowledge tools. "
                "Call without arguments for overview, or with topic='pptx', 'pdf', 'xlsx', "
                "'images', 'tables', 'image_slides', or 'all' for specific guides with JSON examples."
            ),
            args_schema=KnowledgeHelpInput,
            coroutine=help_bound,
        )
    )

    return tools


__all__ = [
    "create_knowledge_tools",
    "create_knowledge_tools_for_agent",
]
