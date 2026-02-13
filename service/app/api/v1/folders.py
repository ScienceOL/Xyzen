import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode, ErrCodeError, handle_auth_error
from app.core.storage import StorageServiceProto, get_storage_service
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.file import File, FileCreate, FileUpdate
from app.repos.file import FileRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["folders"])


# --- Lightweight request/response schemas for the folder API ---


class FolderCreateRequest(SQLModel):
    parent_id: UUID | None = Field(default=None, description="Parent folder ID")
    name: str = Field(min_length=1, max_length=255, description="Folder name")


class FolderReadResponse(SQLModel):
    id: UUID
    user_id: str
    parent_id: UUID | None = None
    name: str
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime


class FileTreeItem(SQLModel):
    """A single item (file or folder) in the flat tree listing."""

    id: UUID
    parent_id: UUID | None = None
    name: str
    is_dir: bool = False
    file_size: int = 0
    content_type: str | None = None
    created_at: datetime
    updated_at: datetime


class FolderUpdateRequest(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255, description="New folder name")
    parent_id: UUID | None = Field(default=None, description="New parent folder ID (move folder)")
    is_deleted: bool | None = Field(default=None, description="Soft delete flag")


def _to_folder_response(f: File) -> FolderReadResponse:
    return FolderReadResponse(
        id=f.id,
        user_id=f.user_id,
        parent_id=f.parent_id,
        name=f.original_filename,
        is_deleted=f.is_deleted,
        created_at=f.created_at,
        updated_at=f.updated_at,
    )


@router.post("/", response_model=FolderReadResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    folder_create: FolderCreateRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> FolderReadResponse:
    try:
        file_repo = FileRepository(db)

        # Verify parent folder exists and belongs to user if provided
        if folder_create.parent_id:
            parent = await file_repo.get_file_by_id(folder_create.parent_id)
            if not parent or not parent.is_dir:
                raise ErrCode.FOLDER_NOT_FOUND.with_messages("Parent folder not found")
            if parent.user_id != user_id:
                raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Parent folder access denied")

        # Check for duplicate name in parent directory
        if await file_repo.name_exists_in_parent(user_id, folder_create.parent_id, folder_create.name):
            raise ErrCode.INVALID_REQUEST.with_messages(
                f"An item named '{folder_create.name}' already exists in this folder"
            )

        file_data = FileCreate(
            user_id=user_id,
            original_filename=folder_create.name,
            parent_id=folder_create.parent_id,
            is_dir=True,
            storage_key=None,
            content_type=None,
            file_size=0,
            scope="private",
            category="others",
            status="confirmed",
        )
        folder = await file_repo.create_file(file_data)
        await db.commit()
        await db.refresh(folder)

        return _to_folder_response(folder)

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to create folder: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/", response_model=list[FolderReadResponse])
async def list_folders(
    parent_id: UUID | None = None,
    include_deleted: bool = False,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[FolderReadResponse]:
    try:
        file_repo = FileRepository(db)
        folders = await file_repo.get_children(
            user_id=user_id,
            parent_id=parent_id,
            is_dir=True,
            include_deleted=include_deleted,
        )
        return [_to_folder_response(f) for f in folders]

    except Exception as e:
        logger.error(f"Failed to list folders: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/tree", response_model=list[FileTreeItem])
async def get_folder_tree(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[FileTreeItem]:
    """
    Return a flat list of ALL folders and files for the current user.

    The frontend builds the tree structure client-side using ``parent_id``
    references.  Returning a single flat list eliminates the N+1 queries the
    old per-folder expand approach required and removes an entire class of
    cache-consistency bugs.

    Items are sorted: folders first (alphabetical), then files (alphabetical).
    Soft-deleted items are excluded.
    """
    try:
        file_repo = FileRepository(db)
        items = await file_repo.get_all_items(user_id=user_id, include_deleted=False)
        return [
            FileTreeItem(
                id=f.id,
                parent_id=f.parent_id,
                name=f.original_filename,
                is_dir=f.is_dir,
                file_size=f.file_size,
                content_type=f.content_type,
                created_at=f.created_at,
                updated_at=f.updated_at,
            )
            for f in items
        ]
    except Exception as e:
        logger.error(f"Failed to get folder tree: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{folder_id}", response_model=FolderReadResponse)
async def get_folder(
    folder_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> FolderReadResponse:
    try:
        file_repo = FileRepository(db)
        folder = await file_repo.get_file_by_id(folder_id)

        if not folder or not folder.is_dir:
            raise ErrCode.FOLDER_NOT_FOUND.with_messages("Folder not found")

        if folder.user_id != user_id:
            raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Access denied")

        return _to_folder_response(folder)

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to get folder {folder_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{folder_id}/path", response_model=list[FolderReadResponse])
async def get_folder_path(
    folder_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[FolderReadResponse]:
    try:
        file_repo = FileRepository(db)
        # Verify access to the target folder first
        target_folder = await file_repo.get_file_by_id(folder_id)
        if not target_folder or not target_folder.is_dir:
            raise ErrCode.FOLDER_NOT_FOUND.with_messages("Folder not found")
        if target_folder.user_id != user_id:
            raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Access denied")

        path = await file_repo.get_path(folder_id)
        return [_to_folder_response(f) for f in path]

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to get folder path {folder_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.patch("/{folder_id}", response_model=FolderReadResponse)
async def update_folder(
    folder_id: UUID,
    folder_update: FolderUpdateRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> FolderReadResponse:
    try:
        file_repo = FileRepository(db)
        folder = await file_repo.get_file_by_id(folder_id)

        if not folder or not folder.is_dir:
            raise ErrCode.FOLDER_NOT_FOUND.with_messages("Folder not found")

        if folder.user_id != user_id:
            raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Access denied")

        # Detect whether parent_id was explicitly sent (even as null = move to root)
        moving = "parent_id" in folder_update.model_fields_set

        # Verify new parent if moving to a non-root target
        if moving and folder_update.parent_id is not None:
            # Prevent moving to self
            if folder_update.parent_id == folder_id:
                raise ErrCode.INVALID_REQUEST.with_messages("Cannot move folder into itself")

            # Check for circular dependency (moving parent into child)
            if await file_repo.is_descendant(folder_id, folder_update.parent_id):
                raise ErrCode.INVALID_REQUEST.with_messages("Cannot move folder into its own subfolder")

            parent = await file_repo.get_file_by_id(folder_update.parent_id)
            if not parent or not parent.is_dir:
                raise ErrCode.FOLDER_NOT_FOUND.with_messages("Target parent folder not found")
            if parent.user_id != user_id:
                raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Target parent folder access denied")

        # Build FileUpdate from folder update fields
        file_update_data: dict = {}
        if folder_update.name is not None:
            # Check for duplicate name when renaming
            target_parent = folder_update.parent_id if moving else folder.parent_id
            if await file_repo.name_exists_in_parent(user_id, target_parent, folder_update.name, exclude_id=folder_id):
                raise ErrCode.INVALID_REQUEST.with_messages(
                    f"An item named '{folder_update.name}' already exists in this folder"
                )
            file_update_data["original_filename"] = folder_update.name
        if moving:
            file_update_data["parent_id"] = folder_update.parent_id
        if folder_update.is_deleted is not None:
            file_update_data["is_deleted"] = folder_update.is_deleted

        file_update = FileUpdate.model_validate(file_update_data)
        updated_folder = await file_repo.update_file(folder_id, file_update)
        if updated_folder:
            await db.commit()
            await db.refresh(updated_folder)
            return _to_folder_response(updated_folder)
        else:
            raise ErrCode.FOLDER_NOT_FOUND.with_messages("Folder not found")

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to update folder {folder_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: UUID,
    hard_delete: bool = False,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    storage: StorageServiceProto = Depends(get_storage_service),
) -> None:
    try:
        file_repo = FileRepository(db)
        folder = await file_repo.get_file_by_id(folder_id)

        if not folder or not folder.is_dir:
            raise ErrCode.FOLDER_NOT_FOUND.with_messages("Folder not found")

        if folder.user_id != user_id:
            raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Access denied")

        if hard_delete:
            storage_keys = await file_repo.hard_delete_recursive(folder_id)
            if storage_keys:
                await storage.delete_files(storage_keys)
        else:
            await file_repo.soft_delete_file(folder_id)

        await db.commit()

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to delete folder {folder_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
