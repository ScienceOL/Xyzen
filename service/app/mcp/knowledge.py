import io
import logging
import mimetypes
from datetime import datetime, timezone
from typing import Any, List
from uuid import UUID

from fastapi import HTTPException
from fastmcp import FastMCP
from fastmcp.server.auth import JWTVerifier, TokenVerifier
from fastmcp.server.dependencies import get_access_token
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.storage import FileCategory, FileScope, generate_storage_key, get_storage_service
from app.infra.database import AsyncSessionLocal
from app.middleware.auth import AuthProvider
from app.middleware.auth.token_verifier.bohr_app_token_verifier import BohrAppTokenVerifier
from app.models.file import FileCreate
from app.repos.file import FileRepository
from app.repos.knowledge_set import KnowledgeSetRepository

from .file_handlers import FileHandlerFactory, ReadMode

logger = logging.getLogger(__name__)

knowledge_mcp = FastMCP(name="Knowledge 🧠")

# --- Authentication Configuration ---
auth: TokenVerifier

match AuthProvider.get_provider_name():
    case "bohrium":
        auth = JWTVerifier(public_key=AuthProvider.public_key)
    case "casdoor":
        auth = JWTVerifier(jwks_uri=AuthProvider.jwks_uri)
    case "bohr_app":
        auth = BohrAppTokenVerifier(
            api_url=AuthProvider.issuer,
            x_app_key="xyzen-uuid1760783737",
        )
    case _:
        raise ValueError(f"Unsupported authentication provider: {AuthProvider.get_provider_name()}")


# --- Helper Functions ---


async def _get_current_user_id() -> str:
    """Helper to get user ID from the current context's access token."""
    access_token = get_access_token()
    if not access_token:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_info = AuthProvider.parse_user_info(access_token.claims)
    if not user_info or not user_info.id:
        raise HTTPException(status_code=401, detail="Invalid user token")

    return user_info.id


async def _get_files_in_knowledge_set(db: AsyncSession, user_id: str, knowledge_set_id: UUID) -> list[UUID]:
    """
    Gets all file IDs in a knowledge set.

    Args:
        db: Database session.
        user_id: User ID (for validation).
        knowledge_set_id: Knowledge set ID.

    Returns:
        List of file UUIDs in the knowledge set.
    """
    knowledge_set_repo = KnowledgeSetRepository(db)

    # Validate access
    try:
        await knowledge_set_repo.validate_access(user_id, knowledge_set_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Get file IDs
    file_ids = await knowledge_set_repo.get_files_in_knowledge_set(knowledge_set_id)
    return file_ids


@knowledge_mcp.tool
async def list_files(knowledge_set_id: UUID) -> dict[str, Any]:
    """
    Lists all files in the specified knowledge set.

    Args:
        knowledge_set_id: The ID of the knowledge set.
    """
    try:
        user_id = await _get_current_user_id()

        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)

            # Get files in knowledge set
            try:
                file_ids = await _get_files_in_knowledge_set(db, user_id, knowledge_set_id)
            except HTTPException as e:
                return {"error": e.detail, "success": False}

            # Fetch file objects
            files = []
            for file_id in file_ids:
                file = await file_repo.get_file_by_id(file_id)
                if file and not file.is_deleted:
                    files.append(file)

            # Format output
            entries: List[str] = []
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
        return {"error": f"Internal error: {str(e)}", "success": False}


@knowledge_mcp.tool
async def read_file(knowledge_set_id: UUID, filename: str, mode: ReadMode = "text") -> Any:
    """
    Reads the content of a file from the knowledge set.

    Args:
        knowledge_set_id: The ID of the knowledge set.
        filename: The name of the file to read.
        mode: The reading mode ("text" or "image"). Default is "text".
              Use "image" for PDFs to get pages as images (multimodal).
    """
    try:
        user_id = await _get_current_user_id()

        # Normalize filename
        filename = filename.strip("/").split("/")[-1]

        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)
            target_file = None

            try:
                file_ids = await _get_files_in_knowledge_set(db, user_id, knowledge_set_id)
            except HTTPException as e:
                return {"error": e.detail, "success": False}

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

            # Use handler to process content
            handler = FileHandlerFactory.get_handler(target_file.original_filename)

            try:
                result = handler.read_content(file_bytes, mode=mode)

                if mode == "image" and isinstance(result, list):
                    # Limit the number of images to prevent context overflow
                    MAX_IMAGES = 5
                    if len(result) > MAX_IMAGES:
                        # Return strict list of images + text description if possible
                        # FastMCP handles list of Content objects
                        # But we can't easily mix "Image" and "Text" string in a simple list return
                        # if the agent expects pure images.
                        # However, based on our tools.py implementation, we handle mixed content.
                        from typing import Union

                        from fastmcp import Image
                        from mcp.types import TextContent

                        # Cast to list of Union to allow mixed content types
                        truncated_result: List[Union[Image, TextContent]] = list(result[:MAX_IMAGES])

                        truncated_result.append(
                            TextContent(
                                type="text",
                                text=f"\n\n[Warning: Content truncated. The document has {len(result)} pages, but only the first {MAX_IMAGES} are shown to prevent context overflow. Please refine your reading strategy.]",
                            )
                        )
                        return truncated_result

                    # For image mode, return the list of images directly which FastMCP handles as multimodal
                    return result

                # For text mode, return standard dictionary response
                return {
                    "success": True,
                    "filename": target_file.original_filename,
                    "content": result,
                    "size_bytes": target_file.file_size,
                }
            except Exception as e:
                return {"error": f"Error parsing file: {str(e)}", "success": False}

    except Exception as e:
        logger.error(f"Error reading file: {e}")
        return {"error": f"Internal error: {str(e)}", "success": False}


@knowledge_mcp.tool
async def write_file(knowledge_set_id: UUID, filename: str, content: str) -> dict[str, Any]:
    """
    Creates or updates a file in the knowledge set.
    The content is text that will be converted to the target file format.

    Args:
        knowledge_set_id: The ID of the knowledge set.
        filename: The name of the file.
        content: The text content to write.
    """
    try:
        user_id = await _get_current_user_id()

        filename = filename.strip("/").split("/")[-1]

        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)
            knowledge_set_repo = KnowledgeSetRepository(db)
            storage = get_storage_service()

            try:
                file_ids = await _get_files_in_knowledge_set(db, user_id, knowledge_set_id)
            except HTTPException as e:
                return {"error": e.detail, "success": False}

            # Check if file exists in knowledge set
            existing_file = None
            for file_id in file_ids:
                file = await file_repo.get_file_by_id(file_id)
                if file and file.original_filename == filename and not file.is_deleted:
                    existing_file = file
                    break

            # Determine content type and generate file bytes using handler
            content_type, _ = mimetypes.guess_type(filename)
            if not content_type:
                # If cannot guess, default to what the handler produces or octet-stream
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
                return {"success": True, "message": f"Updated file in knowledge set: {filename}"}
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

                # Link to knowledge set
                await knowledge_set_repo.link_file_to_knowledge_set(created_file.id, knowledge_set_id)
                await db.commit()
                return {"success": True, "message": f"Created file in knowledge set: {filename}"}

    except Exception as e:
        logger.error(f"Error writing file: {e}")
        return {"error": f"Internal error: {str(e)}", "success": False}


@knowledge_mcp.tool
async def search_files(knowledge_set_id: UUID, query: str) -> dict[str, Any]:
    """
    Searches for files by name within the bound knowledge set.

    Args:
        knowledge_set_id: The ID of the knowledge set.
        query: The search term.
    """
    try:
        user_id = await _get_current_user_id()

        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)
            matches: List[str] = []

            try:
                file_ids = await _get_files_in_knowledge_set(db, user_id, knowledge_set_id)
            except HTTPException as e:
                return {"error": e.detail, "success": False}

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
        return {"error": f"Internal error: {str(e)}", "success": False}
