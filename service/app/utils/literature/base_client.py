"""
Abstract base class for literature data source clients
"""

from abc import ABC, abstractmethod

from .work_distributor import LiteratureWork, SearchRequest


class BaseLiteratureClient(ABC):
    """
    Base class for literature data source clients

    All data source implementations (OpenAlex, Semantic Scholar, PubMed, etc.)
    should inherit from this class and implement the required methods.
    """

    @abstractmethod
    async def search(self, request: SearchRequest) -> list[LiteratureWork] | tuple[list[LiteratureWork], list[str]]:
        """
        Execute search and return results in standard format

        Args:
            request: Standardized search request

        Returns:
            Either:
            - List of literature works in standard format (legacy format)
            - Tuple of (works, warnings) where warnings is a list of messages for LLM feedback (new format)

        Raises:
            Exception: If search fails after retries
        """
        pass

    @abstractmethod
    async def get_by_doi(self, doi: str) -> LiteratureWork | None:
        """
        Get a single work by DOI

        Args:
            doi: Digital Object Identifier

        Returns:
            Literature work if found, None otherwise
        """
        pass

    @abstractmethod
    async def get_by_id(self, work_id: str) -> LiteratureWork | None:
        """
        Get a single work by data source internal ID

        Args:
            work_id: Internal ID in the data source

        Returns:
            Literature work if found, None otherwise
        """
        pass
