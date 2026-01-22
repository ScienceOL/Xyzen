"""
Shared data models for literature utilities
"""

from dataclasses import dataclass, field
from typing import Any


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
        access_url: Best available access link (OA, landing page, or DOI)
        primary_institution: First affiliated institution (if available)
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
    source: str
    access_url: str | None = None
    primary_institution: str | None = None
    raw_data: dict[str, Any] = field(default_factory=dict)
