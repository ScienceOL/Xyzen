"""
File reader tool implementation.

Core operations for reading files uploaded in chat by file_id.
"""

from __future__ import annotations

import io
import logging
from typing import Any
from uuid import UUID

from app.core.storage import get_storage_service
from app.infra.database import get_task_db_session
from app.repos.file import FileRepository
from app.tools.utils.pdf import get_pdf_info, parse_page_range, read_pdf_pages_image, read_pdf_pages_text

logger = logging.getLogger(__name__)


def _format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable form."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


async def read_file(
    user_id: str,
    file_id: str,
    pages: str | None = None,
    mode: str | None = None,
) -> dict[str, Any]:
    """
    Read a file by its ID.

    Args:
        user_id: User ID for access control
        file_id: UUID string of the file
        pages: Page range string for PDFs (e.g., "1-5")
        mode: "text" (default), "image", or "info"

    Returns:
        Dict with file content or metadata
    """
    mode = mode or "text"
    if mode not in ("text", "image", "info"):
        return {"error": f"Invalid mode: '{mode}'. Must be 'text', 'image', or 'info'.", "success": False}

    try:
        file_uuid = UUID(file_id)
    except ValueError:
        return {"error": f"Invalid file_id: '{file_id}'. Must be a valid UUID.", "success": False}

    try:
        async with get_task_db_session() as db:
            file_repo = FileRepository(db)
            file_record = await file_repo.get_file_by_id(file_uuid)

            if not file_record:
                return {"error": f"File '{file_id}' not found.", "success": False}

            if file_record.is_deleted:
                return {"error": f"File '{file_id}' has been deleted.", "success": False}

            # Access control: verify file belongs to this user
            if file_record.user_id != user_id:
                return {"error": "Access denied: you do not own this file.", "success": False}

            if not file_record.storage_key:
                return {"error": f"File '{file_id}' has no storage content.", "success": False}

            # mode=info: return metadata only
            if mode == "info":
                return await _read_file_info(file_record)

            # Download file content
            storage = get_storage_service()
            buffer = io.BytesIO()
            await storage.download_file(file_record.storage_key, buffer)
            file_bytes = buffer.getvalue()

            is_pdf = file_record.content_type == "application/pdf" or file_record.original_filename.lower().endswith(
                ".pdf"
            )

            if is_pdf:
                return _read_pdf(file_record, file_bytes, pages, mode)
            else:
                if pages:
                    return {
                        "error": "The 'pages' parameter is only supported for PDF files.",
                        "success": False,
                    }
                if mode == "image":
                    return {
                        "error": "mode='image' is only supported for PDF files.",
                        "success": False,
                    }
                return _read_non_pdf(file_record, file_bytes)

    except Exception as e:
        logger.error(f"Error reading file {file_id}: {e}", exc_info=True)
        return {"error": f"Internal error: {e!s}", "success": False}


async def _read_file_info(file_record: Any) -> dict[str, Any]:
    """Return file metadata without downloading content."""
    info: dict[str, Any] = {
        "success": True,
        "file_id": str(file_record.id),
        "filename": file_record.original_filename,
        "content_type": file_record.content_type,
        "size": _format_file_size(file_record.file_size),
        "size_bytes": file_record.file_size,
        "category": file_record.category,
    }

    # For PDFs, also get page count (requires downloading)
    is_pdf = file_record.content_type == "application/pdf" or file_record.original_filename.lower().endswith(".pdf")
    if is_pdf and file_record.storage_key:
        try:
            storage = get_storage_service()
            buffer = io.BytesIO()
            await storage.download_file(file_record.storage_key, buffer)
            pdf_info = get_pdf_info(buffer.getvalue())
            info["page_count"] = pdf_info["page_count"]
        except Exception as e:
            logger.warning(f"Failed to get PDF page count for {file_record.id}: {e}")

    return info


def _read_pdf(
    file_record: Any,
    file_bytes: bytes,
    pages: str | None,
    mode: str,
) -> dict[str, Any]:
    """Read PDF file with optional pagination."""
    import fitz

    MAX_DEFAULT_PAGES = 20

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    total_pages = len(doc)
    doc.close()

    # Parse page range if provided
    page_nums: list[int] | None = None
    auto_capped = False
    if pages:
        try:
            page_nums = parse_page_range(pages, total_pages)
        except ValueError as e:
            return {"error": str(e), "success": False}
    elif total_pages > MAX_DEFAULT_PAGES:
        page_nums = list(range(MAX_DEFAULT_PAGES))
        auto_capped = True

    if mode == "image":
        images = read_pdf_pages_image(file_bytes, page_nums)
        img_result: dict[str, Any] = {
            "success": True,
            "file_id": str(file_record.id),
            "filename": file_record.original_filename,
            "total_pages": total_pages,
            "pages_returned": len(images),
            "images": images,
        }
        if auto_capped:
            img_result["hint"] = (
                f"This PDF has {total_pages} pages. "
                f"Only the first {MAX_DEFAULT_PAGES} pages were returned to avoid exceeding context limits. "
                f"Use the 'pages' parameter (e.g., pages='{MAX_DEFAULT_PAGES + 1}-{min(total_pages, MAX_DEFAULT_PAGES * 2)}') to read additional pages."
            )
        return img_result
    else:
        # text mode
        content = read_pdf_pages_text(file_bytes, page_nums)
        pages_read = len(page_nums) if page_nums else total_pages
        result: dict[str, Any] = {
            "success": True,
            "file_id": str(file_record.id),
            "filename": file_record.original_filename,
            "content": content,
            "total_pages": total_pages,
            "pages_returned": pages_read,
        }
        if auto_capped:
            result["hint"] = (
                f"This PDF has {total_pages} pages. "
                f"Only the first {MAX_DEFAULT_PAGES} pages were returned to avoid exceeding context limits. "
                f"Use the 'pages' parameter (e.g., pages='{MAX_DEFAULT_PAGES + 1}-{min(total_pages, MAX_DEFAULT_PAGES * 2)}') to read additional pages."
            )
        # Hint LLM to try image mode if text extraction looks empty/poor
        elif pages_read > 0 and len(content.strip()) < pages_read * 50:
            result["hint"] = (
                "Text extraction returned very little content. "
                "This may be a scanned/image-based PDF. "
                "Try mode='image' to read pages as images instead."
            )
        return result


def _read_non_pdf(file_record: Any, file_bytes: bytes) -> dict[str, Any]:
    """Read non-PDF file using FileHandlerFactory."""
    from app.tools.utils.documents.handlers import FileHandlerFactory

    handler = FileHandlerFactory.get_handler(file_record.original_filename)

    try:
        content = handler.read_content(file_bytes, mode="text")
        return {
            "success": True,
            "file_id": str(file_record.id),
            "filename": file_record.original_filename,
            "content": content,
            "size_bytes": file_record.file_size,
        }
    except Exception as e:
        return {"error": f"Error parsing file: {e!s}", "success": False}


__all__ = ["read_file"]
