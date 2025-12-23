import logging
import uuid
from datetime import datetime
from enum import StrEnum
from pathlib import Path
from typing import Any, BinaryIO, Protocol

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode

logger = logging.getLogger(__name__)


class FileScope(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"
    GENERATED = "generated"


class FileCategory(StrEnum):
    IMAGE = "images"
    DOCUMENT = "documents"
    AUDIO = "audio"
    OTHER = "others"


class StorageServiceProto(Protocol):
    """Abstract interface for storage services."""

    async def initialize(self) -> None: ...

    async def upload_file(
        self,
        file_data: BinaryIO,
        storage_key: str,
        content_type: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str: ...

    async def upload_file_from_path(
        self,
        file_path: str,
        storage_key: str,
        content_type: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str: ...

    async def download_file(self, storage_key: str, destination: BinaryIO) -> None: ...

    async def download_file_to_path(self, storage_key: str, file_path: str) -> None: ...

    async def delete_file(self, storage_key: str) -> None: ...

    async def delete_files(self, storage_keys: list[str]) -> None: ...

    async def file_exists(self, storage_key: str) -> bool: ...

    async def get_file_metadata(self, storage_key: str) -> dict[str, Any]: ...

    async def generate_presigned_url(
        self,
        storage_key: str,
        expires_in: int = 3600,
        method: str = "get_object",
    ) -> str: ...

    async def generate_upload_url(self, storage_key: str, expires_in: int = 3600) -> str: ...

    async def generate_download_url(self, storage_key: str, expires_in: int = 3600) -> str: ...

    async def list_files(
        self,
        prefix: str = "",
        max_keys: int = 1000,
    ) -> list[dict[str, Any]]: ...

    async def copy_file(self, source_key: str, destination_key: str) -> str: ...


# Global instance
_storage_service: StorageServiceProto | None = None


def get_storage_service() -> StorageServiceProto:
    """
    Get or create the global storage service instance.

    Returns:
        StorageServiceProto instance
    """
    global _storage_service
    if _storage_service is None:
        try:
            from app.infra.storage.blob import BlobStorageService

            _storage_service = BlobStorageService()
        except ImportError as e:
            logger.error(f"Failed to import BlobStorageService: {e}")
            raise RuntimeError("Storage infrastructure not available") from e

    return _storage_service


def detect_file_category(filename: str) -> FileCategory:
    """
    Detect file category based on file extension.

    Args:
        filename: The filename to analyze

    Returns:
        Detected FileCategory
    """
    ext = Path(filename).suffix.lower()

    # Image extensions
    image_exts = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico"}
    if ext in image_exts:
        return FileCategory.IMAGE

    # Document extensions
    doc_exts = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".md"}
    if ext in doc_exts:
        return FileCategory.DOCUMENT

    # Audio extensions
    audio_exts = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"}
    if ext in audio_exts:
        return FileCategory.AUDIO

    return FileCategory.OTHER


def generate_storage_key(
    user_id: str, filename: str, scope: FileScope = FileScope.PRIVATE, category: FileCategory | None = None
) -> str:
    """
    Generate a unique storage key for files.

    Args:
        user_id: User ID for organizing files
        filename: Original filename
        scope: File scope (public/private/generated)
        category: File category for organization

    Returns:
        Storage key in format: {scope}/{category}/{user_id}/{date}/{uuid}_{filename}
    """
    # Get file extension
    ext = Path(filename).suffix.lower()

    # Auto-detect category if not provided
    if category is None:
        category = detect_file_category(filename)

    # Generate unique ID
    unique_id = uuid.uuid4().hex

    # Get current date for organizing
    date_path = datetime.utcnow().strftime("%Y/%m/%d")

    # Construct storage key
    safe_filename = f"{unique_id}{ext}"
    return f"{scope}/{category}/{user_id}/{date_path}/{safe_filename}"


class StorageQuotaService:
    """
    Service for managing and validating user storage quotas.

    This service enforces three types of limits per user:
    1. Maximum total storage in bytes (e.g., 5GB per user)
    2. Maximum number of files (e.g., 10,000 files per user)
    3. Maximum individual file size (e.g., 100MB per file)

    Usage:
        # In an API endpoint with database session
        quota_service = create_quota_service(db)
        await quota_service.validate_upload(user_id, file_size)

        # Get quota information
        quota_info = await quota_service.get_quota_info(user_id)

    Configuration:
        Limits are configured via environment variables or OSSConfig:
        - OSS_MAXUSERSTORAGEBYTES: Maximum storage per user (default: 5GB)
        - OSS_MAXUSERFILECOUNT: Maximum files per user (default: 10,000)
        - OSS_MAXFILEUPLOADBYTES: Maximum file size (default: 100MB)
    """

    def __init__(self, db: AsyncSession, max_storage_bytes: int, max_file_count: int, max_file_size_bytes: int):
        """
        Initialize the storage quota service.

        Args:
            db: Database session for querying user storage usage
            max_storage_bytes: Maximum total storage per user in bytes
            max_file_count: Maximum number of files per user
            max_file_size_bytes: Maximum individual file size in bytes
        """
        self.db = db
        self.max_storage_bytes = max_storage_bytes
        self.max_file_count = max_file_count
        self.max_file_size_bytes = max_file_size_bytes

    async def validate_upload(self, user_id: str, file_size: int) -> None:
        """
        Validate if a file upload is allowed based on user's current quota.

        This method checks three conditions:
        1. Individual file size doesn't exceed max_file_size_bytes
        2. User hasn't reached max_file_count limit
        3. Adding this file won't exceed max_storage_bytes limit

        Call this BEFORE uploading the file to object storage to prevent
        quota violations and unnecessary storage operations.

        Args:
            user_id: The user ID to check quota for
            file_size: Size of the file to upload in bytes

        Raises:
            ErrCode.FILE_TOO_LARGE: If file size exceeds individual file limit
            ErrCode.STORAGE_QUOTA_EXCEEDED: If file count or total storage limit reached
        """
        # Import here to avoid circular dependency
        from app.repos.file import FileRepository

        file_repo = FileRepository(self.db)

        # Check individual file size limit
        if file_size > self.max_file_size_bytes:
            max_mb = self.max_file_size_bytes / (1024 * 1024)
            actual_mb = file_size / (1024 * 1024)
            raise ErrCode.FILE_TOO_LARGE.with_messages(
                f"File size ({actual_mb:.2f}MB) exceeds maximum allowed size ({max_mb:.2f}MB)"
            )

        # Check file count limit
        current_file_count = await file_repo.get_file_count_by_user(user_id, include_deleted=False)
        if current_file_count >= self.max_file_count:
            raise ErrCode.STORAGE_QUOTA_EXCEEDED.with_messages(
                f"Maximum file count reached ({current_file_count}/{self.max_file_count}). "
                "Please delete some files before uploading new ones."
            )

        # Check total storage limit
        current_storage = await file_repo.get_total_size_by_user(user_id, include_deleted=False)
        if current_storage + file_size > self.max_storage_bytes:
            current_gb = current_storage / (1024 * 1024 * 1024)
            max_gb = self.max_storage_bytes / (1024 * 1024 * 1024)
            file_gb = file_size / (1024 * 1024 * 1024)
            raise ErrCode.STORAGE_QUOTA_EXCEEDED.with_messages(
                f"Storage quota exceeded. Current usage: {current_gb:.2f}GB, "
                f"File size: {file_gb:.2f}GB, Maximum: {max_gb:.2f}GB. "
                "Please delete some files to free up space."
            )

    async def get_quota_info(self, user_id: str) -> dict[str, Any]:
        """
        Get detailed quota information for a user.

        Returns comprehensive information about storage usage, limits,
        and available space in multiple units (bytes, MB, GB).

        Args:
            user_id: The user ID to get quota information for

        Returns:
            Dictionary with the following structure:
            {
                "storage": {
                    "used_bytes": int,
                    "used_mb": float,
                    "used_gb": float,
                    "limit_bytes": int,
                    "limit_mb": float,
                    "limit_gb": float,
                    "available_bytes": int,
                    "available_mb": float,
                    "available_gb": float,
                    "usage_percentage": float
                },
                "file_count": {
                    "used": int,
                    "limit": int,
                    "available": int,
                    "usage_percentage": float
                },
                "max_file_size": {
                    "bytes": int,
                    "mb": float,
                    "gb": float
                }
            }
        """
        # Import here to avoid circular dependency
        from app.repos.file import FileRepository

        file_repo = FileRepository(self.db)

        current_storage = await file_repo.get_total_size_by_user(user_id, include_deleted=False)
        current_file_count = await file_repo.get_file_count_by_user(user_id, include_deleted=False)

        return {
            "storage": {
                "used_bytes": current_storage,
                "used_mb": round(current_storage / (1024 * 1024), 2),
                "used_gb": round(current_storage / (1024 * 1024 * 1024), 2),
                "limit_bytes": self.max_storage_bytes,
                "limit_mb": round(self.max_storage_bytes / (1024 * 1024), 2),
                "limit_gb": round(self.max_storage_bytes / (1024 * 1024 * 1024), 2),
                "available_bytes": max(0, self.max_storage_bytes - current_storage),
                "available_mb": round(max(0, self.max_storage_bytes - current_storage) / (1024 * 1024), 2),
                "available_gb": round(max(0, self.max_storage_bytes - current_storage) / (1024 * 1024 * 1024), 2),
                "usage_percentage": round((current_storage / self.max_storage_bytes) * 100, 2)
                if self.max_storage_bytes > 0
                else 0,
            },
            "file_count": {
                "used": current_file_count,
                "limit": self.max_file_count,
                "available": max(0, self.max_file_count - current_file_count),
                "usage_percentage": round((current_file_count / self.max_file_count) * 100, 2)
                if self.max_file_count > 0
                else 0,
            },
            "max_file_size": {
                "bytes": self.max_file_size_bytes,
                "mb": round(self.max_file_size_bytes / (1024 * 1024), 2),
                "gb": round(self.max_file_size_bytes / (1024 * 1024 * 1024), 2),
            },
        }

    async def check_can_upload(self, user_id: str, file_size: int) -> tuple[bool, str | None]:
        """
        Check if a user can upload a file without raising an exception.

        This is a non-throwing version of validate_upload() that returns
        a boolean result instead of raising exceptions. Useful for
        pre-flight checks or UI validation.

        Args:
            user_id: The user ID to check quota for
            file_size: Size of the file to upload in bytes

        Returns:
            Tuple of (can_upload: bool, error_message: str | None)
            - (True, None) if upload is allowed
            - (False, "error message") if upload would violate quota
        """
        try:
            await self.validate_upload(user_id, file_size)
            return True, None
        except Exception as e:
            return False, str(e)


def create_quota_service(db: AsyncSession) -> StorageQuotaService:
    """
    Create a StorageQuotaService instance with configuration from OSSConfig.

    This is the recommended way to create a quota service instance as it
    automatically loads configuration from environment variables via OSSConfig.

    Example:
        @router.post("/upload")
        async def upload_file(
            file: UploadFile,
            user_id: str = Depends(get_current_user),
            db: AsyncSession = Depends(get_session),
        ):
            quota_service = create_quota_service(db)
            await quota_service.validate_upload(user_id, file_size)
            # ... proceed with upload

    Args:
        db: Database session for querying user storage usage

    Returns:
        StorageQuotaService instance configured with limits from OSSConfig
    """
    from app.common.configs import configs

    oss_config = configs.OSS
    return StorageQuotaService(
        db=db,
        max_storage_bytes=oss_config.MaxUserStorageBytes,
        max_file_count=oss_config.MaxUserFileCount,
        max_file_size_bytes=oss_config.MaxFileUploadBytes,
    )
