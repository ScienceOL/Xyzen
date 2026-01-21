"""
Abstract base class for literature data source clients
"""

from abc import ABC, abstractmethod

from .models import LiteratureWork, SearchRequest


class BaseLiteratureClient(ABC):
    """
    Base class for literature data source clients

    All data source implementations (OpenAlex, Semantic Scholar, PubMed, etc.)
    should inherit from this class and implement the required methods.
    """

    @abstractmethod
    async def search(self, request: SearchRequest) -> tuple[list[LiteratureWork], list[str]]:
        """
        Execute search and return results in standard format

        Args:
            request: Standardized search request

        Returns:
            Tuple of (works, warnings) where warnings is a list of messages for LLM feedback

        Raises:
            Exception: If search fails after retries
        """
        pass
