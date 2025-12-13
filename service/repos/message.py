import logging
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from middleware.database.connection import AsyncSessionLocal
from models.file import FileRead, FileReadWithUrl
from models.message import Message as MessageModel
from models.message import (
    MessageCreate,
    MessageReadWithCitations,
    MessageReadWithFiles,
    MessageReadWithFilesAndCitations,
)

logger = logging.getLogger(__name__)


class MessageRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_message_by_id(self, message_id: UUID) -> MessageModel | None:
        """
        Fetches a message by its ID.

        Args:
            message_id: The UUID of the message to fetch.

        Returns:
            The MessageModel, or None if not found.
        """
        logger.debug(f"Fetching message with id: {message_id}")
        return await self.db.get(MessageModel, message_id)

    async def get_messages_by_topic(
        self, topic_id: UUID, order_by_created: bool = True, limit: int | None = None
    ) -> list[MessageModel]:
        """
        Fetches all messages for a given topic.

        Args:
            topic_id: The UUID of the topic.
            order_by_created: If True, orders by created_at ascending.
            limit: Optional limit on the number of messages returned.

        Returns:
            List of MessageModel instances.
        """
        logger.debug(f"Fetching messages for topic_id: {topic_id}")
        statement = select(MessageModel).where(MessageModel.topic_id == topic_id)
        if order_by_created:
            statement = statement.order_by(MessageModel.created_at)  # type: ignore
        if limit is not None:
            statement = statement.limit(limit)
        result = await self.db.exec(statement)
        return list(result.all())

    async def create_message(self, message_data: MessageCreate) -> MessageModel:
        """
        Creates a new message within the given session.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the message object is populated with DB-defaults before being returned.

        Args:
            message_data: The Pydantic model containing the data for the new message.

        Returns:
            The newly created MessageModel instance.
        """
        logger.debug(f"Creating new message for topic_id: {message_data.topic_id}")
        message = MessageModel.model_validate(message_data)
        self.db.add(message)
        await self.db.flush()
        await self.db.refresh(message)
        return message

    async def delete_message(self, message_id: UUID, cascade_files: bool = True) -> bool:
        """
        Deletes a message by its ID with optional cascade deletion of associated files and citations.
        This function does NOT commit the transaction.

        Args:
            message_id: The UUID of the message to delete.
            cascade_files: If True, also deletes associated files from storage and database (default: True)

        Returns:
            True if the message was deleted, False if not found.
        """
        logger.debug(f"Deleting message with id: {message_id}, cascade_files: {cascade_files}")
        message = await self.db.get(MessageModel, message_id)
        if not message:
            return False

        # Delete associated citations (always cascade)
        from repos.citation import CitationRepository

        citation_repo = CitationRepository(self.db)
        deleted_citations = await citation_repo.delete_citations_by_message(message_id)
        if deleted_citations > 0:
            logger.info(f"Deleted {deleted_citations} citations for message {message_id}")

        # Delete associated files if cascade is enabled
        if cascade_files:
            from core.storage import get_storage_service
            from repos.file import FileRepository

            file_repo = FileRepository(self.db)
            files = await file_repo.get_files_by_message(message_id)

            if files:
                storage = get_storage_service()
                storage_keys = [file.storage_key for file in files]

                # Delete from object storage
                try:
                    await storage.delete_files(storage_keys)
                    logger.info(f"Deleted {len(storage_keys)} files from storage for message {message_id}")
                except Exception as e:
                    logger.error(f"Failed to delete files from storage for message {message_id}: {e}")
                    # Continue with database deletion even if storage deletion fails

                # Delete file records from database
                for file in files:
                    await file_repo.hard_delete_file(file.id)

                logger.info(f"Deleted {len(files)} file records for message {message_id}")

        await self.db.delete(message)
        await self.db.flush()
        return True

    async def delete_messages_by_topic(self, topic_id: UUID, cascade_files: bool = True) -> int:
        """
        Deletes all messages for a given topic with optional cascade deletion of files.
        This function does NOT commit the transaction.

        Args:
            topic_id: The UUID of the topic.
            cascade_files: If True, also deletes associated files from storage and database (default: True)

        Returns:
            Number of messages deleted.
        """
        logger.debug(f"Deleting all messages for topic_id: {topic_id}, cascade_files: {cascade_files}")
        statement = select(MessageModel).where(MessageModel.topic_id == topic_id)
        result = await self.db.exec(statement)
        messages = list(result.all())

        count = 0
        for message in messages:
            # Use delete_message with cascade to handle files
            if await self.delete_message(message.id, cascade_files=cascade_files):
                count += 1

        return count

    async def bulk_delete_messages(self, message_ids: list[UUID], cascade_files: bool = True) -> int:
        """
        Deletes multiple messages by their IDs with optional cascade deletion of files.
        This function does NOT commit the transaction.

        Args:
            message_ids: List of message UUIDs to delete.
            cascade_files: If True, also deletes associated files from storage and database (default: True)

        Returns:
            Number of messages deleted.
        """
        logger.debug(f"Bulk deleting {len(message_ids)} messages, cascade_files: {cascade_files}")
        count = 0
        for message_id in message_ids:
            if await self.delete_message(message_id, cascade_files=cascade_files):
                count += 1
        return count

    async def create_message_in_isolated_transaction(self, message_data: MessageCreate) -> None:
        """
        Creates and commits a tool event message in a separate, short-lived session.

        This is used to persist tool call/response events immediately without
        interfering with the main chat session's transaction state.

        Args:
            message_data: The Pydantic model containing the data for the new message.
        """
        logger.debug(f"Creating isolated tool event message for topic_id: {message_data.topic_id}")
        async with AsyncSessionLocal() as db:
            isolated_repo = MessageRepository(db)
            await isolated_repo.create_message(message_data=message_data)
            await db.commit()

    async def get_messages_with_files(
        self, topic_id: UUID, order_by_created: bool = True, limit: int | None = None
    ) -> list[MessageReadWithFiles]:
        """
        Fetches messages for a topic with their file attachments.

        Args:
            topic_id: The UUID of the topic.
            order_by_created: If True, orders by created_at ascending.
            limit: Optional limit on the number of messages returned.

        Returns:
            List of MessageReadWithFiles instances with attachments populated.
        """
        from repos.file import FileRepository

        logger.debug(f"Fetching messages with files for topic_id: {topic_id}")

        # Get messages
        messages = await self.get_messages_by_topic(topic_id, order_by_created, limit)

        # Get files for each message
        file_repo = FileRepository(self.db)
        messages_with_files = []

        for message in messages:
            files = await file_repo.get_files_by_message(message.id)

            # Add download URLs to file records using backend API endpoint
            file_reads_with_urls: list[FileReadWithUrl | FileRead] = []
            for file in files:
                try:
                    # Use backend download endpoint instead of presigned URL
                    # This works from browser (presigned URLs with host.docker.internal don't)
                    download_url = f"/xyzen/api/v1/files/{file.id}/download"

                    file_with_url = FileReadWithUrl(
                        **file.model_dump(),
                        download_url=download_url,
                    )
                    file_reads_with_urls.append(file_with_url)
                except Exception as e:
                    logger.warning(f"Failed to generate download URL for file {file.id}: {e}")
                    # Fall back to FileRead without URL
                    file_reads_with_urls.append(FileRead.model_validate(file))

            message_with_files = MessageReadWithFiles(
                id=message.id,
                role=message.role,
                content=message.content,
                topic_id=message.topic_id,
                created_at=message.created_at,
                attachments=file_reads_with_urls,
            )
            messages_with_files.append(message_with_files)

        return messages_with_files

    async def get_message_with_files(self, message_id: UUID) -> MessageReadWithFiles | None:
        """
        Fetches a single message with its file attachments.

        Args:
            message_id: The UUID of the message.

        Returns:
            MessageReadWithFiles instance with attachments populated, or None if not found.
        """
        from repos.file import FileRepository

        logger.debug(f"Fetching message with files for message_id: {message_id}")

        # Get the message
        message = await self.get_message_by_id(message_id)
        if not message:
            return None

        # Get files for the message
        file_repo = FileRepository(self.db)
        files = await file_repo.get_files_by_message(message.id)

        # Add download URLs to file records using backend API endpoint
        file_reads_with_urls = []
        for file in files:
            try:
                # Use backend download endpoint instead of presigned URL
                # This works from browser (presigned URLs with host.docker.internal don't)
                download_url = f"/xyzen/api/v1/files/{file.id}/download"

                file_with_url = FileReadWithUrl(
                    **file.model_dump(),
                    download_url=download_url,
                )
                file_reads_with_urls.append(file_with_url)
            except Exception as e:
                logger.warning(f"Failed to generate download URL for file {file.id}: {e}")
                # Fall back to FileRead without URL
                file_reads_with_urls.append(FileRead.model_validate(file))

        message_with_files = MessageReadWithFiles(
            id=message.id,
            role=message.role,
            content=message.content,
            topic_id=message.topic_id,
            created_at=message.created_at,
            attachments=file_reads_with_urls,
        )

        return message_with_files

    async def get_messages_with_citations(
        self, topic_id: UUID, order_by_created: bool = True, limit: int | None = None
    ) -> list[MessageReadWithCitations]:
        """
        Fetches messages for a topic with their citations.

        Args:
            topic_id: The UUID of the topic.
            order_by_created: If True, orders by created_at ascending.
            limit: Optional limit on the number of messages returned.

        Returns:
            List of MessageReadWithCitations instances with citations populated.
        """
        from repos.citation import CitationRepository

        logger.debug(f"Fetching messages with citations for topic_id: {topic_id}")

        # Get messages
        messages = await self.get_messages_by_topic(topic_id, order_by_created, limit)

        # Get citations for each message
        citation_repo = CitationRepository(self.db)
        messages_with_citations = []

        for message in messages:
            citations = await citation_repo.get_citations_as_read(message.id)

            message_with_citations = MessageReadWithCitations(
                id=message.id,
                role=message.role,
                content=message.content,
                topic_id=message.topic_id,
                created_at=message.created_at,
                citations=citations,
            )
            messages_with_citations.append(message_with_citations)

        return messages_with_citations

    async def get_messages_with_files_and_citations(
        self, topic_id: UUID, order_by_created: bool = True, limit: int | None = None
    ) -> list[MessageReadWithFilesAndCitations]:
        """
        Fetches messages for a topic with both file attachments and citations.

        Args:
            topic_id: The UUID of the topic.
            order_by_created: If True, orders by created_at ascending.
            limit: Optional limit on the number of messages returned.

        Returns:
            List of MessageReadWithFilesAndCitations instances with attachments and citations populated.
        """
        from repos.citation import CitationRepository
        from repos.file import FileRepository

        logger.debug(f"Fetching messages with files and citations for topic_id: {topic_id}")

        # Get messages
        messages = await self.get_messages_by_topic(topic_id, order_by_created, limit)

        # Get files and citations for each message
        file_repo = FileRepository(self.db)
        citation_repo = CitationRepository(self.db)
        messages_with_files_and_citations = []

        for message in messages:
            # Get files
            files = await file_repo.get_files_by_message(message.id)
            file_reads_with_urls: list[FileReadWithUrl | FileRead] = []
            for file in files:
                try:
                    download_url = f"/xyzen/api/v1/files/{file.id}/download"
                    file_with_url = FileReadWithUrl(
                        **file.model_dump(),
                        download_url=download_url,
                    )
                    file_reads_with_urls.append(file_with_url)
                except Exception as e:
                    logger.warning(f"Failed to generate download URL for file {file.id}: {e}")
                    file_reads_with_urls.append(FileRead.model_validate(file))

            # Get citations
            citations = await citation_repo.get_citations_as_read(message.id)

            message_with_files_and_citations = MessageReadWithFilesAndCitations(
                id=message.id,
                role=message.role,
                content=message.content,
                topic_id=message.topic_id,
                created_at=message.created_at,
                attachments=file_reads_with_urls,
                citations=citations,
            )
            messages_with_files_and_citations.append(message_with_files_and_citations)

        return messages_with_files_and_citations

    async def get_message_with_citations(self, message_id: UUID) -> MessageReadWithCitations | None:
        """
        Fetches a single message with its citations.

        Args:
            message_id: The UUID of the message.

        Returns:
            MessageReadWithCitations instance with citations populated, or None if not found.
        """
        from repos.citation import CitationRepository

        logger.debug(f"Fetching message with citations for message_id: {message_id}")

        # Get the message
        message = await self.get_message_by_id(message_id)
        if not message:
            return None

        # Get citations for the message
        citation_repo = CitationRepository(self.db)
        citations = await citation_repo.get_citations_as_read(message.id)

        message_with_citations = MessageReadWithCitations(
            id=message.id,
            role=message.role,
            content=message.content,
            topic_id=message.topic_id,
            created_at=message.created_at,
            citations=citations,
        )

        return message_with_citations
