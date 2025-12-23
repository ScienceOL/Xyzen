import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode, ErrCodeError, handle_auth_error
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.folder import FolderCreate, FolderRead, FolderUpdate
from app.repos.folder import FolderRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["folders"])


@router.post("/", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
async def create_folder(
    folder_create: FolderCreate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> FolderRead:
    """
    Create a new folder.

    Args:
        folder_create: Folder creation data
        user_id: Authenticated user ID
        db: Database session

    Returns:
        FolderRead: Created folder
    """
    try:
        folder_repo = FolderRepository(db)

        # Verify parent folder exists and belongs to user if provided
        if folder_create.parent_id:
            parent = await folder_repo.get_folder_by_id(folder_create.parent_id)
            if not parent:
                raise ErrCode.FOLDER_NOT_FOUND.with_messages("Parent folder not found")
            if parent.user_id != user_id:
                raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Parent folder access denied")

        folder = await folder_repo.create_folder(folder_create, user_id)
        await db.commit()
        await db.refresh(folder)

        return FolderRead(**folder.model_dump())

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to create folder: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/", response_model=list[FolderRead])
async def list_folders(
    parent_id: UUID | None = None,
    include_deleted: bool = False,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[FolderRead]:
    """
    List folders for the current user.

    Args:
        parent_id: Filter by parent folder ID (None for root)
        include_deleted: Whether to include soft-deleted folders
        user_id: Authenticated user ID
        db: Database session

    Returns:
        list[FolderRead]: List of folders
    """
    try:
        folder_repo = FolderRepository(db)
        folders = await folder_repo.get_folders_by_user(
            user_id=user_id,
            parent_id=parent_id,
            include_deleted=include_deleted,
        )
        return [FolderRead(**f.model_dump()) for f in folders]

    except Exception as e:
        logger.error(f"Failed to list folders: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{folder_id}", response_model=FolderRead)
async def get_folder(
    folder_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> FolderRead:
    """
    Get folder details by ID.
    """
    try:
        folder_repo = FolderRepository(db)
        folder = await folder_repo.get_folder_by_id(folder_id)

        if not folder:
            raise ErrCode.FOLDER_NOT_FOUND.with_messages("Folder not found")

        if folder.user_id != user_id:
            raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Access denied")

        return FolderRead(**folder.model_dump())

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to get folder {folder_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{folder_id}/path", response_model=list[FolderRead])
async def get_folder_path(
    folder_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[FolderRead]:
    """
    Get the breadcrumb path for a folder.
    """
    try:
        folder_repo = FolderRepository(db)
        # Verify access to the target folder first
        target_folder = await folder_repo.get_folder_by_id(folder_id)
        if not target_folder:
            raise ErrCode.FOLDER_NOT_FOUND.with_messages("Folder not found")
        if target_folder.user_id != user_id:
            raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Access denied")

        path = await folder_repo.get_folder_path(folder_id)
        return [FolderRead(**f.model_dump()) for f in path]

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to get folder path {folder_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.patch("/{folder_id}", response_model=FolderRead)
async def update_folder(
    folder_id: UUID,
    folder_update: FolderUpdate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> FolderRead:
    """
    Update folder details.
    """
    try:
        folder_repo = FolderRepository(db)
        folder = await folder_repo.get_folder_by_id(folder_id)

        if not folder:
            raise ErrCode.FOLDER_NOT_FOUND.with_messages("Folder not found")

        if folder.user_id != user_id:
            raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Access denied")

        # Verify new parent if moving
        if folder_update.parent_id:
            # Prevent moving to self
            if folder_update.parent_id == folder_id:
                raise ErrCode.INVALID_REQUEST.with_messages("Cannot move folder into itself")

            # Check for circular dependency (moving parent into child)
            if await folder_repo.is_descendant(folder_id, folder_update.parent_id):
                raise ErrCode.INVALID_REQUEST.with_messages("Cannot move folder into its own subfolder")

            parent = await folder_repo.get_folder_by_id(folder_update.parent_id)
            if not parent:
                raise ErrCode.FOLDER_NOT_FOUND.with_messages("Target parent folder not found")
            if parent.user_id != user_id:
                raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Target parent folder access denied")

        updated_folder = await folder_repo.update_folder(folder_id, folder_update)
        if updated_folder:
            await db.commit()
            await db.refresh(updated_folder)
            return FolderRead(**updated_folder.model_dump())
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
) -> None:
    """
    Delete a folder.
    Default: Soft delete (hides folder).
    Hard delete: Recursively destroys folder and all contents.
    """
    try:
        folder_repo = FolderRepository(db)
        folder = await folder_repo.get_folder_by_id(folder_id)

        if not folder:
            raise ErrCode.FOLDER_NOT_FOUND.with_messages("Folder not found")

        if folder.user_id != user_id:
            raise ErrCode.FOLDER_ACCESS_DENIED.with_messages("Access denied")

        if hard_delete:
            await folder_repo.hard_delete_folder_recursive(folder_id)
        else:
            await folder_repo.soft_delete_folder(folder_id)

        await db.commit()

    except ErrCodeError as e:
        raise handle_auth_error(e)
