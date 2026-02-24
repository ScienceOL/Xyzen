"""
Knowledge tool implementation functions.

Core operations for knowledge base file management.
"""

from __future__ import annotations

import base64
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
from app.models.file import File, FileCreate
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
            if file_record and not file_record.is_deleted and file_record.storage_key:
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


async def _validate_knowledge_set_access(db: AsyncSession, user_id: str, knowledge_set_id: UUID) -> None:
    """Validate that the user has access to the knowledge set. Raises ValueError on failure."""
    knowledge_set_repo = KnowledgeSetRepository(db)
    try:
        await knowledge_set_repo.validate_access(user_id, knowledge_set_id)
    except ValueError as e:
        raise ValueError(f"Access denied: {e}")


async def get_files_in_knowledge_set(db: AsyncSession, user_id: str, knowledge_set_id: UUID) -> list[UUID]:
    """Get all file IDs in a knowledge set."""
    await _validate_knowledge_set_access(db, user_id, knowledge_set_id)
    knowledge_set_repo = KnowledgeSetRepository(db)
    file_ids = await knowledge_set_repo.get_files_in_knowledge_set(knowledge_set_id)
    return file_ids


async def _build_path_map(db: AsyncSession, user_id: str, knowledge_set_id: UUID) -> dict[UUID, tuple[File, str]]:
    """
    Fetch all items in a knowledge set and compute full paths.
    Returns {item_id: (file_obj, "folder/subfolder/filename")}.
    """
    file_repo = FileRepository(db)
    items = await file_repo.get_all_items(user_id, knowledge_set_id=knowledge_set_id)

    id_to_item: dict[UUID, File] = {item.id: item for item in items}

    def compute_path(item: File) -> str:
        parts: list[str] = []
        current: File | None = item
        while current:
            parts.append(current.original_filename)
            current = id_to_item.get(current.parent_id) if current.parent_id else None
        parts.reverse()
        return "/".join(parts)

    return {item.id: (item, compute_path(item)) for item in items}


def _find_file(path_map: dict[UUID, tuple[File, str]], filename: str) -> File | list[str] | None:
    """
    Find a file in the path map by exact path or unambiguous basename.
    Returns: File on success, list of candidate paths if ambiguous, None if not found.
    """
    filename = filename.strip("/")
    basename = filename.split("/")[-1]

    # 1. Exact full-path match
    for file_obj, path in path_map.values():
        if not file_obj.is_dir and path == filename:
            return file_obj

    # 2. Basename match (fallback)
    candidates: list[tuple[File, str]] = []
    for file_obj, path in path_map.values():
        if not file_obj.is_dir and file_obj.original_filename == basename:
            candidates.append((file_obj, path))

    if len(candidates) == 1:
        return candidates[0][0]
    if len(candidates) > 1:
        return [path for _, path in candidates]
    return None


async def list_files(user_id: str, knowledge_set_id: UUID) -> dict[str, Any]:
    """List all files in the knowledge set."""
    try:
        async with get_task_db_session() as db:
            try:
                await _validate_knowledge_set_access(db, user_id, knowledge_set_id)
            except ValueError as e:
                return {"error": str(e), "success": False}

            path_map = await _build_path_map(db, user_id, knowledge_set_id)

            # Format output with full paths
            entries: list[str] = []
            for file_obj, path in path_map.values():
                if file_obj.is_dir:
                    entries.append(f"[DIR] {path}/")
                else:
                    entries.append(f"[FILE] {path}")

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
        async with get_task_db_session() as db:
            try:
                await _validate_knowledge_set_access(db, user_id, knowledge_set_id)
            except ValueError as e:
                return {"error": str(e), "success": False}

            path_map = await _build_path_map(db, user_id, knowledge_set_id)
            result = _find_file(path_map, filename)

            if result is None:
                return {"error": f"File '{filename}' not found in knowledge set.", "success": False}
            if isinstance(result, list):
                paths = ", ".join(result)
                return {
                    "error": f"Ambiguous filename '{filename}'. Multiple files match: {paths}. Please specify the full path.",
                    "success": False,
                }

            target_file = result

            if not target_file.storage_key:
                return {"error": f"File '{filename}' has no storage key (directory entry).", "success": False}

            # Download content
            storage = get_storage_service()
            buffer = io.BytesIO()
            await storage.download_file(target_file.storage_key, buffer)
            file_bytes = buffer.getvalue()

            # For image files, return base64-encoded content for LLM vision
            image_extensions = (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp")
            if target_file.original_filename.lower().endswith(image_extensions):
                content_type, _ = mimetypes.guess_type(target_file.original_filename)
                if not content_type:
                    content_type = "image/png"
                b64_data = base64.b64encode(file_bytes).decode("utf-8")
                return {
                    "success": True,
                    "filename": target_file.original_filename,
                    "content": f"![{target_file.original_filename}](data:{content_type};base64,{b64_data})",
                    "size_bytes": target_file.file_size,
                }

            # Use handler to process content (text mode for non-image files)
            handler = FileHandlerFactory.get_handler(target_file.original_filename)

            try:
                content = handler.read_content(file_bytes, mode="text")
                return {
                    "success": True,
                    "filename": target_file.original_filename,
                    "content": content,
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
        filename = filename.strip("/")
        basename = filename.split("/")[-1]

        async with get_task_db_session() as db:
            file_repo = FileRepository(db)
            knowledge_set_repo = KnowledgeSetRepository(db)
            storage = get_storage_service()

            try:
                await _validate_knowledge_set_access(db, user_id, knowledge_set_id)
            except ValueError as e:
                return {"error": str(e), "success": False}

            path_map = await _build_path_map(db, user_id, knowledge_set_id)

            # Check if file exists by path
            result = _find_file(path_map, filename)
            existing_file = None
            if isinstance(result, list):
                paths = ", ".join(result)
                return {
                    "error": f"Ambiguous filename '{filename}'. Multiple files match: {paths}. Please specify the full path.",
                    "success": False,
                }
            if isinstance(result, File):
                existing_file = result

            # Determine content type
            content_type, _ = mimetypes.guess_type(basename)
            if not content_type:
                if basename.endswith(".docx"):
                    content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                elif basename.endswith(".xlsx"):
                    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                elif basename.endswith(".pptx"):
                    content_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                elif basename.endswith(".pdf"):
                    content_type = "application/pdf"
                else:
                    content_type = "text/plain"

            # Resolve image_ids to storage URLs for PPTX files (async DB lookup here)
            if basename.endswith(".pptx"):
                content = await _resolve_image_ids_to_storage_urls(content, file_repo, user_id)

            # Use handler to create content bytes
            handler = FileHandlerFactory.get_handler(basename)
            encoded_content = handler.create_content(content)

            new_key = generate_storage_key(user_id, basename, FileScope.PRIVATE)
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
                # Resolve parent folder for new file
                parent_id: UUID | None = None
                path_parts = filename.split("/")

                if len(path_parts) > 1:
                    # Need to find or create parent folders
                    folder_parts = path_parts[:-1]

                    # Build a lookup of existing folder paths to their IDs
                    folder_path_to_id: dict[str, UUID] = {}
                    for file_obj, path in path_map.values():
                        if file_obj.is_dir:
                            folder_path_to_id[path] = file_obj.id

                    current_parent_id: UUID | None = None
                    for i, folder_name in enumerate(folder_parts):
                        folder_path = "/".join(folder_parts[: i + 1])
                        if folder_path in folder_path_to_id:
                            current_parent_id = folder_path_to_id[folder_path]
                        else:
                            # Create missing folder
                            folder_create = FileCreate(
                                user_id=user_id,
                                parent_id=current_parent_id,
                                original_filename=folder_name,
                                storage_key=None,
                                file_size=0,
                                content_type=None,
                                scope=FileScope.PRIVATE,
                                category=FileCategory.DOCUMENT,
                                is_dir=True,
                            )
                            created_folder = await file_repo.create_file(folder_create)
                            await knowledge_set_repo.link_file_to_knowledge_set(created_folder.id, knowledge_set_id)
                            current_parent_id = created_folder.id
                            folder_path_to_id[folder_path] = created_folder.id

                    parent_id = current_parent_id

                # Create new file and link
                new_file = FileCreate(
                    user_id=user_id,
                    parent_id=parent_id,
                    original_filename=basename,
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
            try:
                await _validate_knowledge_set_access(db, user_id, knowledge_set_id)
            except ValueError as e:
                return {"error": str(e), "success": False}

            path_map = await _build_path_map(db, user_id, knowledge_set_id)
            query_lower = query.lower()

            matches: list[str] = []
            for file_obj, path in path_map.values():
                if not file_obj.is_dir and query_lower in path.lower():
                    matches.append(path)

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
