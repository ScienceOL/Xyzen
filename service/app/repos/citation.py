import logging
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.citation import Citation as CitationModel
from app.models.citation import CitationCreate, CitationRead

logger = logging.getLogger(__name__)


class CitationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_citation_by_id(self, citation_id: UUID) -> CitationModel | None:
        """
        Fetches a citation by its ID.

        Args:
            citation_id: The UUID of the citation to fetch.

        Returns:
            The CitationModel, or None if not found.
        """
        logger.debug(f"Fetching citation with id: {citation_id}")
        return await self.db.get(CitationModel, citation_id)

    async def get_citations_by_message(self, message_id: UUID) -> list[CitationModel]:
        """
        Fetches all citations for a given message.

        Args:
            message_id: The UUID of the message.

        Returns:
            List of CitationModel instances.
        """
        logger.debug(f"Fetching citations for message_id: {message_id}")
        statement = select(CitationModel).where(CitationModel.message_id == message_id)
        result = await self.db.exec(statement)
        return list(result.all())

    async def create_citation(self, citation_data: CitationCreate) -> CitationModel:
        """
        Creates a new citation for a message.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the citation object is populated with DB-defaults before being returned.

        Args:
            citation_data: The Pydantic model containing the data for the new citation.

        Returns:
            The newly created CitationModel instance.
        """
        logger.debug(f"Creating new citation for message_id: {citation_data.message_id}")
        citation = CitationModel.model_validate(citation_data)
        self.db.add(citation)
        await self.db.flush()
        await self.db.refresh(citation)
        return citation

    async def bulk_create_citations(self, citations_data: list[CitationCreate]) -> list[CitationModel]:
        """
        Creates multiple citations in bulk.
        This function does NOT commit the transaction, but it does flush the session.

        Args:
            citations_data: List of CitationCreate models.

        Returns:
            List of newly created CitationModel instances.
        """
        if not citations_data:
            return []

        logger.debug(f"Bulk creating {len(citations_data)} citations")
        citations = [CitationModel.model_validate(data) for data in citations_data]
        self.db.add_all(citations)
        await self.db.flush()

        # Refresh all citations to get DB-generated fields
        for citation in citations:
            await self.db.refresh(citation)

        return citations

    async def delete_citation(self, citation_id: UUID) -> bool:
        """
        Deletes a citation by its ID.
        This function does NOT commit the transaction.

        Args:
            citation_id: The UUID of the citation to delete.

        Returns:
            True if the citation was deleted, False if not found.
        """
        logger.debug(f"Deleting citation with id: {citation_id}")
        citation = await self.db.get(CitationModel, citation_id)
        if not citation:
            return False

        await self.db.delete(citation)
        await self.db.flush()
        return True

    async def delete_citations_by_message(self, message_id: UUID) -> int:
        """
        Deletes all citations for a given message.
        This function does NOT commit the transaction.

        Args:
            message_id: The UUID of the message.

        Returns:
            Number of citations deleted.
        """
        logger.debug(f"Deleting all citations for message_id: {message_id}")
        statement = select(CitationModel).where(CitationModel.message_id == message_id)
        result = await self.db.exec(statement)
        citations = list(result.all())

        count = 0
        for citation in citations:
            await self.db.delete(citation)
            count += 1

        if count > 0:
            await self.db.flush()

        return count

    async def get_citations_as_read(self, message_id: UUID) -> list[CitationRead]:
        """
        Fetches citations for a message as CitationRead models.

        Args:
            message_id: The UUID of the message.

        Returns:
            List of CitationRead instances.
        """
        citations = await self.get_citations_by_message(message_id)
        return [CitationRead.model_validate(citation) for citation in citations]
