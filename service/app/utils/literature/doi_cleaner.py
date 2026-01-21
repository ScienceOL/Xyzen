"""
DOI normalization and deduplication utilities
"""

import re
from typing import Protocol, TypeVar


class WorkWithDOI(Protocol):
    """Protocol for objects with DOI and citation information"""

    doi: str | None
    cited_by_count: int
    publication_year: int | None


T = TypeVar("T", bound=WorkWithDOI)


def normalize_doi(doi: str | None) -> str | None:
    """
    Normalize DOI format to standard form

    Removes common prefixes, validates format, and converts to lowercase.
    DOI specification (ISO 26324) defines DOI matching as case-insensitive,
    so lowercase conversion is safe and improves consistency.

    Args:
        doi: DOI string in any common format

    Returns:
        Normalized DOI (e.g., "10.1038/nature12345") or None if invalid

    Examples:
        >>> normalize_doi("https://doi.org/10.1038/nature12345")
        "10.1038/nature12345"
        >>> normalize_doi("DOI: 10.1038/nature12345")
        "10.1038/nature12345"
        >>> normalize_doi("doi:10.1038/nature12345")
        "10.1038/nature12345"
    """
    if not doi:
        return None

    doi = doi.strip().lower()

    # Remove common prefixes
    doi = re.sub(r"^(https?://)?(dx\.)?doi\.org/", "", doi)
    doi = re.sub(r"^doi:\s*", "", doi)

    # Validate format (10.xxxx/yyyy)
    return doi if re.match(r"^10\.\d+/.+", doi) else None


def deduplicate_by_doi(works: list[T]) -> list[T]:
    """
    Deduplicate works by DOI, keeping the highest priority version

    Priority rules:
    1. Works with DOI take priority over those without
    2. For same DOI, keep the one with higher citation count
    3. If citation count is equal, keep the most recently published

    Args:
        works: List of LiteratureWork objects

    Returns:
        Deduplicated list of works

    Examples:
        >>> works = [
        ...     LiteratureWork(doi="10.1038/1", cited_by_count=100, ...),
        ...     LiteratureWork(doi="10.1038/1", cited_by_count=50, ...),
        ...     LiteratureWork(doi=None, ...),
        ... ]
        >>> unique = deduplicate_by_doi(works)
        >>> len(unique)
        2
        >>> unique[0].cited_by_count
        100
    """
    # Group by: with DOI vs without DOI
    with_doi: dict[str, T] = {}
    without_doi: list[T] = []

    for work in works:
        # Check if work has doi attribute
        if not work.doi:
            without_doi.append(work)
            continue

        doi = normalize_doi(work.doi)
        if not doi:
            without_doi.append(work)
            continue

        # If DOI already exists, compare priority
        if doi in with_doi:
            existing = with_doi[doi]

            # Higher citation count?
            if work.cited_by_count > existing.cited_by_count:
                with_doi[doi] = work
            # Same citation count, more recent publication?
            elif (
                work.cited_by_count == existing.cited_by_count
                and work.publication_year
                and existing.publication_year
                and work.publication_year > existing.publication_year
            ):
                with_doi[doi] = work
        else:
            with_doi[doi] = work

    # Combine results: DOI works first, then non-DOI works
    return list(with_doi.values()) + without_doi
