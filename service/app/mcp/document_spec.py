"""
Document Specification Schemas for Production-Ready Document Generation.

These Pydantic models define structured input formats for creating
professional PDF, DOCX, XLSX, and PPTX documents.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


# --- Content Block Types ---


class TextBlock(BaseModel):
    """A text paragraph block."""

    type: Literal["text"] = "text"
    content: str = Field(description="The text content")
    style: str = Field(
        default="normal",
        description="Text style: normal, bold, italic, code",
    )


class HeadingBlock(BaseModel):
    """A heading block with level support."""

    type: Literal["heading"] = "heading"
    content: str = Field(description="The heading text")
    level: int = Field(
        default=1,
        ge=1,
        le=6,
        description="Heading level (1-6)",
    )


class ListBlock(BaseModel):
    """A list block (bullet or numbered)."""

    type: Literal["list"] = "list"
    items: list[str] = Field(description="List items")
    ordered: bool = Field(
        default=False,
        description="True for numbered list, False for bullet list",
    )


class TableBlock(BaseModel):
    """A table block with headers and rows."""

    type: Literal["table"] = "table"
    headers: list[str] = Field(description="Column headers")
    rows: list[list[str]] = Field(description="Table rows (list of lists)")


class ImageBlock(BaseModel):
    """An image block."""

    type: Literal["image"] = "image"
    url: str = Field(description="Image URL or base64 data URL")
    caption: str | None = Field(default=None, description="Optional image caption")
    width: int | None = Field(default=None, description="Optional width in points/pixels")


class PageBreakBlock(BaseModel):
    """A page break marker."""

    type: Literal["page_break"] = "page_break"


# Union type for all content blocks
ContentBlock = Annotated[
    Union[TextBlock, HeadingBlock, ListBlock, TableBlock, ImageBlock, PageBreakBlock],
    Field(discriminator="type"),
]


# --- Document Specifications ---


class DocumentSpec(BaseModel):
    """
    Production-ready document specification for PDF and DOCX generation.

    Example:
    ```json
    {
        "title": "Sales Report Q4",
        "author": "Sales Team",
        "content": [
            {"type": "heading", "content": "Executive Summary", "level": 1},
            {"type": "text", "content": "This quarter showed strong growth..."},
            {"type": "table", "headers": ["Product", "Revenue"], "rows": [["Widget A", "$10,000"]]}
        ]
    }
    ```
    """

    title: str | None = Field(default=None, description="Document title")
    author: str | None = Field(default=None, description="Document author")
    subject: str | None = Field(default=None, description="Document subject")
    content: list[ContentBlock] = Field(
        default_factory=list,
        description="List of content blocks",
    )

    # Format-specific options
    page_size: str = Field(
        default="letter",
        description="Page size: letter, A4, legal",
    )
    margins: dict[str, float] | None = Field(
        default=None,
        description="Margins in inches: {top, bottom, left, right}",
    )


class SheetSpec(BaseModel):
    """Specification for a single spreadsheet sheet."""

    name: str = Field(default="Sheet1", description="Sheet name")
    headers: list[str] | None = Field(
        default=None,
        description="Optional column headers",
    )
    data: list[list[str | int | float | None]] = Field(
        default_factory=list,
        description="Sheet data as list of rows",
    )
    column_widths: list[int] | None = Field(
        default=None,
        description="Optional column widths in characters",
    )
    freeze_header: bool = Field(
        default=True,
        description="Freeze the header row",
    )


class SpreadsheetSpec(BaseModel):
    """
    Production-ready spreadsheet specification for XLSX generation.

    Example:
    ```json
    {
        "sheets": [
            {
                "name": "Sales Data",
                "headers": ["Product", "Q1", "Q2", "Q3", "Q4"],
                "data": [
                    ["Widget A", 100, 150, 200, 250],
                    ["Widget B", 80, 90, 110, 130]
                ],
                "freeze_header": true
            }
        ]
    }
    ```
    """

    sheets: list[SheetSpec] = Field(
        default_factory=list,
        description="List of sheet specifications",
    )


class SlideSpec(BaseModel):
    """Specification for a single presentation slide."""

    layout: str = Field(
        default="title_content",
        description="Slide layout: title, title_content, section, two_column, comparison, title_only, blank",
    )
    title: str | None = Field(default=None, description="Slide title")
    subtitle: str | None = Field(default=None, description="Slide subtitle (for title slides)")
    content: list[ContentBlock] = Field(
        default_factory=list,
        description="Slide content blocks",
    )
    notes: str | None = Field(default=None, description="Speaker notes")


class PresentationSpec(BaseModel):
    """
    Production-ready presentation specification for PPTX generation.

    Example:
    ```json
    {
        "title": "Q4 Review",
        "author": "Marketing Team",
        "slides": [
            {
                "layout": "title",
                "title": "Q4 Business Review",
                "subtitle": "January 2025"
            },
            {
                "layout": "title_content",
                "title": "Key Highlights",
                "content": [
                    {"type": "list", "items": ["Revenue up 25%", "New customers: 500+"]}
                ],
                "notes": "Emphasize the growth trajectory"
            }
        ]
    }
    ```
    """

    title: str | None = Field(default=None, description="Presentation title")
    author: str | None = Field(default=None, description="Presentation author")
    slides: list[SlideSpec] = Field(
        default_factory=list,
        description="List of slide specifications",
    )


__all__ = [
    "TextBlock",
    "HeadingBlock",
    "ListBlock",
    "TableBlock",
    "ImageBlock",
    "PageBreakBlock",
    "ContentBlock",
    "DocumentSpec",
    "SheetSpec",
    "SpreadsheetSpec",
    "SlideSpec",
    "PresentationSpec",
]
