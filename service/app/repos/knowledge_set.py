import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.file_knowledge_set_link import FileKnowledgeSetLink
from app.models.knowledge_set import KnowledgeSet, KnowledgeSetCreate, KnowledgeSetUpdate

logger = logging.getLogger(__name__)


class KnowledgeSetRepository:
    """Knowledge set data access layer"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_knowledge_set(self, knowledge_set_data: KnowledgeSetCreate, user_id: str) -> KnowledgeSet:
        """
        Creates a new knowledge set record.
        """
        logger.debug(f"Creating new knowledge set for user: {user_id}")
        knowledge_set = KnowledgeSet(
            user_id=user_id,
            name=knowledge_set_data.name,
            description=knowledge_set_data.description,
        )
        self.db.add(knowledge_set)
        await self.db.flush()
        await self.db.refresh(knowledge_set)
        return knowledge_set

    async def get_knowledge_set_by_id(self, knowledge_set_id: UUID) -> KnowledgeSet | None:
        """
        Fetches a knowledge set by its ID.
        """
        logger.debug(f"Fetching knowledge set with id: {knowledge_set_id}")
        return await self.db.get(KnowledgeSet, knowledge_set_id)

    async def get_knowledge_sets_by_user(
        self,
        user_id: str,
        include_deleted: bool = False,
    ) -> list[KnowledgeSet]:
        """
        Fetches knowledge sets for a given user.
        """
        logger.debug(f"Fetching knowledge sets for user_id: {user_id}")
        statement = select(KnowledgeSet).where(KnowledgeSet.user_id == user_id)

        if not include_deleted:
            statement = statement.where(col(KnowledgeSet.is_deleted).is_(False))

        statement = statement.order_by(col(KnowledgeSet.name).asc())

        result = await self.db.exec(statement)
        return list(result.all())

    async def update_knowledge_set(
        self, knowledge_set_id: UUID, knowledge_set_data: KnowledgeSetUpdate
    ) -> KnowledgeSet | None:
        """
        Updates a knowledge set record.
        """
        logger.debug(f"Updating knowledge set with id: {knowledge_set_id}")
        knowledge_set = await self.db.get(KnowledgeSet, knowledge_set_id)
        if not knowledge_set:
            return None

        update_dict = knowledge_set_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(knowledge_set, key, value)

        knowledge_set.updated_at = datetime.now(timezone.utc)
        self.db.add(knowledge_set)
        await self.db.flush()
        await self.db.refresh(knowledge_set)
        return knowledge_set

    async def soft_delete_knowledge_set(self, knowledge_set_id: UUID) -> bool:
        """
        Soft deletes a knowledge set.
        """
        logger.debug(f"Soft deleting knowledge set with id: {knowledge_set_id}")
        knowledge_set = await self.db.get(KnowledgeSet, knowledge_set_id)
        if not knowledge_set:
            return False

        knowledge_set.is_deleted = True
        knowledge_set.deleted_at = datetime.now(timezone.utc)
        knowledge_set.updated_at = datetime.now(timezone.utc)
        self.db.add(knowledge_set)
        await self.db.flush()
        return True

    async def restore_knowledge_set(self, knowledge_set_id: UUID) -> bool:
        """
        Restores a soft-deleted knowledge set.
        """
        logger.debug(f"Restoring knowledge set with id: {knowledge_set_id}")
        knowledge_set = await self.db.get(KnowledgeSet, knowledge_set_id)
        if not knowledge_set:
            return False

        knowledge_set.is_deleted = False
        knowledge_set.deleted_at = None
        knowledge_set.updated_at = datetime.now(timezone.utc)
        self.db.add(knowledge_set)
        await self.db.flush()
        return True

    async def validate_access(self, user_id: str, knowledge_set_id: UUID) -> None:
        """
        Validates that a knowledge set exists and belongs to the user.
        Raises ValueError if validation fails.

        Args:
            user_id: The user ID.
            knowledge_set_id: The UUID of the knowledge set.

        Raises:
            ValueError: If knowledge set not found, deleted, or access denied.
        """
        logger.debug(f"Validating access to knowledge set {knowledge_set_id} for user {user_id}")
        knowledge_set = await self.db.get(KnowledgeSet, knowledge_set_id)
        if not knowledge_set:
            raise ValueError("Knowledge set not found")
        if knowledge_set.user_id != user_id:
            raise ValueError("Access denied to knowledge set")
        if knowledge_set.is_deleted:
            raise ValueError("Knowledge set is deleted")

    async def get_knowledge_set_with_validation(self, user_id: str, knowledge_set_id: UUID) -> KnowledgeSet:
        """
        Gets a knowledge set with access validation.

        Args:
            user_id: The user ID.
            knowledge_set_id: The UUID of the knowledge set.

        Returns:
            The KnowledgeSet if valid.

        Raises:
            ValueError: If knowledge set not found, deleted, or access denied.
        """
        logger.debug(f"Getting knowledge set {knowledge_set_id} with validation for user {user_id}")
        await self.validate_access(user_id, knowledge_set_id)
        knowledge_set = await self.db.get(KnowledgeSet, knowledge_set_id)
        if not knowledge_set:
            raise ValueError("Knowledge set not found")
        return knowledge_set

    async def hard_delete_knowledge_set(self, knowledge_set_id: UUID) -> bool:
        """
        Permanently deletes a knowledge set and all its file links.
        """
        logger.debug(f"Hard deleting knowledge set with id: {knowledge_set_id}")

        # Delete all file links first
        statement = select(FileKnowledgeSetLink).where(FileKnowledgeSetLink.knowledge_set_id == knowledge_set_id)
        links = (await self.db.exec(statement)).all()
        for link in links:
            await self.db.delete(link)

        # Delete the knowledge set
        knowledge_set = await self.db.get(KnowledgeSet, knowledge_set_id)
        if not knowledge_set:
            return False

        await self.db.delete(knowledge_set)
        await self.db.flush()
        return True

    async def link_file_to_knowledge_set(self, file_id: UUID, knowledge_set_id: UUID) -> FileKnowledgeSetLink | None:
        """
        Links a file to a knowledge set.
        Returns None if the link already exists.
        """
        logger.debug(f"Linking file {file_id} to knowledge set {knowledge_set_id}")

        # Check if link already exists
        statement = select(FileKnowledgeSetLink).where(
            FileKnowledgeSetLink.file_id == file_id,
            FileKnowledgeSetLink.knowledge_set_id == knowledge_set_id,
        )
        existing_link = (await self.db.exec(statement)).first()
        if existing_link:
            logger.warning(f"Link already exists between file {file_id} and knowledge set {knowledge_set_id}")
            return None

        link = FileKnowledgeSetLink(
            file_id=file_id,
            knowledge_set_id=knowledge_set_id,
        )
        self.db.add(link)
        await self.db.flush()
        await self.db.refresh(link)
        return link

    async def unlink_file_from_knowledge_set(self, file_id: UUID, knowledge_set_id: UUID) -> bool:
        """
        Unlinks a file from a knowledge set.
        """
        logger.debug(f"Unlinking file {file_id} from knowledge set {knowledge_set_id}")

        statement = select(FileKnowledgeSetLink).where(
            FileKnowledgeSetLink.file_id == file_id,
            FileKnowledgeSetLink.knowledge_set_id == knowledge_set_id,
        )
        link = (await self.db.exec(statement)).first()
        if not link:
            return False

        await self.db.delete(link)
        await self.db.flush()
        return True

    async def get_files_in_knowledge_set(self, knowledge_set_id: UUID) -> list[UUID]:
        """
        Gets all file IDs linked to a knowledge set.
        """
        logger.debug(f"Fetching files in knowledge set {knowledge_set_id}")
        statement = select(FileKnowledgeSetLink.file_id).where(
            FileKnowledgeSetLink.knowledge_set_id == knowledge_set_id
        )
        result = await self.db.exec(statement)
        return list(result.all())

    async def get_knowledge_sets_for_file(self, file_id: UUID) -> list[UUID]:
        """
        Gets all knowledge set IDs that a file is linked to.
        """
        logger.debug(f"Fetching knowledge sets for file {file_id}")
        statement = select(FileKnowledgeSetLink.knowledge_set_id).where(
            FileKnowledgeSetLink.knowledge_set_id == file_id
        )
        result = await self.db.exec(statement)
        return list(result.all())

    async def get_file_count_in_knowledge_set(self, knowledge_set_id: UUID) -> int:
        """
        Gets the count of files linked to a knowledge set.
        """
        logger.debug(f"Counting files in knowledge set {knowledge_set_id}")
        statement = select(FileKnowledgeSetLink).where(FileKnowledgeSetLink.knowledge_set_id == knowledge_set_id)
        result = await self.db.exec(statement)
        return len(list(result.all()))

    async def bulk_link_files_to_knowledge_set(self, file_ids: list[UUID], knowledge_set_id: UUID) -> tuple[int, int]:
        """
        Links multiple files to a knowledge set.
        Returns tuple of (successful_links, skipped_existing_links).
        """
        logger.debug(f"Bulk linking {len(file_ids)} files to knowledge set {knowledge_set_id}")
        successful = 0
        skipped = 0

        for file_id in file_ids:
            link = await self.link_file_to_knowledge_set(file_id, knowledge_set_id)
            if link:
                successful += 1
            else:
                skipped += 1

        return successful, skipped

    async def bulk_unlink_files_from_knowledge_set(self, file_ids: list[UUID], knowledge_set_id: UUID) -> int:
        """
        Unlinks multiple files from a knowledge set.
        Returns count of successfully unlinked files.
        """
        logger.debug(f"Bulk unlinking {len(file_ids)} files from knowledge set {knowledge_set_id}")
        count = 0

        for file_id in file_ids:
            if await self.unlink_file_from_knowledge_set(file_id, knowledge_set_id):
                count += 1

        return count
