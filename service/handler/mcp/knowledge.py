import io
import logging
from datetime import datetime, timezone
from typing import Any, List, Optional
from uuid import UUID

from fastapi import HTTPException
from fastmcp import FastMCP
from fastmcp.server.auth import JWTVerifier, TokenVerifier
from fastmcp.server.dependencies import get_access_token
from sqlmodel.ext.asyncio.session import AsyncSession

from core.storage import FileCategory, FileScope, generate_storage_key, get_storage_service
from infra.database import AsyncSessionLocal
from middleware.auth import AuthProvider
from middleware.auth.token_verifier.bohr_app_token_verifier import BohrAppTokenVerifier
from models.file import FileCreate
from models.folder import FolderCreate
from repos.file import FileRepository
from repos.folder import FolderRepository

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


async def _resolve_folder_path(db: AsyncSession, user_id: str, path: str) -> Optional[UUID]:
    """
    Resolves a directory path string to a Folder UUID.
    Returns None for the root directory.
    Raises ValueError if path is invalid/not found.
    """
    path_parts = [p for p in path.strip("/").split("/") if p]
    if not path_parts:
        return None  # Root

    folder_repo = FolderRepository(db)
    current_parent_id = None

    for part in path_parts:
        # Find folder with name 'part' and current_parent_id
        folders = await folder_repo.get_folders_by_user(user_id, parent_id=current_parent_id)
        match = next((f for f in folders if f.name == part), None)

        if not match:
            raise ValueError(f"Directory not found: {part} in path {path}")

        current_parent_id = match.id

    return current_parent_id


@knowledge_mcp.tool
async def list_files(path: str = "/") -> dict[str, Any]:
    """
    Lists files and directories in the specified path.

    Args:
        path: The virtual path to list (e.g., "/" or "/Projects").
    """
    try:
        user_id = await _get_current_user_id()

        async with AsyncSessionLocal() as db:
            try:
                folder_id = await _resolve_folder_path(db, user_id, path)
            except ValueError as e:
                return {"error": str(e), "success": False}

            folder_repo = FolderRepository(db)
            file_repo = FileRepository(db)

            # Fetch contents
            folders = await folder_repo.get_folders_by_user(user_id, parent_id=folder_id)
            files = await file_repo.get_files_by_user(user_id, use_folder_filter=True, folder_id=folder_id)

            # Format output
            entries: List[str] = []
            for f in folders:
                entries.append(f"[DIR]  {f.name}/")
            for f in files:
                entries.append(f"[FILE] {f.original_filename} (ID: {f.id})")

            return {"success": True, "path": path, "entries": entries, "count": len(entries)}

    except Exception as e:
        logger.error(f"Error listing files: {e}")
        return {"error": f"Internal error: {str(e)}", "success": False}


@knowledge_mcp.tool
async def read_file(path: str) -> dict[str, Any]:
    """
    Reads the content of a file at the specified path.

    Args:
        path: The full virtual path to the file (e.g., "/Projects/notes.txt").
    """
    try:
        user_id = await _get_current_user_id()

        # Split path into dir and filename
        path = path.strip("/")
        if "/" in path:
            dir_path, filename = path.rsplit("/", 1)
        else:
            dir_path = ""
            filename = path

        async with AsyncSessionLocal() as db:
            # Resolve directory
            try:
                folder_id = await _resolve_folder_path(db, user_id, dir_path)
            except ValueError as e:
                return {"error": f"Path error: {str(e)}", "success": False}

            # Find file in directory
            file_repo = FileRepository(db)
            files = await file_repo.get_files_by_user(user_id, use_folder_filter=True, folder_id=folder_id)
            target_file = next((f for f in files if f.original_filename == filename), None)

            if not target_file:
                return {"error": f"File not found: {filename}", "success": False}

            # Download content
            storage = get_storage_service()
            buffer = io.BytesIO()
            await storage.download_file(target_file.storage_key, buffer)
            content = buffer.getvalue().decode("utf-8", errors="replace")

            return {"success": True, "filename": filename, "content": content, "size_bytes": target_file.file_size}

    except Exception as e:
        logger.error(f"Error reading file: {e}")
        return {"error": f"Internal error: {str(e)}", "success": False}


@knowledge_mcp.tool
async def write_file(path: str, content: str) -> dict[str, Any]:
    """
    Creates or overwrites a text file at the specified path.

    Args:
        path: Full path for the file (e.g., "/Docs/readme.md").
        content: The text content to write.
    """
    try:
        user_id = await _get_current_user_id()

        path = path.strip("/")
        if "/" in path:
            dir_path, filename = path.rsplit("/", 1)
        else:
            dir_path = ""
            filename = path

        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)

            # Resolve/Create directory structure?
            # Current requirement: folder must exist.
            try:
                folder_id = await _resolve_folder_path(db, user_id, dir_path)
            except ValueError:
                return {"error": f"Directory does not exist: {dir_path}. Create it first.", "success": False}

            # Check if file exists
            files = await file_repo.get_files_by_user(user_id, use_folder_filter=True, folder_id=folder_id)
            existing_file = next((f for f in files if f.original_filename == filename), None)

            storage = get_storage_service()

            if existing_file:
                # Update existing
                new_key = generate_storage_key(user_id, filename, FileScope.PRIVATE)

                # Upload
                data = io.BytesIO(content.encode("utf-8"))
                await storage.upload_file(data, new_key, content_type="text/plain")

                # Update DB directly (bypass repo update limit)
                existing_file.storage_key = new_key
                existing_file.file_size = len(content)
                existing_file.updated_at = datetime.now(timezone.utc)

                db.add(existing_file)
                await db.commit()
                return {"success": True, "message": f"Updated file: {path}"}
            else:
                # Create new
                new_key = generate_storage_key(user_id, filename, FileScope.PRIVATE)

                # Upload
                data = io.BytesIO(content.encode("utf-8"))
                await storage.upload_file(data, new_key, content_type="text/plain")

                # Create DB Record
                new_file = FileCreate(
                    user_id=user_id,
                    folder_id=folder_id,
                    original_filename=filename,
                    storage_key=new_key,
                    file_size=len(content),
                    content_type="text/plain",
                    scope=FileScope.PRIVATE,
                    category=FileCategory.DOCUMENT,
                )
                await file_repo.create_file(new_file)
                await db.commit()
                return {"success": True, "message": f"Created file: {path}"}

    except Exception as e:
        logger.error(f"Error writing file: {e}")
        return {"error": f"Internal error: {str(e)}", "success": False}


@knowledge_mcp.tool
async def create_folder(path: str) -> dict[str, Any]:
    """
    Creates a new directory.

    Args:
        path: The full path of the folder to create (e.g., "/Projects/NewFolder").
    """
    try:
        user_id = await _get_current_user_id()
        path = path.strip("/")
        if not path:
            return {"error": "Cannot create root folder", "success": False}

        if "/" in path:
            parent_path, new_folder_name = path.rsplit("/", 1)
        else:
            parent_path = ""
            new_folder_name = path

        async with AsyncSessionLocal() as db:
            folder_repo = FolderRepository(db)

            # Resolve parent
            try:
                parent_id = await _resolve_folder_path(db, user_id, parent_path)
            except ValueError:
                return {"error": f"Parent directory does not exist: {parent_path}", "success": False}

            # Check if already exists
            siblings = await folder_repo.get_folders_by_user(user_id, parent_id=parent_id)
            if any(f.name == new_folder_name for f in siblings):
                return {"error": f"Folder already exists: {path}", "success": False}

            # Create
            await folder_repo.create_folder(FolderCreate(name=new_folder_name, parent_id=parent_id), user_id)
            await db.commit()

            return {"success": True, "message": f"Created folder: {path}"}

    except Exception as e:
        logger.error(f"Error creating folder: {e}")
        return {"error": f"Internal error: {str(e)}", "success": False}


@knowledge_mcp.tool
async def search_files(query: str) -> dict[str, Any]:
    """
    Searches for files by name containing the query string.

    Args:
        query: The search term.
    """
    try:
        user_id = await _get_current_user_id()

        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)
            all_files = await file_repo.get_files_by_user(user_id, limit=1000)

            matches: List[str] = []
            folder_repo = FolderRepository(db)

            for f in all_files:
                if query.lower() in f.original_filename.lower():
                    # Resolve full path for context
                    path_str = f"/{f.original_filename}"
                    if f.folder_id:
                        folder_path_objs = await folder_repo.get_folder_path(f.folder_id)
                        # path objs is list from root to leaf
                        path_names = [fo.name for fo in folder_path_objs]
                        path_str = "/" + "/".join(path_names) + "/" + f.original_filename

                    matches.append(f"{path_str} (ID: {f.id})")

            return {"success": True, "query": query, "matches": matches, "count": len(matches)}

    except Exception as e:
        logger.error(f"Error searching files: {e}")
        return {"error": f"Internal error: {str(e)}", "success": False}
