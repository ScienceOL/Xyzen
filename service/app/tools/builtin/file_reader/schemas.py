"""
Input schemas for file reader tools.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class FileReadInput(BaseModel):
    """Input schema for file_read tool."""

    file_id: str = Field(description="UUID of the file to read.")
    pages: str | None = Field(
        default=None,
        description=(
            "Page range for PDF files (e.g., '1-5', '1,3,7', '10-20'). "
            "If not specified, reads the entire file. "
            "Use mode='info' first for large files to check page count."
        ),
    )
    mode: str | None = Field(
        default=None,
        description=(
            "'text' (default): extract text content. "
            "'image': return specified pages as base64 images (for PDFs with diagrams/tables). "
            "'info': return file metadata only (size, page count, type) without reading content."
        ),
    )


__all__ = ["FileReadInput"]
