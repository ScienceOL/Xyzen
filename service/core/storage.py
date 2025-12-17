import logging
import uuid
from datetime import datetime
from enum import StrEnum
from pathlib import Path
from typing import Any, BinaryIO, Protocol

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
            from infra.storage.blob import BlobStorageService

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
