import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.file import File, FileCreate, FileUpdate

logger = logging.getLogger(__name__)


class FileRepository:
    """File storage data access layer"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_file(self, file_data: FileCreate) -> File:
        """
        Creates a new file record.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the file object is populated with DB-defaults before being returned.

        Args:
            file_data: The Pydantic model containing the data for the new file.

        Returns:
            The newly created File instance.
        """
        logger.debug(f"Creating new file record for user: {file_data.user_id}")
        file = File.model_validate(file_data)
        self.db.add(file)
        await self.db.flush()
        await self.db.refresh(file)
        return file

    async def get_file_by_id(self, file_id: UUID) -> File | None:
        """
        Fetches a file by its ID.

        Args:
            file_id: The UUID of the file to fetch.

        Returns:
            The File, or None if not found.
        """
        logger.debug(f"Fetching file with id: {file_id}")
        return await self.db.get(File, file_id)

    async def get_file_by_storage_key(self, storage_key: str) -> File | None:
        """
        Fetches a file by its storage key.

        Args:
            storage_key: The storage key of the file.

        Returns:
            The File, or None if not found.
        """
        logger.debug(f"Fetching file with storage_key: {storage_key}")
        statement = select(File).where(File.storage_key == storage_key)
        result = await self.db.exec(statement)
        return result.first()

    async def get_files_by_user(
        self,
        user_id: str,
        scope: str | None = None,
        category: str | None = None,
        include_deleted: bool = False,
        limit: int = 100,
        offset: int = 0,
        folder_id: UUID | None = None,
        use_folder_filter: bool = False,
    ) -> list[File]:
        """
        Fetches files for a given user with optional filters.

        Args:
            user_id: The user ID.
            scope: Optional scope filter (public, private, generated).
            category: Optional category filter (images, documents, audio, others).
            include_deleted: Whether to include soft-deleted files.
            limit: Maximum number of files to return.
            offset: Number of files to skip.
            folder_id: Folder ID to filter by (if use_folder_filter is True).
            use_folder_filter: Whether to apply the folder_id filter.

        Returns:
            List of File instances.
        """
        logger.debug(f"Fetching files for user_id: {user_id}")
        statement = select(File).where(File.user_id == user_id)

        if not include_deleted:
            statement = statement.where(col(File.is_deleted).is_(False))

        if scope:
            statement = statement.where(File.scope == scope)

        if category:
            statement = statement.where(File.category == category)

        if use_folder_filter:
            statement = statement.where(File.folder_id == folder_id)

        statement = statement.order_by(col(File.created_at).desc()).limit(limit).offset(offset)

        result = await self.db.exec(statement)
        return list(result.all())

    async def update_file(self, file_id: UUID, file_data: FileUpdate) -> File | None:
        """
        Updates a file record.
        This function does NOT commit the transaction.

        Args:
            file_id: The UUID of the file to update.
            file_data: The update data.

        Returns:
            The updated File, or None if not found.
        """
        logger.debug(f"Updating file with id: {file_id}")
        file = await self.db.get(File, file_id)
        if not file:
            return None

        update_dict = file_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(file, key, value)

        file.updated_at = datetime.now(timezone.utc)
        self.db.add(file)
        await self.db.flush()
        await self.db.refresh(file)
        return file

    async def soft_delete_file(self, file_id: UUID) -> bool:
        """
        Soft deletes a file by setting is_deleted flag and deleted_at timestamp.
        This function does NOT commit the transaction.

        Args:
            file_id: The UUID of the file to delete.

        Returns:
            True if the file was deleted, False if not found.
        """
        logger.debug(f"Soft deleting file with id: {file_id}")
        file = await self.db.get(File, file_id)
        if not file:
            return False

        file.is_deleted = True
        file.deleted_at = datetime.now(timezone.utc)
        file.updated_at = datetime.now(timezone.utc)
        self.db.add(file)
        await self.db.flush()
        return True

    async def hard_delete_file(self, file_id: UUID) -> bool:
        """
        Permanently deletes a file record from the database.
        This function does NOT commit the transaction.

        Args:
            file_id: The UUID of the file to delete.

        Returns:
            True if the file was deleted, False if not found.
        """
        logger.debug(f"Hard deleting file with id: {file_id}")
        file = await self.db.get(File, file_id)
        if not file:
            return False

        await self.db.delete(file)
        await self.db.flush()
        return True

    async def restore_file(self, file_id: UUID) -> bool:
        """
        Restores a soft-deleted file.
        This function does NOT commit the transaction.

        Args:
            file_id: The UUID of the file to restore.

        Returns:
            True if the file was restored, False if not found.
        """
        logger.debug(f"Restoring file with id: {file_id}")
        file = await self.db.get(File, file_id)
        if not file:
            return False

        file.is_deleted = False
        file.deleted_at = None
        file.updated_at = datetime.now(timezone.utc)
        self.db.add(file)
        await self.db.flush()
        return True

    async def get_files_by_hash(self, file_hash: str, user_id: str | None = None) -> list[File]:
        """
        Fetches files by their hash (for deduplication).

        Args:
            file_hash: The file hash to search for.
            user_id: Optional user ID to filter by.

        Returns:
            List of File instances with matching hash.
        """
        logger.debug(f"Fetching files with hash: {file_hash}")
        statement = select(File).where(File.file_hash == file_hash, col(File.is_deleted).is_(False))

        if user_id:
            statement = statement.where(File.user_id == user_id)

        result = await self.db.exec(statement)
        return list(result.all())

    async def get_total_size_by_user(self, user_id: str, include_deleted: bool = False) -> int:
        """
        Calculates the total file size for a user.

        Args:
            user_id: The user ID.
            include_deleted: Whether to include soft-deleted files.

        Returns:
            Total size in bytes.
        """
        logger.debug(f"Calculating total file size for user_id: {user_id}")
        statement = select(File).where(File.user_id == user_id)

        if not include_deleted:
            statement = statement.where(col(File.is_deleted).is_(False))

        result = await self.db.exec(statement)
        files = result.all()
        return sum(file.file_size for file in files)

    async def get_file_count_by_user(self, user_id: str, include_deleted: bool = False) -> int:
        """
        Counts the total number of files for a user.

        Args:
            user_id: The user ID.
            include_deleted: Whether to include soft-deleted files.

        Returns:
            Total file count.
        """
        logger.debug(f"Counting files for user_id: {user_id}")
        statement = select(File).where(File.user_id == user_id)

        if not include_deleted:
            statement = statement.where(col(File.is_deleted).is_(False))
        result = await self.db.exec(statement)
        return len(list(result.all()))

    async def bulk_soft_delete_by_user(self, user_id: str, file_ids: list[UUID]) -> int:
        """
        Soft deletes multiple files for a user.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID (for security check).
            file_ids: List of file UUIDs to delete.

        Returns:
            Number of files deleted.
        """
        logger.debug(f"Bulk soft deleting {len(file_ids)} files for user_id: {user_id}")
        count = 0
        for file_id in file_ids:
            file = await self.db.get(File, file_id)
            if file and file.user_id == user_id:
                file.is_deleted = True
                file.deleted_at = datetime.now(timezone.utc)
                file.updated_at = datetime.now(timezone.utc)
                self.db.add(file)
                count += 1

        if count > 0:
            await self.db.flush()

        return count

    async def cleanup_old_deleted_files(self, days: int = 30) -> int:
        """
        Permanently deletes files that have been soft-deleted for more than specified days.
        This function does NOT commit the transaction.

        Args:
            days: Number of days after which to permanently delete files.

        Returns:
            Number of files permanently deleted.
        """
        logger.debug(f"Cleaning up files deleted more than {days} days ago")
        cutoff_date = datetime.now(timezone.utc).timestamp() - (days * 24 * 60 * 60)
        cutoff_datetime = datetime.fromtimestamp(cutoff_date, tz=timezone.utc)

        statement = select(File).where(col(File.is_deleted).is_(True)).where(col(File.deleted_at) <= cutoff_datetime)

        result = await self.db.exec(statement)
        files = list(result.all())

        count = 0
        for file in files:
            await self.db.delete(file)
            count += 1

        if count > 0:
            await self.db.flush()

        return count

    async def update_files_message_id(self, file_ids: list[UUID], message_id: UUID, user_id: str) -> int:
        """
        Links files to a message by updating message_id and status to 'confirmed'.
        This function does NOT commit the transaction.

        Args:
            file_ids: List of file UUIDs to link to the message.
            message_id: The UUID of the message to associate files with.
            user_id: The user ID to verify ownership of files.

        Returns:
            Number of files successfully updated.
        """
        logger.debug(f"Updating {len(file_ids)} files with message_id: {message_id}")
        count = 0

        for file_id in file_ids:
            file = await self.db.get(File, file_id)

            # Security check: ensure user owns the file
            if not file or file.user_id != user_id:
                logger.warning(f"File {file_id} not found or access denied for user {user_id}")
                continue

            # Only update files in pending status
            if file.status != "pending":
                logger.warning(f"File {file_id} is not in pending status (current: {file.status})")
                continue

            file.message_id = message_id
            file.status = "confirmed"
            file.updated_at = datetime.now(timezone.utc)
            self.db.add(file)
            count += 1

        if count > 0:
            await self.db.flush()

        return count

    async def get_files_by_message(self, message_id: UUID) -> list[File]:
        """
        Fetches all files associated with a specific message.

        Args:
            message_id: The UUID of the message.

        Returns:
            List of File instances associated with the message.
        """
        logger.debug(f"Fetching files for message_id: {message_id}")
        statement = select(File).where(
            File.message_id == message_id,
            col(File.is_deleted).is_(False),
        )
        result = await self.db.exec(statement)
        return list(result.all())

    async def validate_user_quota(
        self,
        user_id: str,
        file_size: int,
        max_storage_bytes: int,
        max_file_count: int,
        max_file_size_bytes: int,
    ) -> tuple[bool, str | None]:
        """
        Validate if a user can upload a file based on quota limits.

        This is a convenience method that performs quota validation without
        requiring external dependencies. For full quota management, use
        StorageQuotaService from app.core.storage.

        Args:
            user_id: The user ID to check quota for
            file_size: Size of the file to upload in bytes
            max_storage_bytes: Maximum total storage per user in bytes
            max_file_count: Maximum number of files per user
            max_file_size_bytes: Maximum individual file size in bytes

        Returns:
            Tuple of (is_valid: bool, error_message: str | None)
            - (True, None) if upload is allowed
            - (False, "error message") if upload would violate quota
        """
        # Check individual file size limit
        if file_size > max_file_size_bytes:
            max_mb = max_file_size_bytes / (1024 * 1024)
            actual_mb = file_size / (1024 * 1024)
            return False, f"File size ({actual_mb:.2f}MB) exceeds maximum allowed size ({max_mb:.2f}MB)"

        # Check file count limit
        current_file_count = await self.get_file_count_by_user(user_id, include_deleted=False)
        if current_file_count >= max_file_count:
            return False, f"Maximum file count reached ({current_file_count}/{max_file_count})"

        # Check total storage limit
        current_storage = await self.get_total_size_by_user(user_id, include_deleted=False)
        if current_storage + file_size > max_storage_bytes:
            current_gb = current_storage / (1024 * 1024 * 1024)
            max_gb = max_storage_bytes / (1024 * 1024 * 1024)
            file_gb = file_size / (1024 * 1024 * 1024)
            return (
                False,
                f"Storage quota exceeded. Current: {current_gb:.2f}GB, File: {file_gb:.2f}GB, Limit: {max_gb:.2f}GB",
            )

        return True, None
