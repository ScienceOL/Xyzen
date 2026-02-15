import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.file import File, FileCreate, FileUpdate
from app.models.file_knowledge_set_link import FileKnowledgeSetLink

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

    async def name_exists_in_parent(
        self,
        user_id: str,
        parent_id: UUID | None,
        name: str,
        exclude_id: UUID | None = None,
    ) -> bool:
        """
        Check if an item with the given name already exists in the parent directory.
        Used to enforce unique names within a folder (like a real filesystem).

        Args:
            user_id: The user ID.
            parent_id: Parent directory ID (None for root).
            name: The filename/folder name to check.
            exclude_id: Optional ID to exclude (for rename operations).

        Returns:
            True if a conflicting name exists.
        """
        statement = (
            select(File)
            .where(File.user_id == user_id)
            .where(File.parent_id == parent_id)
            .where(File.original_filename == name)
            .where(col(File.is_deleted).is_(False))
        )

        if exclude_id is not None:
            statement = statement.where(File.id != exclude_id)

        result = await self.db.exec(statement)
        return result.first() is not None

    async def get_unique_name(
        self,
        user_id: str,
        parent_id: UUID | None,
        name: str,
    ) -> str:
        """
        Return a unique name for an item in the given parent directory.
        If no conflict, returns the original name.
        Otherwise appends " (1)", " (2)", etc.

        Args:
            user_id: The user ID.
            parent_id: Parent directory ID (None for root).
            name: The desired name.

        Returns:
            A name that doesn't conflict with existing items.
        """
        if not await self.name_exists_in_parent(user_id, parent_id, name):
            return name

        dot_idx = name.rfind(".")
        base = name[:dot_idx] if dot_idx > 0 else name
        ext = name[dot_idx:] if dot_idx > 0 else ""

        counter = 1
        while True:
            candidate = f"{base} ({counter}){ext}"
            if not await self.name_exists_in_parent(user_id, parent_id, candidate):
                return candidate
            counter += 1

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
        parent_id: UUID | None = None,
        use_parent_filter: bool = False,
        is_dir: bool | None = None,
        knowledge_set_id: UUID | None = None,
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
            parent_id: Parent directory ID to filter by (if use_parent_filter is True).
            use_parent_filter: Whether to apply the parent_id filter.
            is_dir: Optional filter for directories (True) or files (False).
            knowledge_set_id: Optional knowledge set ID to filter files linked to.

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

        if use_parent_filter:
            statement = statement.where(File.parent_id == parent_id)

        if is_dir is not None:
            statement = statement.where(File.is_dir == is_dir)

        if knowledge_set_id is not None:
            statement = statement.join(
                FileKnowledgeSetLink,
                col(FileKnowledgeSetLink.file_id) == col(File.id),
            ).where(FileKnowledgeSetLink.knowledge_set_id == knowledge_set_id)

        statement = statement.order_by(col(File.created_at).desc()).limit(limit).offset(offset)

        result = await self.db.exec(statement)
        return list(result.all())

    async def get_children(
        self,
        user_id: str,
        parent_id: UUID | None = None,
        is_dir: bool | None = None,
        include_deleted: bool = False,
        knowledge_set_id: UUID | None = None,
    ) -> list[File]:
        """
        List items under a parent directory.

        Args:
            user_id: The user ID.
            parent_id: Parent directory ID (None for root).
            is_dir: Filter for directories only (True) or files only (False).
            include_deleted: Whether to include soft-deleted items.
            knowledge_set_id: Optional knowledge set ID to filter items linked to.

        Returns:
            List of File instances.
        """
        logger.debug(f"Fetching children for user_id: {user_id}, parent_id: {parent_id}")
        statement = select(File).where(File.user_id == user_id).where(File.parent_id == parent_id)

        if not include_deleted:
            statement = statement.where(col(File.is_deleted).is_(False))

        if is_dir is not None:
            statement = statement.where(File.is_dir == is_dir)

        if knowledge_set_id is not None:
            statement = statement.join(
                FileKnowledgeSetLink,
                col(FileKnowledgeSetLink.file_id) == col(File.id),
            ).where(FileKnowledgeSetLink.knowledge_set_id == knowledge_set_id)

        statement = statement.order_by(col(File.original_filename).asc())

        result = await self.db.exec(statement)
        return list(result.all())

    async def get_all_items(
        self,
        user_id: str,
        include_deleted: bool = False,
        only_deleted: bool = False,
        knowledge_set_id: UUID | None = None,
    ) -> list[File]:
        """
        Fetch ALL files and folders for a user in a single query.
        The caller is responsible for building the tree structure from
        the flat list using parent_id references.

        Args:
            user_id: The user ID.
            include_deleted: Whether to include soft-deleted items.
            only_deleted: If True, return ONLY soft-deleted items (for trash tree).
            knowledge_set_id: Optional knowledge set ID to filter items linked to.

        Returns:
            Flat list of all File instances belonging to the user.
        """
        logger.debug(f"Fetching all items for user_id: {user_id}")
        statement = select(File).where(File.user_id == user_id)

        if only_deleted:
            statement = statement.where(col(File.is_deleted).is_(True))
        elif not include_deleted:
            statement = statement.where(col(File.is_deleted).is_(False))

        if knowledge_set_id is not None:
            statement = statement.join(
                FileKnowledgeSetLink,
                col(FileKnowledgeSetLink.file_id) == col(File.id),
            ).where(FileKnowledgeSetLink.knowledge_set_id == knowledge_set_id)

        # Folders first, then files; alphabetical within each group
        statement = statement.order_by(
            col(File.is_dir).desc(),
            col(File.original_filename).asc(),
        )

        result = await self.db.exec(statement)
        return list(result.all())

    async def get_descendant_ids(self, folder_id: UUID, user_id: str) -> list[UUID]:
        """
        Get IDs of all descendants (files and subfolders) of a folder
        recursively using BFS with one query per nesting level.
        """
        all_ids: list[UUID] = []
        parent_ids: list[UUID] = [folder_id]

        for _ in range(self._MAX_TREE_DEPTH):
            if not parent_ids:
                break
            statement = select(File).where(
                col(File.parent_id).in_(parent_ids),
                File.user_id == user_id,
                col(File.is_deleted).is_(False),
            )
            result = await self.db.exec(statement)
            children = list(result.all())

            next_parent_ids: list[UUID] = []
            for child in children:
                all_ids.append(child.id)
                if child.is_dir:
                    next_parent_ids.append(child.id)
            parent_ids = next_parent_ids

        return all_ids

    _MAX_TREE_DEPTH = 100

    async def get_path(self, file_id: UUID) -> list[File]:
        """
        Retrieves the path (list of ancestors) for a given file/directory,
        starting from root.
        """
        path = []
        current_id: UUID | None = file_id
        for _ in range(self._MAX_TREE_DEPTH):
            if not current_id:
                break
            item = await self.db.get(File, current_id)
            if not item:
                break
            path.insert(0, item)
            current_id = item.parent_id
        return path

    async def is_descendant(self, ancestor_id: UUID, target_id: UUID) -> bool:
        """
        Checks if target_id is a descendant of (or is the same as) ancestor_id.
        Used to prevent circular moves.
        """
        if ancestor_id == target_id:
            return True
        current_id: UUID | None = target_id
        for _ in range(self._MAX_TREE_DEPTH):
            if not current_id:
                return False
            item = await self.db.get(File, current_id)
            if not item:
                return False
            if item.parent_id == ancestor_id:
                return True
            current_id = item.parent_id
        return False

    async def hard_delete_recursive(self, file_id: UUID) -> list[str]:
        """
        Recursively hard deletes a directory and all its contents.
        Also removes any knowledge set links referencing deleted items.

        Returns:
            List of storage keys that were removed from DB (caller should
            delete these from object storage).
        """
        logger.debug(f"Recursively hard deleting: {file_id}")
        storage_keys: list[str] = []
        deleted_ids: list[UUID] = []

        # Find all direct children
        statement = select(File).where(File.parent_id == file_id)
        children = (await self.db.exec(statement)).all()

        # Recursively delete children
        for child in children:
            if child.is_dir:
                child_keys = await self.hard_delete_recursive(child.id)
                storage_keys.extend(child_keys)
            else:
                if child.storage_key:
                    storage_keys.append(child.storage_key)
                deleted_ids.append(child.id)
                await self.db.delete(child)

        # Delete the item itself
        item = await self.db.get(File, file_id)
        if item:
            deleted_ids.append(item.id)
            await self.db.delete(item)

        # Remove knowledge set links for all deleted items
        if deleted_ids:
            await self._delete_knowledge_set_links(deleted_ids)

        await self.db.flush()
        return storage_keys

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
        Also removes any knowledge set links referencing this file.
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

        # Remove knowledge set links for this file
        await self._delete_knowledge_set_links([file_id])

        await self.db.delete(file)
        await self.db.flush()
        return True

    async def _delete_knowledge_set_links(self, file_ids: list[UUID]) -> None:
        """
        Delete all FileKnowledgeSetLink rows referencing any of the given file IDs.
        """
        if not file_ids:
            return
        statement = select(FileKnowledgeSetLink).where(col(FileKnowledgeSetLink.file_id).in_(file_ids))
        links = (await self.db.exec(statement)).all()
        for link in links:
            await self.db.delete(link)

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

    async def soft_delete_recursive(self, file_id: UUID, user_id: str) -> bool:
        """
        Soft-delete a file/folder and all its descendants recursively.
        Marks is_deleted=True and sets deleted_at on the item and every child.
        This function does NOT commit the transaction.

        Args:
            file_id: The UUID of the file/folder to delete.
            user_id: The user ID (for security check).

        Returns:
            True if the item was found and deleted.
        """
        logger.debug(f"Soft deleting recursively: {file_id}")
        item = await self.db.get(File, file_id)
        if not item or item.user_id != user_id:
            return False

        now = datetime.now(timezone.utc)
        item.is_deleted = True
        item.deleted_at = now
        item.updated_at = now
        self.db.add(item)

        if item.is_dir:
            # BFS to mark all descendants
            parent_ids: list[UUID] = [file_id]
            for _ in range(self._MAX_TREE_DEPTH):
                if not parent_ids:
                    break
                statement = select(File).where(
                    col(File.parent_id).in_(parent_ids),
                    File.user_id == user_id,
                )
                result = await self.db.exec(statement)
                children = list(result.all())

                next_parent_ids: list[UUID] = []
                for child in children:
                    child.is_deleted = True
                    child.deleted_at = now
                    child.updated_at = now
                    self.db.add(child)
                    if child.is_dir:
                        next_parent_ids.append(child.id)
                parent_ids = next_parent_ids

        await self.db.flush()
        return True

    async def restore_recursive(self, file_id: UUID, user_id: str) -> bool:
        """
        Restore a soft-deleted file/folder and all its descendants recursively.
        Clears is_deleted and deleted_at on the item and every child.
        This function does NOT commit the transaction.

        Args:
            file_id: The UUID of the file/folder to restore.
            user_id: The user ID (for security check).

        Returns:
            True if the item was found and restored.
        """
        logger.debug(f"Restoring recursively: {file_id}")
        item = await self.db.get(File, file_id)
        if not item or item.user_id != user_id:
            return False

        now = datetime.now(timezone.utc)
        item.is_deleted = False
        item.deleted_at = None
        item.updated_at = now
        self.db.add(item)

        if item.is_dir:
            # BFS to restore all descendants
            parent_ids: list[UUID] = [file_id]
            for _ in range(self._MAX_TREE_DEPTH):
                if not parent_ids:
                    break
                statement = select(File).where(
                    col(File.parent_id).in_(parent_ids),
                    File.user_id == user_id,
                )
                result = await self.db.exec(statement)
                children = list(result.all())

                next_parent_ids: list[UUID] = []
                for child in children:
                    child.is_deleted = False
                    child.deleted_at = None
                    child.updated_at = now
                    self.db.add(child)
                    if child.is_dir:
                        next_parent_ids.append(child.id)
                parent_ids = next_parent_ids

        await self.db.flush()
        return True

    async def empty_trash(self, user_id: str) -> tuple[int, list[str]]:
        """
        Permanently delete ALL soft-deleted items for a user.
        Also removes any knowledge set links referencing deleted items.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID.

        Returns:
            Tuple of (deleted_count, storage_keys) — the caller should
            delete the storage_keys from object storage.
        """
        logger.debug(f"Emptying trash for user_id: {user_id}")
        statement = select(File).where(
            File.user_id == user_id,
            col(File.is_deleted).is_(True),
        )
        result = await self.db.exec(statement)
        items = list(result.all())

        storage_keys: list[str] = []
        deleted_ids: list[UUID] = []
        for item in items:
            if item.storage_key:
                storage_keys.append(item.storage_key)
            deleted_ids.append(item.id)
            await self.db.delete(item)

        # Remove knowledge set links for all deleted items
        if deleted_ids:
            await self._delete_knowledge_set_links(deleted_ids)

        if items:
            await self.db.flush()

        return len(items), storage_keys

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
        Calculates the total file size for a user (excludes directories).

        Args:
            user_id: The user ID.
            include_deleted: Whether to include soft-deleted files.

        Returns:
            Total size in bytes.
        """
        logger.debug(f"Calculating total file size for user_id: {user_id}")
        statement = select(File).where(File.user_id == user_id).where(File.is_dir == False)  # noqa: E712

        if not include_deleted:
            statement = statement.where(col(File.is_deleted).is_(False))

        result = await self.db.exec(statement)
        files = result.all()
        return sum(file.file_size for file in files)

    async def get_file_count_by_user(self, user_id: str, include_deleted: bool = False) -> int:
        """
        Counts the total number of files for a user (excludes directories).

        Args:
            user_id: The user ID.
            include_deleted: Whether to include soft-deleted files.

        Returns:
            Total file count.
        """
        logger.debug(f"Counting files for user_id: {user_id}")
        statement = select(File).where(File.user_id == user_id).where(File.is_dir == False)  # noqa: E712

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

        Args:
            user_id: The user ID to check quota for
            file_size: Size of the file to upload in bytes
            max_storage_bytes: Maximum total storage per user in bytes
            max_file_count: Maximum number of files per user
            max_file_size_bytes: Maximum individual file size in bytes

        Returns:
            Tuple of (is_valid: bool, error_message: str | None)
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
