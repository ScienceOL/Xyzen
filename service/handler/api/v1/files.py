import hashlib
import logging
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlmodel.ext.asyncio.session import AsyncSession

from common.code import ErrCode, ErrCodeError, handle_auth_error
from core.storage import BlobStorageService, FileCategory, FileScope, detect_file_category, generate_storage_key
from middleware.auth import get_current_user
from middleware.database import get_session
from models.file import FileCreate, FileRead, FileReadWithUrl, FileUpdate
from repos.file import FileRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["files"])


def get_storage_service() -> BlobStorageService:
    """Dependency to get storage service instance"""
    from core.storage import get_storage_service

    return get_storage_service()


def calculate_file_hash(file_data: bytes) -> str:
    """Calculate SHA256 hash of file data"""
    return hashlib.sha256(file_data).hexdigest()


@router.post("/upload", response_model=FileReadWithUrl, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    scope: str = Form(FileScope.PRIVATE),
    category: str | None = Form(None),
    user_id: str = Depends(get_current_user),
    storage: BlobStorageService = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> FileReadWithUrl:
    """
    Upload a file to object storage.

    Args:
        file: The file to upload (multipart/form-data)
        scope: File scope (public/private/generated), default: private
        category: File category (images/documents/audio/others), auto-detected if not provided
        user_id: Authenticated user ID (injected by dependency)
        storage: Storage service instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        FileReadWithUrl: The created file record with download URL

    Raises:
        HTTPException: 400 if file validation fails, 500 if upload fails
    """
    try:
        # Validate file
        if not file.filename:
            raise ErrCode.INVALID_REQUEST.with_messages("Filename is required")

        # Read file data
        file_data = await file.read()
        if not file_data:
            raise ErrCode.EMPTY_MESSAGE.with_messages("File is empty")

        # Check file size (limit: 100MB)
        max_size = 100 * 1024 * 1024  # 100MB
        if len(file_data) > max_size:
            raise ErrCode.FILE_TOO_LARGE.with_messages(f"File size exceeds {max_size / (1024 * 1024)}MB limit")

        # Calculate file hash
        file_hash = calculate_file_hash(file_data)

        # Auto-detect category if not provided
        if not category:
            category = detect_file_category(file.filename)

        # Generate unique storage key (always create new file, no deduplication)
        storage_key = generate_storage_key(
            user_id=user_id,
            filename=file.filename,
            scope=FileScope(scope),
            category=FileCategory(category) if category else None,
        )

        # Upload to object storage
        file_repo = FileRepository(db)
        file_stream = BytesIO(file_data)
        await storage.upload_file(
            file_data=file_stream,
            storage_key=storage_key,
            content_type=file.content_type,
            metadata={"user_id": user_id},
        )

        # Create database record
        file_create = FileCreate(
            user_id=user_id,
            storage_key=storage_key,
            original_filename=file.filename,
            content_type=file.content_type or "application/octet-stream",
            file_size=len(file_data),
            scope=scope,
            category=category or FileCategory.OTHER,
            file_hash=file_hash,
            metainfo={"original_content_type": file.content_type},
        )

        file_record = await file_repo.create_file(file_create)
        await db.commit()
        await db.refresh(file_record)

        # Use API download endpoint (consistent with message attachments)
        download_url = f"/xyzen/api/v1/files/{file_record.id}/download"

        logger.info(f"File uploaded successfully: {storage_key} by user {user_id}")

        return FileReadWithUrl(
            **file_record.model_dump(),
            download_url=download_url,
        )

    except ErrCodeError as e:
        logger.error(f"File upload failed: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Unexpected error during file upload: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/", response_model=list[FileRead])
async def list_files(
    scope: str | None = None,
    category: str | None = None,
    include_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[FileRead]:
    """
    List files for the current user with optional filters.

    Args:
        scope: Optional scope filter (public/private/generated)
        category: Optional category filter (images/documents/audio/others)
        include_deleted: Whether to include soft-deleted files, default: False
        limit: Maximum number of files to return, default: 100
        offset: Number of files to skip, default: 0
        user_id: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        list[FileRead]: List of file records
    """
    try:
        file_repo = FileRepository(db)
        files = await file_repo.get_files_by_user(
            user_id=user_id,
            scope=scope,
            category=category,
            include_deleted=include_deleted,
            limit=min(limit, 1000),  # Cap at 1000
            offset=offset,
        )

        return [FileRead(**file.model_dump()) for file in files]

    except Exception as e:
        logger.error(f"Failed to list files for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{file_id}", response_model=FileReadWithUrl)
async def get_file(
    file_id: UUID,
    user_id: str = Depends(get_current_user),
    storage: BlobStorageService = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> FileReadWithUrl:
    """
    Get file information by ID with download URL.

    Args:
        file_id: File UUID
        user_id: Authenticated user ID (injected by dependency)
        storage: Storage service instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        FileReadWithUrl: File record with download URL

    Raises:
        HTTPException: 404 if file not found, 403 if access denied
    """
    try:
        file_repo = FileRepository(db)
        file_record = await file_repo.get_file_by_id(file_id)

        if not file_record:
            raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")

        # Check ownership
        if file_record.user_id != user_id and file_record.scope != FileScope.PUBLIC:
            raise ErrCode.FILE_ACCESS_DENIED.with_messages("You don't have access to this file")

        # Generate download URL
        download_url = await storage.generate_download_url(file_record.storage_key, expires_in=3600)

        return FileReadWithUrl(
            **file_record.model_dump(),
            download_url=download_url,
        )

    except ErrCodeError as e:
        logger.error(f"Failed to get file {file_id}: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Unexpected error getting file {file_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{file_id}/download")
async def download_file(
    file_id: UUID,
    user_id: str = Depends(get_current_user),
    storage: BlobStorageService = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """
    Download file by ID.

    Args:
        file_id: File UUID
        user_id: Authenticated user ID (injected by dependency)
        storage: Storage service instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        StreamingResponse: File content as streaming response

    Raises:
        HTTPException: 404 if file not found, 403 if access denied
    """
    try:
        file_repo = FileRepository(db)
        file_record = await file_repo.get_file_by_id(file_id)

        if not file_record:
            raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")

        # Check ownership
        if file_record.user_id != user_id and file_record.scope != FileScope.PUBLIC:
            raise ErrCode.FILE_ACCESS_DENIED.with_messages("You don't have access to this file")

        # Download from storage
        file_stream = BytesIO()
        await storage.download_file(file_record.storage_key, file_stream)
        file_stream.seek(0)

        return StreamingResponse(
            file_stream,
            media_type=file_record.content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{file_record.original_filename}"',
                "Content-Length": str(file_record.file_size),
            },
        )

    except ErrCodeError as e:
        logger.error(f"Failed to download file {file_id}: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Unexpected error downloading file {file_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{file_id}/url", response_model=dict[str, str | int])
async def get_file_url(
    file_id: UUID,
    expires_in: int = 3600,
    user_id: str = Depends(get_current_user),
    storage: BlobStorageService = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> dict[str, str | int]:
    """
    Get presigned download URL for a file.

    Args:
        file_id: File UUID
        expires_in: URL expiration time in seconds, default: 3600 (1 hour)
        user_id: Authenticated user ID (injected by dependency)
        storage: Storage service instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        dict: Dictionary with download_url and expires_in

    Raises:
        HTTPException: 404 if file not found, 403 if access denied
    """
    try:
        file_repo = FileRepository(db)
        file_record = await file_repo.get_file_by_id(file_id)

        if not file_record:
            raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")

        # Check ownership
        if file_record.user_id != user_id and file_record.scope != FileScope.PUBLIC:
            raise ErrCode.FILE_ACCESS_DENIED.with_messages("You don't have access to this file")

        # Generate presigned URL
        download_url = await storage.generate_download_url(file_record.storage_key, expires_in=expires_in)

        return {
            "download_url": download_url,
            "expires_in": expires_in,
            "storage_key": file_record.storage_key,
        }

    except ErrCodeError as e:
        logger.error(f"Failed to get URL for file {file_id}: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Unexpected error getting URL for file {file_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.patch("/{file_id}", response_model=FileRead)
async def update_file(
    file_id: UUID,
    file_update: FileUpdate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> FileRead:
    """
    Update file metadata.

    Args:
        file_id: File UUID
        file_update: File update data
        user_id: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        FileRead: Updated file record

    Raises:
        HTTPException: 404 if file not found, 403 if access denied
    """
    try:
        file_repo = FileRepository(db)
        file_record = await file_repo.get_file_by_id(file_id)

        if not file_record:
            raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")

        # Check ownership
        if file_record.user_id != user_id:
            raise ErrCode.FILE_ACCESS_DENIED.with_messages("You don't have access to this file")

        # Update file
        updated_file = await file_repo.update_file(file_id, file_update)
        if not updated_file:
            raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")

        await db.commit()
        await db.refresh(updated_file)

        return FileRead(**updated_file.model_dump())

    except ErrCodeError as e:
        logger.error(f"Failed to update file {file_id}: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Unexpected error updating file {file_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: UUID,
    hard_delete: bool = False,
    user_id: str = Depends(get_current_user),
    storage: BlobStorageService = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete a file (soft delete by default, hard delete if specified).

    Args:
        file_id: File UUID
        hard_delete: If True, permanently delete file and storage, default: False
        user_id: Authenticated user ID (injected by dependency)
        storage: Storage service instance (injected by dependency)
        db: Database session (injected by dependency)

    Raises:
        HTTPException: 404 if file not found, 403 if access denied
    """
    try:
        file_repo = FileRepository(db)
        file_record = await file_repo.get_file_by_id(file_id)

        if not file_record:
            raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")

        # Check ownership
        if file_record.user_id != user_id:
            raise ErrCode.FILE_ACCESS_DENIED.with_messages("You don't have access to this file")

        if hard_delete:
            # Delete from object storage
            await storage.delete_file(file_record.storage_key)
            # Delete from database
            await file_repo.hard_delete_file(file_id)
            logger.info(f"File {file_id} hard deleted by user {user_id}")
        else:
            # Soft delete
            await file_repo.soft_delete_file(file_id)
            logger.info(f"File {file_id} soft deleted by user {user_id}")

        await db.commit()

    except ErrCodeError as e:
        logger.error(f"Failed to delete file {file_id}: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Unexpected error deleting file {file_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/{file_id}/restore", response_model=FileRead)
async def restore_file(
    file_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> FileRead:
    """
    Restore a soft-deleted file.

    Args:
        file_id: File UUID
        user_id: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        FileRead: Restored file record

    Raises:
        HTTPException: 404 if file not found, 403 if access denied
    """
    try:
        file_repo = FileRepository(db)
        file_record = await file_repo.get_file_by_id(file_id)

        if not file_record:
            raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")

        # Check ownership
        if file_record.user_id != user_id:
            raise ErrCode.FILE_ACCESS_DENIED.with_messages("You don't have access to this file")

        # Restore file
        success = await file_repo.restore_file(file_id)
        if not success:
            raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")

        await db.commit()

        # Fetch updated record
        restored_file = await file_repo.get_file_by_id(file_id)
        if not restored_file:
            raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")

        logger.info(f"File {file_id} restored by user {user_id}")

        return FileRead(**restored_file.model_dump())

    except ErrCodeError as e:
        logger.error(f"Failed to restore file {file_id}: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Unexpected error restoring file {file_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/stats/summary", response_model=dict[str, int | float])
async def get_user_storage_stats(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, int | float]:
    """
    Get storage statistics for the current user.

    Args:
        user_id: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        dict: Dictionary with total_files, total_size, and deleted_files
    """
    try:
        file_repo = FileRepository(db)

        total_size = await file_repo.get_total_size_by_user(user_id, include_deleted=False)
        total_files = await file_repo.get_file_count_by_user(user_id, include_deleted=False)
        deleted_files = await file_repo.get_file_count_by_user(user_id, include_deleted=True) - total_files

        return {
            "total_files": total_files,
            "total_size": total_size,
            "deleted_files": deleted_files,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
        }

    except Exception as e:
        logger.error(f"Failed to get storage stats for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.delete("/bulk", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_files(
    file_ids: list[UUID] = Body(...),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Bulk soft delete multiple files.

    Args:
        file_ids: List of file UUIDs to delete
        user_id: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)
    """
    try:
        file_repo = FileRepository(db)
        count = await file_repo.bulk_soft_delete_by_user(user_id, file_ids)
        await db.commit()

        logger.info(f"Bulk deleted {count} files for user {user_id}")

    except Exception as e:
        logger.error(f"Failed to bulk delete files for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
