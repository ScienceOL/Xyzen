"""
Literature MCP Server - Multi-source academic literature search

Provides tools for searching academic literature from multiple data sources
(OpenAlex, Semantic Scholar, PubMed, etc.) with unified interface.
"""

import json
import logging
from datetime import datetime
from typing import Any

import httpx
from fastmcp import FastMCP

from app.utils.literature import SearchRequest, WorkDistributor

logger = logging.getLogger(__name__)

TRUE_VALUES = frozenset({"true", "1", "yes"})
FALSE_VALUES = frozenset({"false", "0", "no"})

# Create FastMCP instance
mcp = FastMCP("literature")

# Metadata for MCP server
__mcp_metadata__ = {
    "name": "Literature Search",
    "description": "Search academic literature from multiple sources with advanced filtering",
    "version": "1.0.0",
}


@mcp.tool()
async def search_literature(
    query: str,
    mailto: str | None = None,
    author: str | None = None,
    institution: str | None = None,
    source: str | None = None,
    year_from: str | None = None,
    year_to: str | None = None,
    is_oa: str | None = None,
    work_type: str | None = None,
    language: str | None = None,
    is_retracted: str | None = None,
    has_abstract: str | None = None,
    has_fulltext: str | None = None,
    sort_by: str = "relevance",
    max_results: str | int = 50,
    data_sources: list[str] | None = None,
    include_abstract: str | bool = False,
) -> str:
    """
    Search academic literature from multiple data sources (OpenAlex, Semantic Scholar, PubMed, etc.)

    🔑 STRONGLY RECOMMENDED: Always provide a valid email address (mailto parameter)
    ═════════════════════════════════════════════════════════════════════════════════

    📊 Performance Difference:
    - WITH email (mailto):      10 requests/second (fast, ideal for large searches)
    - WITHOUT email (mailto):   1 request/second  (slow, sequential processing)

    ⚠️ Impact: Omitting email can cause 10x slowdown or timeouts for large result sets.
    Production research should ALWAYS include email. Example: "researcher@university.edu"

    Response Format Overview
    ════════════════════════
    The tool returns TWO sections automatically:

    1️⃣ EXECUTIVE SUMMARY
       - Key statistics (total found, unique count, sources)
       - Average citations and open access rate
       - Publication year range
       - Warning/issue resolution status

    2️⃣ DETAILED RESULTS (Complete JSON with URLs)
       - Each paper includes:
         • ✅ Valid URLs (access_url; doi is a raw identifier)
         • Title, Authors (first 5), Publication Year
         • Citation Count, Journal, Open Access Status
         • Abstract (only if include_abstract=True)
       - Format: JSON array for easy parsing/import
       - All URLs are validated and functional

    Args:
        query: Search keywords (e.g., "machine learning", "CRISPR", "cancer immunotherapy")
               [REQUIRED] Most important parameter for accurate results

        mailto: Email address to enable fast API pool at OpenAlex
               [⭐ STRONGLY RECOMMENDED - includes your email]
               Examples: "researcher@mit.edu", "student@university.edu", "name@company.com"
               Impact: 10x faster searches. Production users MUST provide this.
               Note: Email is private, only used for API identification.

        author: OPTIONAL - Filter by author name (e.g., "Albert Einstein", "Jennifer Doudna")
                Will auto-correct common misspellings if not found exactly

        institution: OPTIONAL - Filter by affiliation (e.g., "MIT", "Harvard", "Stanford University")
                    Partial name matching supported

        source: OPTIONAL - Filter by journal/venue (e.g., "Nature", "Science", "JAMA")
                Matches both journal names and abbreviated titles

        year_from: OPTIONAL - Start year (e.g., "2020" or 2020)
                  Accepts string or integer, will auto-clamp to valid range (1700-2026)

        year_to: OPTIONAL - End year (e.g., "2024" or 2024)
                Accepts string or integer, will auto-clamp to valid range (1700-2026)
                If year_from > year_to, they will be automatically swapped

        is_oa: OPTIONAL - Open access filter ("true"/"false"/"yes"/"no")
               "true" returns ONLY open access papers with direct links

        work_type: OPTIONAL - Filter by publication type
                  Options: "article", "review", "preprint", "book", "dissertation", "dataset", etc.

        language: OPTIONAL - Filter by publication language (e.g., "en", "zh", "ja", "fr", "de")
                 "en" = English only, "zh" = Chinese only, etc.

        is_retracted: OPTIONAL - Retracted paper filter ("true"/"false")
                     "false" excludes retracted works (recommended for research)
                     "true" shows ONLY retracted papers (for auditing)

        has_abstract: OPTIONAL - Require abstract ("true"/"false")
                     "true" returns only papers with abstracts

        has_fulltext: OPTIONAL - Require full text access ("true"/"false")
                     "true" returns only papers with available full text

        sort_by: Sort results - "relevance" (default), "cited_by_count", "publication_date"
                 "cited_by_count" useful for influential papers
                 "publication_date" shows most recent first

        max_results: Result limit (default: 50, range: 1-1000, accepts string or int)
                    More results = slower query. Recommended: 50-200 for research

        data_sources: Advanced - Sources to query (default: ["openalex"])
                     Can include: ["openalex", "semantic_scholar", "pubmed"]

        include_abstract: Include full abstracts in JSON output? (default: False)
                 True = include full abstracts for detailed review
                 False = save token budget by excluding abstracts

    Returns:
        Markdown report with two sections:

        📋 Section 1: EXECUTIVE SUMMARY
           └─ Search conditions recap
           └─ Total results found & unique count
           └─ Statistics: avg citations, OA rate, year range
           └─ ⚠️ Any warnings/filter issues & resolutions

        📊 Section 2: COMPLETE RESULTS (JSON Array)
           └─ Each paper object contains:
             • "doi": Raw DOI string (not a URL)
             • "title": Paper title
             • "authors": Author names [first 5 only to save tokens]
             • "publication_year": Publication date
             • "cited_by_count": Citation impact metric
             • "journal": Journal/venue name
             • "description": Short description about the paper
           └─ access_url is validated and immediately accessible
           └─ Copy JSON directly into spreadsheet, database, or reference manager

    Usage Tips (READ THIS!)
    ══════════════════════
    ✅ DO:
       - Always provide mailto (10x faster searches)
       - Start simple: query + mailto first
       - Review results before refining search
       - Use filters incrementally to narrow down
       - Set include_abstract=True only for final review (saves API calls)

    ❌ DON'T:
       - Make multiple searches without reviewing first results
       - Use vague keywords like "research" or "analysis"
       - Search without mailto unless doing quick test
       - Ignore the "Next Steps Guide" section
       - Omit email for production/important research
    """
    try:
        # Validate query early to avoid accidental broad searches
        if not query or not str(query).strip():
            return "❌ Invalid input: query cannot be empty."
        if len(str(query).strip()) < 3:
            return "❌ Invalid input: query is too short (minimum 3 characters)."

        # Convert string parameters to proper types
        year_from_int = int(year_from) if year_from and str(year_from).strip() else None
        year_to_int = int(year_to) if year_to and str(year_to).strip() else None

        # Clamp year ranges (warn but don't block search)
        max_year = datetime.now().year + 1
        year_warning = ""
        if year_from_int is not None and year_from_int > max_year:
            year_warning += f"year_from {year_from_int}→{max_year}. "
            year_from_int = max_year
        if year_to_int is not None and year_to_int < 1700:
            year_warning += f"year_to {year_to_int}→1700. "
            year_to_int = 1700

        # Ensure year_from <= year_to when both are set
        if year_from_int is not None and year_to_int is not None and year_from_int > year_to_int:
            year_warning += f"year_from {year_from_int} and year_to {year_to_int} swapped to maintain a valid range. "
            year_from_int, year_to_int = year_to_int, year_from_int

        # Convert is_oa to boolean
        bool_warning_parts: list[str] = []

        def _parse_bool_field(raw: str | bool | None, field_name: str) -> bool | None:
            if raw is None:
                return None
            if isinstance(raw, bool):
                return raw
            val = str(raw).strip().lower()
            if val in TRUE_VALUES:
                return True
            if val in FALSE_VALUES:
                return False
            bool_warning_parts.append(f"{field_name}={raw!r} not recognized; ignoring this filter.")
            return None

        # Convert bool-like fields
        is_oa_bool = _parse_bool_field(is_oa, "is_oa")
        is_retracted_bool = _parse_bool_field(is_retracted, "is_retracted")
        has_abstract_bool = _parse_bool_field(has_abstract, "has_abstract")
        has_fulltext_bool = _parse_bool_field(has_fulltext, "has_fulltext")

        # Convert max_results to int with early clamping
        max_results_warning = ""
        try:
            max_results_int = int(max_results) if max_results else 50
        except (TypeError, ValueError):
            max_results_warning = "⚠️ max_results is not a valid integer; using default 50. "
            max_results_int = 50

        if max_results_int < 1:
            max_results_warning += f"max_results {max_results_int}→50 (minimum is 1). "
            max_results_int = 50
        elif max_results_int > 1000:
            max_results_warning += f"max_results {max_results_int}→1000 (maximum is 1000). "
            max_results_int = 1000

        # Convert include_abstract to bool
        include_abstract_bool = str(include_abstract).lower() in {"true", "1", "yes"} if include_abstract else False

        openalex_email = mailto.strip() if mailto and str(mailto).strip() else None

        logger.info(
            "Literature search requested: query=%r, mailto=%s, max_results=%d",
            query,
            "<redacted>" if openalex_email else None,
            max_results_int,
        )

        # Create search request with converted types
        request = SearchRequest(
            query=query,
            author=author,
            institution=institution,
            source=source,
            year_from=year_from_int,
            year_to=year_to_int,
            is_oa=is_oa_bool,
            work_type=work_type,
            language=language,
            is_retracted=is_retracted_bool,
            has_abstract=has_abstract_bool,
            has_fulltext=has_fulltext_bool,
            sort_by=sort_by,
            max_results=max_results_int,
            data_sources=data_sources,
        )

        # Execute search
        async with WorkDistributor(openalex_email=openalex_email) as distributor:
            result = await distributor.search(request)

        if year_warning:
            result.setdefault("warnings", []).append(f"⚠️ Year adjusted: {year_warning.strip()}")
        if bool_warning_parts:
            result.setdefault("warnings", []).append("⚠️ Boolean filter issues: " + " ".join(bool_warning_parts))
        if max_results_warning:
            result.setdefault("warnings", []).append(max_results_warning.strip())

        # Format output
        return _format_search_result(request, result, include_abstract_bool)

    except ValueError as e:
        logger.warning(f"Literature search validation error: {e}")
        return f"❌ Invalid input: {str(e)}"
    except httpx.HTTPError as e:
        logger.error(f"Literature search network error: {e}", exc_info=True)
        return "❌ Network error while contacting literature sources. Please try again later."
    except Exception as e:
        logger.error(f"Literature search failed: {e}", exc_info=True)
        return "❌ Unexpected error during search. Please retry or contact support."


def _format_search_result(request: SearchRequest, result: dict[str, Any], include_abstract: bool = False) -> str:
    """
    Format search results into human-readable report + JSON data

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
        sections.extend(["## ⚠️ Warnings and Resolution Status\n", *warnings, ""])

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
        sections.extend(["## ❌ No Results Found\n", "**Suggestions to improve your search:**\n"])
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
            "authors": work.authors[:5],  # Limit to first 5 authors
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

    # Next steps guidance - prevent infinite loops
    sections.extend(["---", "## 🎯 Next Steps Guide\n", "**Before making another search, consider:**\n"])
    next_steps: list[str] = [
        *(["✓ **Results found** - Review the JSON data above for your analysis"] if unique_count > 0 else []),
        *(
            [
                f"⚠️ **Result limit reached** ({request.max_results}) - "
                "Consider narrowing filters (author, year, journal) for more targeted results"
            ]
            if unique_count >= request.max_results
            else []
        ),
        *(
            ["💡 **Few results** - Consider broadening your search by removing some filters"]
            if 0 < unique_count < 10
            else []
        ),
        "",
        "**To refine your search:**",
        "- If too many results → Add more specific filters (author, institution, journal, year)",
        "- If too few results → Remove filters or use broader keywords",
        "- If wrong results → Check filter spelling and try variations",
        "",
        "⚠️ **Important**: Avoid making multiple similar searches without reviewing results first!",
        "Each search consumes API quota and context window. Make targeted, deliberate queries.",
    ]

    sections.append("\n".join(next_steps))

    return "\n".join(sections)
