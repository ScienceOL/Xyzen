"""
Knowledge Base Tools

LangChain tools for knowledge base file operations.
These tools require runtime context (user_id, knowledge_set_id) to function.

Unlike web search which works context-free, knowledge tools are created per-agent
with the agent's knowledge_set_id bound at creation time.
"""

from __future__ import annotations

import io
import logging
import mimetypes
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.storage import FileCategory, FileScope, generate_storage_key, get_storage_service
from app.infra.database import AsyncSessionLocal
from app.models.file import FileCreate
from app.repos.file import FileRepository
from app.repos.knowledge_set import KnowledgeSetRepository

logger = logging.getLogger(__name__)


# --- Input Schemas ---


class KnowledgeListFilesInput(BaseModel):
    """Input schema for list_files tool - no parameters needed."""

    pass


class KnowledgeReadFileInput(BaseModel):
    """Input schema for read_file tool."""

    filename: str = Field(
        description=(
            "The name of the file to read from the knowledge base. "
            "Supported formats: PDF, DOCX, XLSX, PPTX, HTML, JSON, YAML, XML, "
            "images (PNG/JPG/GIF/WEBP with OCR), and plain text files."
        )
    )


class KnowledgeWriteFileInput(BaseModel):
    """Input schema for write_file tool."""

    filename: str = Field(
        description=(
            "The name of the file to create or update. Use appropriate extensions: "
            ".txt, .md (plain text), .pdf (PDF document), .docx (Word), "
            ".xlsx (Excel), .pptx (PowerPoint), .json, .yaml, .xml, .html."
        )
    )
    content: str = Field(
        description=(
            "The content to write. Can be plain text (creates simple documents) or "
            "a JSON specification for production-quality documents:\n\n"
            "**For PDF/DOCX (DocumentSpec JSON):**\n"
            '{"title": "My Report", "author": "Name", "content": [\n'
            '  {"type": "heading", "content": "Section 1", "level": 1},\n'
            '  {"type": "text", "content": "Paragraph text here"},\n'
            '  {"type": "list", "items": ["Item 1", "Item 2"], "ordered": false},\n'
            '  {"type": "table", "headers": ["Col1", "Col2"], "rows": [["A", "B"]]},\n'
            '  {"type": "page_break"}\n'
            "]}\n\n"
            "**For XLSX (SpreadsheetSpec JSON):**\n"
            '{"sheets": [{"name": "Data", "headers": ["Name", "Value"], '
            '"data": [["A", 1], ["B", 2]], "freeze_header": true}]}\n\n'
            "**For PPTX (PresentationSpec JSON):**\n"
            '{"title": "My Presentation", "slides": [\n'
            '  {"layout": "title", "title": "Welcome", "subtitle": "Intro"},\n'
            '  {"layout": "title_content", "title": "Slide 2", '
            '"content": [{"type": "list", "items": ["Point 1", "Point 2"]}], '
            '"notes": "Speaker notes here"}\n'
            "]}"
        )
    )


class KnowledgeSearchFilesInput(BaseModel):
    """Input schema for search_files tool."""

    query: str = Field(description="Search term to find files by name.")


# --- Helper Functions ---


async def _get_files_in_knowledge_set(db: AsyncSession, user_id: str, knowledge_set_id: UUID) -> list[UUID]:
    """Get all file IDs in a knowledge set."""
    knowledge_set_repo = KnowledgeSetRepository(db)

    # Validate access
    try:
        await knowledge_set_repo.validate_access(user_id, knowledge_set_id)
    except ValueError as e:
        raise ValueError(f"Access denied: {e}")

    # Get file IDs
    file_ids = await knowledge_set_repo.get_files_in_knowledge_set(knowledge_set_id)
    return file_ids


# --- Tool Implementation Functions ---


async def _list_files(user_id: str, knowledge_set_id: UUID) -> dict[str, Any]:
    """List all files in the knowledge set."""
    try:
        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)

            try:
                file_ids = await _get_files_in_knowledge_set(db, user_id, knowledge_set_id)
            except ValueError as e:
                return {"error": str(e), "success": False}

            # Fetch file objects
            files = []
            for file_id in file_ids:
                file = await file_repo.get_file_by_id(file_id)
                if file and not file.is_deleted:
                    files.append(file)

            # Format output
            entries: list[str] = []
            for f in files:
                entries.append(f"[FILE] {f.original_filename} (ID: {f.id})")

            return {
                "success": True,
                "knowledge_set_id": str(knowledge_set_id),
                "entries": entries,
                "count": len(entries),
            }

    except Exception as e:
        logger.error(f"Error listing files: {e}")
        return {"error": f"Internal error: {e!s}", "success": False}


async def _read_file(user_id: str, knowledge_set_id: UUID, filename: str) -> dict[str, Any]:
    """Read content of a file from the knowledge set."""
    from app.mcp.file_handlers import FileHandlerFactory

    try:
        # Normalize filename
        filename = filename.strip("/").split("/")[-1]

        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)
            target_file = None

            try:
                file_ids = await _get_files_in_knowledge_set(db, user_id, knowledge_set_id)
            except ValueError as e:
                return {"error": str(e), "success": False}

            # Find file by name
            for file_id in file_ids:
                file = await file_repo.get_file_by_id(file_id)
                if file and file.original_filename == filename and not file.is_deleted:
                    target_file = file
                    break

            if not target_file:
                return {"error": f"File '{filename}' not found in knowledge set.", "success": False}

            # Download content
            storage = get_storage_service()
            buffer = io.BytesIO()
            await storage.download_file(target_file.storage_key, buffer)
            file_bytes = buffer.getvalue()

            # Use handler to process content (text mode only for LangChain tools)
            handler = FileHandlerFactory.get_handler(target_file.original_filename)

            try:
                result = handler.read_content(file_bytes, mode="text")
                return {
                    "success": True,
                    "filename": target_file.original_filename,
                    "content": result,
                    "size_bytes": target_file.file_size,
                }
            except Exception as e:
                return {"error": f"Error parsing file: {e!s}", "success": False}

    except Exception as e:
        logger.error(f"Error reading file: {e}")
        return {"error": f"Internal error: {e!s}", "success": False}


async def _write_file(user_id: str, knowledge_set_id: UUID, filename: str, content: str) -> dict[str, Any]:
    """Create or update a file in the knowledge set."""
    from app.mcp.file_handlers import FileHandlerFactory

    try:
        filename = filename.strip("/").split("/")[-1]

        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)
            knowledge_set_repo = KnowledgeSetRepository(db)
            storage = get_storage_service()

            try:
                file_ids = await _get_files_in_knowledge_set(db, user_id, knowledge_set_id)
            except ValueError as e:
                return {"error": str(e), "success": False}

            # Check if file exists
            existing_file = None
            for file_id in file_ids:
                file = await file_repo.get_file_by_id(file_id)
                if file and file.original_filename == filename and not file.is_deleted:
                    existing_file = file
                    break

            # Determine content type
            content_type, _ = mimetypes.guess_type(filename)
            if not content_type:
                if filename.endswith(".docx"):
                    content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                elif filename.endswith(".xlsx"):
                    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                elif filename.endswith(".pptx"):
                    content_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                elif filename.endswith(".pdf"):
                    content_type = "application/pdf"
                else:
                    content_type = "text/plain"

            # Use handler to create content bytes
            handler = FileHandlerFactory.get_handler(filename)
            encoded_content = handler.create_content(content)

            new_key = generate_storage_key(user_id, filename, FileScope.PRIVATE)
            data = io.BytesIO(encoded_content)
            file_size_bytes = len(encoded_content)

            await storage.upload_file(data, new_key, content_type=content_type)

            if existing_file:
                # Update existing
                existing_file.storage_key = new_key
                existing_file.file_size = file_size_bytes
                existing_file.content_type = content_type
                existing_file.updated_at = datetime.now(timezone.utc)
                db.add(existing_file)
                await db.commit()
                return {"success": True, "message": f"Updated file: {filename}"}
            else:
                # Create new and link
                new_file = FileCreate(
                    user_id=user_id,
                    folder_id=None,
                    original_filename=filename,
                    storage_key=new_key,
                    file_size=file_size_bytes,
                    content_type=content_type,
                    scope=FileScope.PRIVATE,
                    category=FileCategory.DOCUMENT,
                )
                created_file = await file_repo.create_file(new_file)
                await knowledge_set_repo.link_file_to_knowledge_set(created_file.id, knowledge_set_id)
                await db.commit()
                return {"success": True, "message": f"Created file: {filename}"}

    except Exception as e:
        logger.error(f"Error writing file: {e}")
        return {"error": f"Internal error: {e!s}", "success": False}


async def _search_files(user_id: str, knowledge_set_id: UUID, query: str) -> dict[str, Any]:
    """Search for files by name in the knowledge set."""
    try:
        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)
            matches: list[str] = []

            try:
                file_ids = await _get_files_in_knowledge_set(db, user_id, knowledge_set_id)
            except ValueError as e:
                return {"error": str(e), "success": False}

            for file_id in file_ids:
                file = await file_repo.get_file_by_id(file_id)
                if file and not file.is_deleted and query.lower() in file.original_filename.lower():
                    matches.append(f"{file.original_filename} (ID: {file.id})")

            return {
                "success": True,
                "query": query,
                "matches": matches,
                "count": len(matches),
            }

    except Exception as e:
        logger.error(f"Error searching files: {e}")
        return {"error": f"Internal error: {e!s}", "success": False}


# --- Tool Factory ---


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
            "For production-quality documents (PDF/DOCX/XLSX/PPTX), provide a JSON "
            "specification with structured content (headings, lists, tables, etc.) "
            "instead of plain text. See content field description for JSON schema examples."
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
        return await _list_files(user_id, knowledge_set_id)

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
        return await _read_file(user_id, knowledge_set_id, filename)

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
        return await _write_file(user_id, knowledge_set_id, filename, content)

    tools.append(
        StructuredTool(
            name="knowledge_write",
            description=(
                "Create or update a file in your knowledge base. "
                "Supports: PDF, DOCX, XLSX, PPTX, HTML, JSON, YAML, XML, and plain text. "
                "For production-quality documents (PDF/DOCX/XLSX/PPTX), provide a JSON "
                "specification with structured content (headings, lists, tables, etc.) "
                "instead of plain text. See content field description for JSON schema examples."
            ),
            args_schema=KnowledgeWriteFileInput,
            coroutine=write_file_bound,
        )
    )

    # Search files tool
    async def search_files_bound(query: str) -> dict[str, Any]:
        return await _search_files(user_id, knowledge_set_id, query)

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

    return tools


__all__ = [
    "create_knowledge_tools",
    "create_knowledge_tools_for_agent",
    "KnowledgeListFilesInput",
    "KnowledgeReadFileInput",
    "KnowledgeWriteFileInput",
    "KnowledgeSearchFilesInput",
]
