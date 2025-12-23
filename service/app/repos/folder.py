import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.folder import Folder, FolderCreate, FolderUpdate

logger = logging.getLogger(__name__)


class FolderRepository:
    """Folder storage data access layer"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_folder(self, folder_data: FolderCreate, user_id: str) -> Folder:
        """
        Creates a new folder record.
        """
        logger.debug(f"Creating new folder for user: {user_id}")
        folder = Folder(
            user_id=user_id,
            parent_id=folder_data.parent_id,
            name=folder_data.name,
        )
        self.db.add(folder)
        await self.db.flush()
        await self.db.refresh(folder)
        return folder

    async def get_folder_by_id(self, folder_id: UUID) -> Folder | None:
        """
        Fetches a folder by its ID.
        """
        logger.debug(f"Fetching folder with id: {folder_id}")
        return await self.db.get(Folder, folder_id)

    async def get_folders_by_user(
        self,
        user_id: str,
        parent_id: UUID | None = None,
        include_deleted: bool = False,
    ) -> list[Folder]:
        """
        Fetches folders for a given user, optionally filtered by parent folder.
        """
        logger.debug(f"Fetching folders for user_id: {user_id}, parent_id: {parent_id}")
        statement = select(Folder).where(Folder.user_id == user_id)

        if not include_deleted:
            statement = statement.where(col(Folder.is_deleted).is_(False))

        statement = statement.where(Folder.parent_id == parent_id)
        statement = statement.order_by(col(Folder.name).asc())

        result = await self.db.exec(statement)
        return list(result.all())

    async def update_folder(self, folder_id: UUID, folder_data: FolderUpdate) -> Folder | None:
        """
        Updates a folder record.
        """
        logger.debug(f"Updating folder with id: {folder_id}")
        folder = await self.db.get(Folder, folder_id)
        if not folder:
            return None

        update_dict = folder_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(folder, key, value)

        folder.updated_at = datetime.now(timezone.utc)
        self.db.add(folder)
        await self.db.flush()
        await self.db.refresh(folder)
        return folder

    async def soft_delete_folder(self, folder_id: UUID) -> bool:
        """
        Soft deletes a folder.
        """
        logger.debug(f"Soft deleting folder with id: {folder_id}")
        folder = await self.db.get(Folder, folder_id)
        if not folder:
            return False

        folder.is_deleted = True
        folder.deleted_at = datetime.now(timezone.utc)
        folder.updated_at = datetime.now(timezone.utc)
        self.db.add(folder)
        await self.db.flush()
        return True

    async def restore_folder(self, folder_id: UUID) -> bool:
        """
        Restores a soft-deleted folder.
        """
        logger.debug(f"Restoring folder with id: {folder_id}")
        folder = await self.db.get(Folder, folder_id)
        if not folder:
            return False

        folder.is_deleted = False
        folder.deleted_at = None
        folder.updated_at = datetime.now(timezone.utc)
        self.db.add(folder)
        await self.db.flush()
        return True

    async def hard_delete_folder_recursive(self, folder_id: UUID) -> None:
        """
        Recursively hard deletes a folder and all its contents (files and subfolders).
        """
        logger.debug(f"Recursively hard deleting folder: {folder_id}")

        # 1. Fetch direct subfolders
        statement = select(Folder).where(Folder.parent_id == folder_id)
        # We need to find ALL (including soft deleted) because we are hard deleting
        subfolders = (await self.db.exec(statement)).all()

        # 2. Recursively delete subfolders
        for subfolder in subfolders:
            await self.hard_delete_folder_recursive(subfolder.id)

        # 3. Delete files in THIS folder
        # We need to import File model or use raw SQL.
        # Since we are in FolderRepo, better to use SQLModel but we need File model availability.
        # It's better to avoid circular imports. We can do a delete statement.
        from app.models.file import File

        # Delete files
        delete_files_stmt = select(File).where(File.folder_id == folder_id)
        files = (await self.db.exec(delete_files_stmt)).all()
        for file in files:
            await self.db.delete(file)

        # 4. Delete THIS folder
        folder = await self.db.get(Folder, folder_id)
        if folder:
            await self.db.delete(folder)

        await self.db.flush()

    async def get_folder_path(self, folder_id: UUID) -> list[Folder]:
        """

        Retrieves the path (list of ancestors) for a given folder, starting from root.

        """
        path = []
        current_id = folder_id
        # Simple iterative approach to walk up the tree
        while current_id:
            folder = await self.db.get(Folder, current_id)
            if not folder:
                break
            path.insert(0, folder)  # Prepend to list
            current_id = folder.parent_id
        return path

    async def is_descendant(self, ancestor_id: UUID, target_id: UUID) -> bool:
        """

        Checks if target_id is a descendant of (or is the same as) ancestor_id.

        Used to prevent circular moves (e.g. moving A into child B).

        """
        if ancestor_id == target_id:
            return True
        current_id = target_id
        while current_id:
            folder = await self.db.get(Folder, current_id)
            if not folder:
                return False
            if folder.parent_id == ancestor_id:
                return True
            current_id = folder.parent_id
        return False
