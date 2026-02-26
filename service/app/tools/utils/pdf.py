"""
Shared PDF pagination utilities.

Used by both file_reader and knowledge tools for paginated PDF reading.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

logger = logging.getLogger(__name__)


def parse_page_range(pages_str: str, total_pages: int) -> list[int]:
    """
    Parse a page range string into 0-indexed page numbers.

    Supports formats: "1-5", "1,3,7", "1-3,5,8-10".
    Input is 1-based (user-facing), output is 0-based (internal).

    Args:
        pages_str: Page range string (e.g., "1-5", "1,3,7")
        total_pages: Total number of pages in the document

    Returns:
        Sorted list of 0-indexed page numbers

    Raises:
        ValueError: If the page range is invalid
    """
    pages: set[int] = set()

    for part in pages_str.split(","):
        part = part.strip()
        if not part:
            continue

        if "-" in part:
            bounds = part.split("-", 1)
            try:
                start = int(bounds[0].strip())
                end = int(bounds[1].strip())
            except ValueError:
                raise ValueError(f"Invalid page range: '{part}'")

            if start < 1 or end < 1:
                raise ValueError(f"Page numbers must be >= 1, got: '{part}'")
            if start > end:
                raise ValueError(f"Invalid range: start ({start}) > end ({end})")

            # Clamp to total_pages
            end = min(end, total_pages)
            for i in range(start, end + 1):
                pages.add(i - 1)  # Convert to 0-indexed
        else:
            try:
                page_num = int(part)
            except ValueError:
                raise ValueError(f"Invalid page number: '{part}'")

            if page_num < 1:
                raise ValueError(f"Page numbers must be >= 1, got: {page_num}")
            if page_num <= total_pages:
                pages.add(page_num - 1)  # Convert to 0-indexed

    if not pages:
        raise ValueError(f"No valid pages in range '{pages_str}' (document has {total_pages} pages)")

    return sorted(pages)


def get_pdf_info(file_bytes: bytes) -> dict[str, Any]:
    """
    Get PDF metadata without reading content.

    Args:
        file_bytes: Raw PDF bytes

    Returns:
        Dict with page_count and metadata
    """
    import fitz

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    info: dict[str, Any] = {
        "page_count": len(doc),
        "metadata": doc.metadata or {},
    }
    doc.close()
    return info


def read_pdf_pages_text(file_bytes: bytes, page_nums: list[int] | None = None) -> str:
    """
    Extract text from specified PDF pages.

    Args:
        file_bytes: Raw PDF bytes
        page_nums: 0-indexed page numbers to read (None = all pages)

    Returns:
        Extracted text with page markers
    """
    import fitz

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    total = len(doc)

    if page_nums is None:
        page_nums = list(range(total))

    text_parts: list[str] = []
    for page_num in page_nums:
        if page_num < 0 or page_num >= total:
            continue
        page = doc[page_num]

        # Try table extraction first
        page_text_parts: list[str] = []
        try:
            tables = page.find_tables()
            if tables and tables.tables:
                for table in tables.tables:
                    rows = table.extract()
                    if rows:
                        lines: list[str] = []
                        for row in rows:
                            cells = [str(cell) if cell else "" for cell in row]
                            lines.append("| " + " | ".join(cells) + " |")
                        page_text_parts.append("\n".join(lines))
        except Exception:
            pass

        # Get text with layout preservation
        text: str = page.get_text("text", sort=True)  # type: ignore[attr-defined]
        if text.strip():
            page_text_parts.append(text.strip())

        if page_text_parts:
            text_parts.append(f"--- Page {page_num + 1} ---\n" + "\n\n".join(page_text_parts))

    doc.close()

    content = "\n\n".join(text_parts)

    MAX_TEXT_CHARS = 100_000
    if len(content) > MAX_TEXT_CHARS:
        content = content[:MAX_TEXT_CHARS] + (
            f"\n\n--- Content truncated at {MAX_TEXT_CHARS:,} characters ---\n"
            "The extracted text exceeded the maximum length. "
            "Use the 'pages' parameter to read specific page ranges for the full content."
        )

    return content


def read_pdf_pages_image(file_bytes: bytes, page_nums: list[int] | None = None) -> list[dict[str, Any]]:
    """
    Convert specified PDF pages to base64 PNG images.

    Args:
        file_bytes: Raw PDF bytes
        page_nums: 0-indexed page numbers to convert (None = all pages)

    Returns:
        List of dicts with base64 image data
    """
    import fitz

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    total = len(doc)

    if page_nums is None:
        page_nums = list(range(total))

    results: list[dict[str, Any]] = []
    for page_num in page_nums:
        if page_num < 0 or page_num >= total:
            continue
        page = doc[page_num]
        mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for quality
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        b64_data = base64.b64encode(img_bytes).decode("utf-8")

        results.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{b64_data}",
                    "detail": "auto",
                },
                "_metadata": {"page": page_num + 1, "total_pages": total},
            }
        )

    doc.close()
    return results


__all__ = [
    "parse_page_range",
    "get_pdf_info",
    "read_pdf_pages_text",
    "read_pdf_pages_image",
]
