"""
Literature Search Tool

LangChain tool for searching academic literature from multiple data sources
(OpenAlex, Semantic Scholar, PubMed, etc.) with unified interface.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal

import httpx
from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from app.utils.literature import SearchRequest, WorkDistributor

logger = logging.getLogger(__name__)

TRUE_VALUES = frozenset({"true", "1", "yes"})
FALSE_VALUES = frozenset({"false", "0", "no"})


class LiteratureSearchInput(BaseModel):
    """Input schema for literature search tool."""

    query: str = Field(
        description="Search keywords (e.g., 'machine learning', 'CRISPR', 'cancer immunotherapy'). "
        "Most important parameter for accurate results."
    )
    mailto: str | None = Field(
        default=None,
        description="Email address to enable fast API pool at OpenAlex. "
        "STRONGLY RECOMMENDED - provides 10x faster searches. "
        "Example: 'researcher@university.edu'",
    )
    author: str | None = Field(
        default=None,
        description="Filter by author name (e.g., 'Albert Einstein', 'Jennifer Doudna'). "
        "Will auto-correct common misspellings.",
    )
    institution: str | None = Field(
        default=None,
        description="Filter by affiliation (e.g., 'MIT', 'Harvard', 'Stanford University'). "
        "Partial name matching supported.",
    )
    source: str | None = Field(
        default=None,
        description="Filter by journal/venue (e.g., 'Nature', 'Science', 'JAMA'). "
        "Matches both journal names and abbreviated titles.",
    )
    year_from: int | None = Field(
        default=None,
        description="Start year (e.g., 2020). Will auto-clamp to valid range (1700-current).",
    )
    year_to: int | None = Field(
        default=None,
        description="End year (e.g., 2024). Will auto-clamp to valid range (1700-current).",
    )
    is_oa: bool | None = Field(
        default=None,
        description="Open access filter. True returns ONLY open access papers with direct links.",
    )
    work_type: str | None = Field(
        default=None,
        description="Filter by publication type. "
        "Options: 'article', 'review', 'preprint', 'book', 'dissertation', 'dataset', etc.",
    )
    language: str | None = Field(
        default=None,
        description="Filter by publication language (e.g., 'en', 'zh', 'ja', 'fr', 'de').",
    )
    is_retracted: bool | None = Field(
        default=None,
        description="Retracted paper filter. False excludes retracted works (recommended). "
        "True shows ONLY retracted papers (for auditing).",
    )
    has_abstract: bool | None = Field(
        default=None,
        description="Require abstract. True returns only papers with abstracts.",
    )
    has_fulltext: bool | None = Field(
        default=None,
        description="Require full text access. True returns only papers with available full text.",
    )
    sort_by: Literal["relevance", "cited_by_count", "publication_date"] = Field(
        default="relevance",
        description="Sort results. 'cited_by_count' for influential papers, 'publication_date' for most recent first.",
    )
    data_sources: list[str] | None = Field(
        default=None,
        description="Data sources to query. Options: ['openalex', 'semantic_scholar', 'pubmed']. "
        "Default: ['openalex'].",
    )


async def _search_literature(
    query: str,
    mailto: str | None = None,
    author: str | None = None,
    institution: str | None = None,
    source: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    is_oa: bool | None = None,
    work_type: str | None = None,
    language: str | None = None,
    is_retracted: bool | None = None,
    has_abstract: bool | None = None,
    has_fulltext: bool | None = None,
    sort_by: str = "relevance",
    data_sources: list[str] | None = None,
) -> str:
    """
    Search academic literature from multiple data sources.

    Returns a markdown report with executive summary and JSON results.
    """
    # Hard-coded: abstracts excluded to save tokens
    include_abstract = False

    try:
        # Validate query
        if not query or not str(query).strip():
            return "Invalid input: query cannot be empty."
        if len(str(query).strip()) < 3:
            return "Invalid input: query is too short (minimum 3 characters)."

        # Clamp year ranges
        max_year = datetime.now().year + 1
        year_warning = ""
        year_from_clamped = year_from
        year_to_clamped = year_to

        if year_from_clamped is not None and year_from_clamped > max_year:
            year_warning += f"year_from {year_from_clamped} clamped to {max_year}. "
            year_from_clamped = max_year
        if year_to_clamped is not None and year_to_clamped < 1700:
            year_warning += f"year_to {year_to_clamped} clamped to 1700. "
            year_to_clamped = 1700

        # Ensure year_from <= year_to when both are set
        if year_from_clamped is not None and year_to_clamped is not None and year_from_clamped > year_to_clamped:
            year_warning += f"year_from {year_from_clamped} and year_to {year_to_clamped} swapped. "
            year_from_clamped, year_to_clamped = year_to_clamped, year_from_clamped

        # Hard-coded max_results
        max_results = 10

        openalex_email = mailto.strip() if mailto and str(mailto).strip() else None

        logger.info(
            "Literature search requested: query=%r, mailto=%s, max_results=%d",
            query,
            "<redacted>" if openalex_email else None,
            max_results,
        )

        # Create search request
        request = SearchRequest(
            query=query,
            author=author,
            institution=institution,
            source=source,
            year_from=year_from_clamped,
            year_to=year_to_clamped,
            is_oa=is_oa,
            work_type=work_type,
            language=language,
            is_retracted=is_retracted,
            has_abstract=has_abstract,
            has_fulltext=has_fulltext,
            sort_by=sort_by,
            max_results=max_results,
            data_sources=data_sources,
        )

        # Execute search
        async with WorkDistributor(openalex_email=openalex_email) as distributor:
            result = await distributor.search(request)

        if year_warning:
            result.setdefault("warnings", []).append(f"Year adjusted: {year_warning.strip()}")

        # Format output
        return _format_search_result(request, result, include_abstract)

    except ValueError as e:
        logger.warning(f"Literature search validation error: {e}")
        return f"Invalid input: {e!s}"
    except httpx.HTTPError as e:
        logger.error(f"Literature search network error: {e}", exc_info=True)
        return "Network error while contacting literature sources. Please try again later."
    except Exception as e:
        logger.error(f"Literature search failed: {e}", exc_info=True)
        return "Unexpected error during search. Please retry or contact support."


def _format_search_result(request: SearchRequest, result: dict[str, Any], include_abstract: bool = False) -> str:
    """
    Format search results into human-readable report + JSON data.

    Args:
        request: Original search request
        result: Search result from WorkDistributor
        include_abstract: Whether to include abstracts in JSON (default: False to save tokens)

    Returns:
        Formatted markdown report with embedded JSON
    """
    works = result["works"]

    # Build report sections
    sections: list[str] = ["# Literature Search Report\n"]

    # Warnings and resolution status (if any)
    if warnings := result.get("warnings", []):
        sections.extend(["## Warnings and Resolution Status\n", *warnings, ""])

    # Search conditions
    conditions: list[str] = [
        f"- **Query**: {request.query}",
        *([f"- **Author**: {request.author}"] if request.author else []),
        *([f"- **Institution**: {request.institution}"] if request.institution else []),
        *([f"- **Source**: {request.source}"] if request.source else []),
        *(
            [f"- **Year Range**: {request.year_from or '...'} - {request.year_to or '...'}"]
            if request.year_from or request.year_to
            else []
        ),
        *([f"- **Open Access Only**: {'Yes' if request.is_oa else 'No'}"] if request.is_oa is not None else []),
        *([f"- **Work Type**: {request.work_type}"] if request.work_type else []),
        *([f"- **Language**: {request.language}"] if request.language else []),
        *(
            [f"- **Exclude Retracted**: {'No' if request.is_retracted else 'Yes'}"]
            if request.is_retracted is not None
            else []
        ),
        *(
            [f"- **Require Abstract**: {'Yes' if request.has_abstract else 'No'}"]
            if request.has_abstract is not None
            else []
        ),
        *(
            [f"- **Require Full Text**: {'Yes' if request.has_fulltext else 'No'}"]
            if request.has_fulltext is not None
            else []
        ),
        f"- **Sort By**: {request.sort_by}",
        f"- **Max Results**: {request.max_results}",
    ]
    sections.extend(["## Search Conditions\n", "\n".join(conditions), ""])

    # Check if no results
    if not works:
        sections.extend(["## No Results Found\n", "**Suggestions to improve your search:**\n"])
        suggestions: list[str] = [
            "1. **Simplify keywords**: Try broader or different terms",
            *(["2. **Remove author filter**: Author name may not be recognized"] if request.author else []),
            *(["3. **Remove institution filter**: Try without institution constraint"] if request.institution else []),
            *(["4. **Remove source filter**: Try without journal constraint"] if request.source else []),
            *(
                ["5. **Expand year range**: Current range may be too narrow"]
                if request.year_from or request.year_to
                else []
            ),
            *(["6. **Remove open access filter**: Include non-OA papers"] if request.is_oa else []),
            "7. **Check spelling**: Verify all terms are spelled correctly",
        ]
        sections.extend(["\n".join(suggestions), ""])
        return "\n".join(sections)

    # Statistics and overall insights
    total_count = result["total_count"]
    unique_count = result["unique_count"]
    sources = result["sources"]

    stats: list[str] = [
        f"- **Total Found**: {total_count} works",
        f"- **After Deduplication**: {unique_count} works",
    ]
    source_info = ", ".join(f"{name}: {count}" for name, count in sources.items())
    stats.append(f"- **Data Sources**: {source_info}")

    # Add insights
    avg_citations = sum(w.cited_by_count for w in works) / len(works)
    stats.append(f"- **Average Citations**: {avg_citations:.1f}")

    oa_count = sum(w.is_oa for w in works)
    oa_ratio = (oa_count / len(works)) * 100
    stats.append(f"- **Open Access Rate**: {oa_ratio:.1f}% ({oa_count}/{len(works)})")

    if years := [w.publication_year for w in works if w.publication_year]:
        stats.append(f"- **Year Range**: {min(years)} - {max(years)}")

    sections.extend(["## Search Statistics\n", "\n".join(stats), ""])

    # Complete JSON list
    sections.extend(
        [
            "## Complete Works List (JSON)\n",
            "The following JSON contains all works with full abstracts:\n"
            if include_abstract
            else "The following JSON contains all works (abstracts excluded to save tokens):\n",
            "```json",
        ]
    )

    # Convert works to dict for JSON serialization
    works_dict = []
    for work in works:
        work_data = {
            "id": work.id,
            "doi": work.doi,
            "title": work.title,
            "authors": work.authors,
            "publication_year": work.publication_year,
            "cited_by_count": work.cited_by_count,
            "journal": work.journal,
            "primary_institution": work.primary_institution,
            "is_oa": work.is_oa,
            "access_url": work.access_url,
            "source": work.source,
        }
        # Only include abstract if requested
        if include_abstract and work.abstract:
            work_data["abstract"] = work.abstract
        works_dict.append(work_data)

    sections.extend([json.dumps(works_dict, indent=2, ensure_ascii=False), "```", ""])

    # Next steps guidance
    sections.extend(["---", "## Next Steps Guide\n", "**Before making another search, consider:**\n"])
    next_steps: list[str] = [
        *(["- **Results found** - Review the JSON data above for your analysis"] if unique_count > 0 else []),
        *(
            [
                f"- **Result limit reached** ({request.max_results}) - "
                "Consider narrowing filters (author, year, journal) for more targeted results"
            ]
            if unique_count >= request.max_results
            else []
        ),
        *(
            ["- **Few results** - Consider broadening your search by removing some filters"]
            if 0 < unique_count < 10
            else []
        ),
        "",
        "**To refine your search:**",
        "- If too many results: Add more specific filters (author, institution, journal, year)",
        "- If too few results: Remove filters or use broader keywords",
        "- If wrong results: Check filter spelling and try variations",
        "",
        "**Important**: Avoid making multiple similar searches without reviewing results first!",
        "Each search consumes API quota and context window. Make targeted, deliberate queries.",
    ]

    sections.append("\n".join(next_steps))

    return "\n".join(sections)


def create_literature_search_tool() -> BaseTool:
    """
    Create the literature search tool.

    Returns:
        StructuredTool for literature search.
    """
    return StructuredTool(
        name="literature_search",
        description=(
            "Search academic literature from multiple data sources (OpenAlex, Semantic Scholar, PubMed). "
            "Returns up to 10 papers with detailed information. "
            "IMPORTANT: When presenting results to users, always include: "
            "1) Paper title, 2) Authors, 3) Publication year, 4) Journal name, "
            "5) Citation count, 6) access_url (clickable link to read the paper). "
            "The access_url is critical - users need it to access the full paper. "
            "Supports filtering by author, institution, journal, year range, open access status, and more."
        ),
        args_schema=LiteratureSearchInput,
        coroutine=_search_literature,
    )


__all__ = ["create_literature_search_tool", "LiteratureSearchInput"]
