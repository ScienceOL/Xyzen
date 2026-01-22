"""
Input schemas for knowledge tools.

Pydantic models defining the input parameters for each knowledge tool.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


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
            "**For PPTX (PresentationSpec JSON) - Structured mode:**\n"
            '{"title": "My Presentation", "slides": [\n'
            '  {"layout": "title", "title": "Welcome", "subtitle": "Intro"},\n'
            '  {"layout": "title_content", "title": "Slide 2", '
            '"content": [{"type": "list", "items": ["Point 1", "Point 2"]}], '
            '"notes": "Speaker notes here"}\n'
            "]}\n\n"
            "**For PPTX - AI-generated image slides mode:**\n"
            '{"mode": "image_slides", "title": "My Presentation", '
            '"image_slides": [\n'
            '  {"image_id": "<uuid-from-generate_image>", "notes": "Speaker notes"}\n'
            "]}"
        )
    )


class KnowledgeSearchFilesInput(BaseModel):
    """Input schema for search_files tool."""

    query: str = Field(description="Search term to find files by name.")


class KnowledgeHelpInput(BaseModel):
    """Input schema for knowledge_help tool."""

    topic: str | None = Field(
        default=None,
        description=(
            "Optional topic to get help for. Options: 'pptx', 'pdf', 'docx', 'xlsx', "
            "'images', 'tables', 'image_slides', 'all'. If not specified, returns overview."
        ),
    )


__all__ = [
    "KnowledgeListFilesInput",
    "KnowledgeReadFileInput",
    "KnowledgeWriteFileInput",
    "KnowledgeSearchFilesInput",
    "KnowledgeHelpInput",
]
