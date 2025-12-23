"""
File processor for converting various file types to LLM-compatible formats.

Handles:
- Images: base64 encoding for vision models
- PDFs: conversion to images then base64
- Audio: base64 encoding (for models that support audio)
- Documents: text extraction

Designed to be extensible for future file types.
"""

import base64
import logging
from io import BytesIO
from typing import Any, Literal
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# File category types
FileCategory = Literal["images", "documents", "audio", "others"]

# Content types for multimodal messages
ContentType = Literal["text", "image_url", "audio_url", "document"]


class FileProcessor:
    """Process files for multimodal LLM consumption."""

    def __init__(self, db: AsyncSession):
        """
        Initialize file processor.

        Args:
            db: Database session for querying file records
        """
        self.db = db

    async def get_file_content(self, file_id: UUID) -> tuple[bytes, str, str]:
        """
        Fetch file content from storage.

        Args:
            file_id: UUID of the file

        Returns:
            Tuple of (file_bytes, content_type, category)

        Raises:
            ValueError: If file not found or cannot be accessed
        """
        from app.core.storage import get_storage_service
        from app.repos.file import FileRepository

        file_repo = FileRepository(self.db)
        file_record = await file_repo.get_file_by_id(file_id)

        if not file_record:
            raise ValueError(f"File {file_id} not found")

        if file_record.is_deleted:
            raise ValueError(f"File {file_id} is deleted")

        # Get storage service and download file to BytesIO
        storage = get_storage_service()
        buffer = BytesIO()
        await storage.download_file(file_record.storage_key, buffer)
        buffer.seek(0)  # Reset position to beginning
        file_bytes = buffer.read()

        return file_bytes, file_record.content_type, file_record.category

    async def process_image(self, file_content: bytes, content_type: str) -> dict[str, Any]:
        """
        Process image file to base64 format.

        Args:
            file_content: Raw image bytes
            content_type: MIME type of the image

        Returns:
            Dict with type and image_url for LLM consumption
        """
        try:
            # Encode image to base64
            base64_image = base64.b64encode(file_content).decode("utf-8")

            # Return in OpenAI vision format (also compatible with Anthropic, Google)
            return {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{content_type};base64,{base64_image}",
                    "detail": "auto",  # OpenAI specific: auto, low, or high
                },
            }
        except Exception as e:
            logger.error(f"Failed to process image: {e}")
            raise ValueError(f"Image processing failed: {e}")

    async def process_pdf(self, file_content: bytes) -> list[dict[str, Any]]:
        """
        Process PDF by converting pages to images then base64.
        Uses PyMuPDF (fitz) which has no external dependencies.

        Args:
            file_content: Raw PDF bytes

        Returns:
            List of image_url dicts, one per page
        """
        try:
            # Import PyMuPDF (pure Python, no system dependencies)
            import fitz  # PyMuPDF

            # Open PDF from bytes
            pdf_document = fitz.open(stream=file_content, filetype="pdf")

            result = []
            for page_num in range(len(pdf_document)):
                # Get page
                page = pdf_document[page_num]

                # Render page to image (pixmap) at 2x resolution for better quality
                mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better quality
                pix = page.get_pixmap(matrix=mat)

                # Convert pixmap to PNG bytes
                img_bytes = pix.tobytes("png")

                # Encode to base64
                base64_image = base64.b64encode(img_bytes).decode("utf-8")

                result.append(
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_image}",
                            "detail": "auto",
                        },
                        "_metadata": {"page": page_num + 1, "total_pages": len(pdf_document)},
                    }
                )

            pdf_document.close()
            logger.info(f"Converted PDF to {len(result)} images using PyMuPDF")
            return result

        except ImportError:
            logger.error("PyMuPDF not installed. Install with: uv add pymupdf")
            raise ValueError("PDF processing not available: PyMuPDF not installed")
        except Exception as e:
            logger.error(f"Failed to process PDF: {e}")
            raise ValueError(f"PDF processing failed: {e}")

    async def process_audio(self, file_content: bytes, content_type: str) -> dict[str, Any]:
        """
        Process audio file to base64 format.

        Note: Audio support varies by LLM provider.
        OpenAI Whisper uses a separate API, while some multimodal models
        may accept base64 audio directly.

        Args:
            file_content: Raw audio bytes
            content_type: MIME type of the audio

        Returns:
            Dict with audio data
        """
        try:
            # Encode audio to base64
            base64_audio = base64.b64encode(file_content).decode("utf-8")

            # Return in a generic format (provider-specific handling may be needed)
            return {
                "type": "audio_url",
                "audio_url": {
                    "url": f"data:{content_type};base64,{base64_audio}",
                },
            }
        except Exception as e:
            logger.error(f"Failed to process audio: {e}")
            raise ValueError(f"Audio processing failed: {e}")

    async def process_document(self, file_content: bytes, content_type: str) -> dict[str, Any]:
        """
        Process text document by extracting text content.

        Args:
            file_content: Raw document bytes
            content_type: MIME type of the document

        Returns:
            Dict with extracted text
        """
        try:
            # For plain text files
            if "text/" in content_type:
                text = file_content.decode("utf-8")
                return {"type": "text", "text": text}

            # For other document types, you could add more processors here
            # (e.g., python-docx for .docx, openpyxl for .xlsx)
            logger.warning(f"Unsupported document type: {content_type}")
            return {
                "type": "text",
                "text": f"[Unsupported document type: {content_type}]",
            }

        except Exception as e:
            logger.error(f"Failed to process document: {e}")
            raise ValueError(f"Document processing failed: {e}")

    async def process_file(self, file_id: UUID) -> list[dict[str, Any]]:
        """
        Process a single file and convert to LLM-compatible format.

        This is the main entry point for file processing.

        Args:
            file_id: UUID of the file to process

        Returns:
            List of content dicts (may be multiple for PDFs with multiple pages)

        Raises:
            ValueError: If file cannot be processed
        """
        try:
            # Get file content
            file_content, content_type, category = await self.get_file_content(file_id)

            logger.info(f"Processing file {file_id}: category={category}, type={content_type}")

            # Process based on category
            if category == "images":
                return [await self.process_image(file_content, content_type)]

            elif category == "documents":
                # Special handling for PDFs
                if content_type == "application/pdf":
                    return await self.process_pdf(file_content)
                else:
                    return [await self.process_document(file_content, content_type)]

            elif category == "audio":
                return [await self.process_audio(file_content, content_type)]

            else:
                # Unknown category - try to handle as text
                logger.warning(f"Unknown file category: {category}")
                return [await self.process_document(file_content, content_type)]

        except ValueError:
            # Re-raise ValueError (already logged)
            raise
        except Exception as e:
            logger.error(f"Unexpected error processing file {file_id}: {e}", exc_info=True)
            raise ValueError(f"File processing failed: {e}")


async def process_message_files(db: AsyncSession, message_id: UUID) -> list[dict[str, Any]]:
    """
    Process all files attached to a message.

    This is a convenience function that processes all files for a message
    and returns them as a list of content objects suitable for LLM consumption.

    Args:
        db: Database session
        message_id: UUID of the message with attachments

    Returns:
        List of content dicts for all files (flattened, may include multiple
        items per file for multi-page PDFs)

    Usage:
        file_contents = await process_message_files(db, message.id)
        # Construct multimodal message:
        # [
        #   {"type": "text", "text": user_message_text},
        #   *file_contents  # Spread file contents into message
        # ]
    """
    from app.repos.file import FileRepository

    file_repo = FileRepository(db)
    files = await file_repo.get_files_by_message(message_id)

    if not files:
        return []

    processor = FileProcessor(db)
    all_content = []

    for file in files:
        try:
            file_content = await processor.process_file(file.id)
            all_content.extend(file_content)
            logger.info(f"Processed file {file.id} ({file.original_filename}): {len(file_content)} content items")
        except Exception as e:
            # Log error but continue processing other files
            logger.error(f"Failed to process file {file.id}: {e}")
            # Add error placeholder
            all_content.append(
                {
                    "type": "text",
                    "text": f"[Failed to process attachment: {file.original_filename}]",
                }
            )

    logger.info(f"Processed {len(files)} files for message {message_id}: {len(all_content)} total content items")
    return all_content
