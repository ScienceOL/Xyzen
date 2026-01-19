"""
Work distributor for coordinating multiple literature data sources
"""

import logging
from dataclasses import dataclass, field
from typing import Any, cast

from .doi_cleaner import deduplicate_by_doi

logger = logging.getLogger(__name__)


@dataclass
class SearchRequest:
    """
    Standardized search request format for all data sources

    Attributes:
        query: Search keywords (searches title, abstract, full text)
        author: Author name (will be converted to author ID)
        institution: Institution name (will be converted to institution ID)
        source: Journal or conference name
        year_from: Start year (inclusive)
        year_to: End year (inclusive)
        is_oa: Filter for open access only
        work_type: Work type filter ("article", "review", "preprint", etc.)
        language: Language code filter (e.g., "en", "zh", "fr")
        is_retracted: Filter for retracted works (True to include only retracted, False to exclude)
        has_abstract: Filter for works with abstracts
        has_fulltext: Filter for works with full text available
        sort_by: Sort method - "relevance", "cited_by_count", "publication_date"
        max_results: Maximum number of results to return
        data_sources: List of data sources to query (default: ["openalex"])
    """

    query: str
    author: str | None = None
    institution: str | None = None
    source: str | None = None
    year_from: int | None = None
    year_to: int | None = None
    is_oa: bool | None = None
    work_type: str | None = None
    language: str | None = None
    is_retracted: bool | None = None
    has_abstract: bool | None = None
    has_fulltext: bool | None = None
    sort_by: str = "relevance"
    max_results: int = 50
    data_sources: list[str] | None = None


@dataclass
class LiteratureWork:
    """
    Standardized literature work format across all data sources

    Attributes:
        id: Internal ID from the data source
        doi: Digital Object Identifier (normalized format)
        title: Work title
        authors: List of author information [{"name": "...", "id": "..."}]
        publication_year: Year of publication
        cited_by_count: Number of citations
        abstract: Abstract text
        journal: Journal or venue name
        is_oa: Whether open access
        oa_url: URL to open access version
        source: Data source name ("openalex", "semantic_scholar", etc.)
        raw_data: Original data from the source (for debugging)
    """

    id: str
    doi: str | None
    title: str
    authors: list[dict[str, str | None]]
    publication_year: int | None
    cited_by_count: int
    abstract: str | None
    journal: str | None
    is_oa: bool
    oa_url: str | None
    source: str
    raw_data: dict[str, Any] = field(default_factory=dict)


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

            if self.openalex_email:
                self.clients["openalex"] = OpenAlexClient(email=self.openalex_email)
                logger.info("Registered OpenAlex client")
            else:
                logger.warning("OpenAlex email not provided, skipping OpenAlex client registration")
        except ImportError as e:
            logger.warning(f"Failed to register OpenAlex client: {e}")

        # Future: Add more clients
        # from .semantic_scholar_client import SemanticScholarClient
        # self.clients["semantic_scholar"] = SemanticScholarClient()

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
        # Determine which data sources to use
        sources = request.data_sources or ["openalex"]

        # Collect works and warnings from all sources
        all_works: list[LiteratureWork] = []
        all_warnings: list[str] = []
        source_counts: dict[str, int] = {}

        for source_name in sources:
            if client := self.clients.get(source_name):
                try:
                    logger.info(f"Fetching from {source_name}...")
                    # Check if client returns warnings (new format) or just works (old format)
                    result = await client.search(request)

                    # Type narrowing: handle both tuple and list return types
                    if isinstance(result, tuple):
                        # New format: (works, warnings)
                        result_tuple = cast(tuple[list[LiteratureWork], list[str]], result)
                        if len(result_tuple) == 2:
                            works, warnings_data = result_tuple
                            all_warnings.extend(warnings_data)
                        else:
                            # Unexpected tuple length, treat as error
                            logger.warning(f"Unexpected tuple length from {source_name}: {len(result_tuple)}")
                            continue
                    else:
                        # Old format: just works list
                        works = cast(list[LiteratureWork], result)

                    all_works.extend(works)
                    source_counts[source_name] = len(works)
                    logger.info(f"Fetched {len(works)} works from {source_name}")
                except Exception as e:
                    logger.error(f"Error fetching from {source_name}: {e}", exc_info=True)
                    source_counts[source_name] = 0
                    all_warnings.append(f"⚠️ Error fetching from {source_name}: {str(e)}")
            else:
                logger.warning(f"Data source '{source_name}' not available")

        # Deduplicate by DOI
        logger.info(f"Deduplicating {len(all_works)} works...")
        unique_works = deduplicate_by_doi(all_works)
        logger.info(f"After deduplication: {len(unique_works)} unique works")

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
                key=lambda w: w.publication_year if w.publication_year else 0,
                reverse=True,
            )
        else:  # relevance or default
            # For relevance, keep original order (API returns by relevance)
            return works
