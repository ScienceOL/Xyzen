"""
File reader tool factory functions.

Creates LangChain tools for reading chat-attached files by file_id.
"""

from __future__ import annotations

from typing import Any

from langchain_core.tools import BaseTool, StructuredTool

from .operations import read_file
from .schemas import FileReadInput


def create_file_reader_tools() -> dict[str, BaseTool]:
    """
    Create file reader tools with placeholder implementations.

    Returns placeholder tools for the registry. Actual execution
    requires context binding via create_file_reader_tools_for_agent().

    Returns:
        Dict mapping tool_id to BaseTool placeholder instances.
    """

    async def read_file_placeholder(file_id: str, pages: str | None = None, mode: str | None = None) -> dict[str, Any]:
        return {"error": "File reader tools require agent context binding", "success": False}

    return {
        "file_read": StructuredTool(
            name="file_read",
            description=(
                "Read a file uploaded in the conversation by its file_id. "
                "Supports PDF (text extraction with pagination, or page-to-image), "
                "DOCX, XLSX, PPTX, HTML, JSON/YAML/XML, and plain text. "
                "Use mode='info' to check file metadata before reading large files. "
                "Use pages='1-5' to read specific pages of PDFs."
            ),
            args_schema=FileReadInput,
            coroutine=read_file_placeholder,
        )
    }


def create_file_reader_tools_for_agent(user_id: str) -> list[BaseTool]:
    """
    Create file reader tools bound to a specific user's context.

    Args:
        user_id: The user ID for access control

    Returns:
        List of BaseTool instances with context bound
    """

    async def read_file_bound(file_id: str, pages: str | None = None, mode: str | None = None) -> dict[str, Any]:
        return await read_file(user_id, file_id, pages=pages, mode=mode)

    return [
        StructuredTool(
            name="file_read",
            description=(
                "Read a file uploaded in the conversation by its file_id. "
                "Supports PDF (text extraction with pagination, or page-to-image), "
                "DOCX, XLSX, PPTX, HTML, JSON/YAML/XML, and plain text. "
                "Use mode='info' to check file metadata before reading large files. "
                "Use pages='1-5' to read specific pages of PDFs."
            ),
            args_schema=FileReadInput,
            coroutine=read_file_bound,
        )
    ]


__all__ = [
    "create_file_reader_tools",
    "create_file_reader_tools_for_agent",
]
