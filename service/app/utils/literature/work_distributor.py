"""
Work distributor for coordinating multiple literature data sources
"""

import inspect
import logging
from typing import Any

from .doi_cleaner import deduplicate_by_doi
from .models import LiteratureWork, SearchRequest

logger = logging.getLogger(__name__)


class WorkDistributor:
    """
    Distribute search requests to multiple literature data sources
    and aggregate results
    """

    def __init__(self, openalex_email: str | None = None) -> None:
        """
        Initialize distributor with available clients

        Args:
            openalex_email: Email for OpenAlex polite pool (required for OpenAlex)
        """
        self.clients: dict[str, Any] = {}
        self.openalex_email = openalex_email
        self._register_clients()

    def _register_clients(self) -> None:
        """Register available data source clients"""
        # Import here to avoid circular dependencies
        try:
            from .openalex_client import OpenAlexClient

            self.clients["openalex"] = OpenAlexClient(email=self.openalex_email)
            logger.info("Registered OpenAlex client")
        except ImportError as e:
            logger.warning(f"Failed to register OpenAlex client: {e}")

        # Future: Add more clients
        # from .semantic_scholar_client import SemanticScholarClient
        # self.clients["semantic_scholar"] = SemanticScholarClient()

    async def close(self) -> None:
        """Close any underlying HTTP clients"""
        for client in self.clients.values():
            close_method = getattr(client, "close", None)
            if callable(close_method):
                result = close_method()
                if inspect.isawaitable(result):
                    await result

    async def __aenter__(self) -> "WorkDistributor":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: Any | None,
    ) -> None:
        await self.close()

    async def search(self, request: SearchRequest) -> dict[str, Any]:
        """
        Execute search across multiple data sources and aggregate results

        Args:
            request: Standardized search request

        Returns:
            Dictionary containing:
                - total_count: Total number of works fetched (before dedup)
                - unique_count: Number of unique works (after dedup)
                - sources: Dict of source name -> count
                - works: List of deduplicated LiteratureWork objects
                - warnings: List of warning/info messages for LLM feedback

        Examples:
            >>> distributor = WorkDistributor()
            >>> request = SearchRequest(query="machine learning", max_results=50)
            >>> result = await distributor.search(request)
            >>> print(f"Found {result['unique_count']} unique works")
        """
        # Clamp max_results to 50/1000 with warnings
        all_warnings: list[str] = []
        if request.max_results < 1:
            all_warnings.append("⚠️ max_results < 1; using default 50")
            request.max_results = 50
        elif request.max_results > 1000:
            all_warnings.append("⚠️ max_results > 1000; using 1000")
            request.max_results = 1000

        # Determine which data sources to use
        sources = request.data_sources or ["openalex"]
        unknown_sources = [source_name for source_name in sources if source_name not in self.clients]
        if unknown_sources:
            all_warnings.append("⚠️ Unknown data_sources ignored: " + ", ".join(sorted(set(unknown_sources))))

        # Collect works and warnings from all sources
        all_works: list[LiteratureWork] = []
        source_counts: dict[str, int] = {}

        for source_name in sources:
            if client := self.clients.get(source_name):
                try:
                    logger.info("Fetching from %s...", source_name)
                    works, warnings_data = await client.search(request)
                    all_warnings.extend(warnings_data)

                    all_works.extend(works)
                    source_counts[source_name] = len(works)
                    logger.info("Fetched %d works from %s", len(works), source_name)
                except Exception as e:
                    logger.error(f"Error fetching from {source_name}: {e}", exc_info=True)
                    source_counts[source_name] = 0
                    all_warnings.append(f"⚠️ Error fetching from {source_name}: {str(e)}")
            else:
                logger.warning(f"Data source '{source_name}' not available")

        # Deduplicate by DOI
        logger.info("Deduplicating %d works...", len(all_works))
        unique_works = deduplicate_by_doi(all_works)
        logger.info("After deduplication: %d unique works", len(unique_works))

        # Sort results
        unique_works = self._sort_works(unique_works, request.sort_by)

        # Limit to max_results
        unique_works = unique_works[: request.max_results]

        return {
            "total_count": len(all_works),
            "unique_count": len(unique_works),
            "sources": source_counts,
            "works": unique_works,
            "warnings": all_warnings,
        }

    def _sort_works(self, works: list[LiteratureWork], sort_by: str) -> list[LiteratureWork]:
        """
        Sort works by specified criteria

        Args:
            works: List of works to sort
            sort_by: Sort method - "relevance", "cited_by_count", "publication_date"

        Returns:
            Sorted list of works
        """
        if sort_by == "cited_by_count":
            return sorted(works, key=lambda w: w.cited_by_count, reverse=True)
        elif sort_by == "publication_date":
            return sorted(
                works,
                key=lambda w: w.publication_year or float("-inf"),
                reverse=True,
            )
        else:  # relevance or default
            # For relevance, keep original order (API returns by relevance)
            return works
