"""
Knowledge tool implementation functions.

Core operations for knowledge base file management.
"""

from __future__ import annotations

import io
import json
import logging
import mimetypes
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.storage import FileCategory, FileScope, generate_storage_key, get_storage_service
from app.infra.database import get_task_db_session
from app.models.file import FileCreate
from app.repos.file import FileRepository
from app.repos.knowledge_set import KnowledgeSetRepository

logger = logging.getLogger(__name__)


async def _resolve_image_ids_to_storage_urls(
    content: str,
    file_repo: FileRepository,
    user_id: str,
) -> str:
    """
    Resolve image_ids in document specs to storage:// URLs.

    This function handles the async database lookup in the async layer,
    so sync document handlers don't need to do async operations.

    Supports:
    - PresentationSpec with image_slides mode (image_slides[].image_id)
    - PresentationSpec with ImageBlocks in slides (slides[].content[].image_id)

    Args:
        content: JSON content to process
        file_repo: File repository for database lookups
        user_id: User ID for ownership verification (security check)
    """
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        # Not JSON, return as-is
        return content

    if not isinstance(data, dict):
        return content

    modified = False

    # Collect all image_ids that need resolution
    image_ids_to_resolve: set[str] = set()

    # Check for image_slides mode
    if data.get("mode") == "image_slides" and "image_slides" in data:
        for slide in data.get("image_slides", []):
            if isinstance(slide, dict) and slide.get("image_id"):
                image_ids_to_resolve.add(slide["image_id"])

    # Check for ImageBlocks in structured slides
    for slide in data.get("slides", []):
        if isinstance(slide, dict):
            for block in slide.get("content", []):
                if isinstance(block, dict) and block.get("type") == "image" and block.get("image_id"):
                    image_ids_to_resolve.add(block["image_id"])

    if not image_ids_to_resolve:
        return content

    # Resolve image_ids to storage URLs
    id_to_storage_url: dict[str, str] = {}
    for image_id in image_ids_to_resolve:
        try:
            file_uuid = UUID(image_id)
            file_record = await file_repo.get_file_by_id(file_uuid)
            if file_record and not file_record.is_deleted:
                # Security check: verify the file belongs to the current user
                if file_record.user_id != user_id:
                    logger.warning(
                        f"Image ownership mismatch: {image_id} belongs to {file_record.user_id}, not {user_id}"
                    )
                    continue
                id_to_storage_url[image_id] = f"storage://{file_record.storage_key}"
            else:
                logger.warning(f"Image not found or deleted: {image_id}")
        except ValueError:
            logger.warning(f"Invalid image_id format: {image_id}")

    # Replace image_ids with storage URLs in image_slides
    if data.get("mode") == "image_slides" and "image_slides" in data:
        for slide in data.get("image_slides", []):
            if isinstance(slide, dict) and slide.get("image_id"):
                image_id = slide["image_id"]
                if image_id in id_to_storage_url:
                    # Add storage_url field, keep image_id for reference
                    slide["storage_url"] = id_to_storage_url[image_id]
                    modified = True

    # Replace image_ids with storage URLs in structured slides
    for slide in data.get("slides", []):
        if isinstance(slide, dict):
            for block in slide.get("content", []):
                if isinstance(block, dict) and block.get("type") == "image" and block.get("image_id"):
                    image_id = block["image_id"]
                    if image_id in id_to_storage_url:
                        # Set url to storage URL, keep image_id for reference
                        block["url"] = id_to_storage_url[image_id]
                        modified = True

    if modified:
        return json.dumps(data)
    return content


async def get_files_in_knowledge_set(db: AsyncSession, user_id: str, knowledge_set_id: UUID) -> list[UUID]:
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


async def list_files(user_id: str, knowledge_set_id: UUID) -> dict[str, Any]:
    """List all files in the knowledge set."""
    try:
        async with get_task_db_session() as db:
            file_repo = FileRepository(db)

            try:
                file_ids = await get_files_in_knowledge_set(db, user_id, knowledge_set_id)
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


async def read_file(user_id: str, knowledge_set_id: UUID, filename: str) -> dict[str, Any]:
    """Read content of a file from the knowledge set."""
    from app.tools.utils.documents.handlers import FileHandlerFactory

    try:
        # Normalize filename
        filename = filename.strip("/").split("/")[-1]

        async with get_task_db_session() as db:
            file_repo = FileRepository(db)
            target_file = None

            try:
                file_ids = await get_files_in_knowledge_set(db, user_id, knowledge_set_id)
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


async def write_file(user_id: str, knowledge_set_id: UUID, filename: str, content: str) -> dict[str, Any]:
    """Create or update a file in the knowledge set."""
    from app.tools.utils.documents.handlers import FileHandlerFactory

    try:
        filename = filename.strip("/").split("/")[-1]

        async with get_task_db_session() as db:
            file_repo = FileRepository(db)
            knowledge_set_repo = KnowledgeSetRepository(db)
            storage = get_storage_service()

            try:
                file_ids = await get_files_in_knowledge_set(db, user_id, knowledge_set_id)
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

            # Resolve image_ids to storage URLs for PPTX files (async DB lookup here)
            if filename.endswith(".pptx"):
                content = await _resolve_image_ids_to_storage_urls(content, file_repo, user_id)

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


async def search_files(user_id: str, knowledge_set_id: UUID, query: str) -> dict[str, Any]:
    """Search for files by name in the knowledge set."""
    try:
        async with get_task_db_session() as db:
            file_repo = FileRepository(db)
            matches: list[str] = []

            try:
                file_ids = await get_files_in_knowledge_set(db, user_id, knowledge_set_id)
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


__all__ = [
    "get_files_in_knowledge_set",
    "list_files",
    "read_file",
    "write_file",
    "search_files",
]
