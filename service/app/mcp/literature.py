"""
Literature MCP Server - Multi-source academic literature search

Provides tools for searching academic literature from multiple data sources
(OpenAlex, Semantic Scholar, PubMed, etc.) with unified interface.
"""

import json
import logging
from typing import Any

from fastmcp import FastMCP

from app.utils.literature import SearchRequest, WorkDistributor

logger = logging.getLogger(__name__)

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
    mailto: str,
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
    Search academic literature from multiple data sources (OpenAlex, etc.)

    ⚠️ IMPORTANT: This tool REQUIRES a valid email address (mailto parameter).
    If you don't have the user's email, ask for it before calling this tool.

    Basic usage: Provide query keywords and user's email. Returns a Markdown report
    with statistics and JSON list of papers.

    Args:
        query: Search keywords (e.g., "machine learning", "CRISPR")
        mailto: **REQUIRED** - User's email (e.g., "researcher@university.edu")
        author: OPTIONAL - Author name (e.g., "Albert Einstein")
        institution: OPTIONAL - Institution (e.g., "MIT", "Harvard University")
        source: OPTIONAL - Journal (e.g., "Nature", "Science")
        year_from: OPTIONAL - Start year (e.g., "2020" or 2020)
        year_to: OPTIONAL - End year (e.g., "2024" or 2024)
        is_oa: OPTIONAL - Open access only ("true"/"false")
        work_type: OPTIONAL - Work type: "article", "review", "preprint", "book", "dissertation", etc.
        language: OPTIONAL - Language code (e.g., "en" for English, "zh" for Chinese, "fr" for French)
        is_retracted: OPTIONAL - Filter retracted works ("true" to include only retracted, "false" to exclude)
        has_abstract: OPTIONAL - Require abstract ("true" to include only works with abstracts)
        has_fulltext: OPTIONAL - Require full text ("true" to include only works with full text)
        sort_by: Sort: "relevance" (default), "cited_by_count", "publication_date"
        max_results: Max papers (default: 50, range: 1-200, accepts string or int)
        data_sources: Sources to search (default: ["openalex"])
        include_abstract: Include abstracts (default: False, accepts string or bool)

    Returns:
        Markdown report with:
        - Warnings if filters fail
        - Statistics (citations, open access rate)
        - JSON list of papers (title, authors, DOI, etc.)
        - Next steps guidance

    Usage tips:
        - START SIMPLE: just query + mailto
        - Tool will suggest corrections if author/institution not found
        - Review "Next Steps Guide" before searching again

    Examples:
        # Minimal (recommended)
        search_literature("machine learning", mailto="researcher@uni.edu")

        # With filters (accepts both strings and integers)
        search_literature(
            query="CRISPR",
            mailto="researcher@uni.edu",
            author="Jennifer Doudna",
            year_from="2020",
            year_to="2024"
        )

        # Recent reviews (past 5 years, English only)
        search_literature(
            query="cancer immunotherapy",
            mailto="user@example.com",
            work_type="review",
            language="en",
            year_from="2020",
            sort_by="cited_by_count"
        )

        # Research articles with abstracts (exclude retracted)
        search_literature(
            query="CRISPR gene editing",
            mailto="user@example.com",
            work_type="article",
            has_abstract="true",
            is_retracted="false"
        )
    """
    try:
        # Convert string parameters to proper types
        year_from_int = int(year_from) if year_from and str(year_from).strip() else None
        year_to_int = int(year_to) if year_to and str(year_to).strip() else None

        # Convert is_oa to boolean
        is_oa_bool: bool | None = None
        if is_oa is not None:
            is_oa_bool = str(is_oa).lower() in ("true", "1", "yes")

        # Convert is_retracted to boolean
        is_retracted_bool: bool | None = None
        if is_retracted is not None:
            is_retracted_bool = str(is_retracted).lower() in ("true", "1", "yes")

        # Convert has_abstract to boolean
        has_abstract_bool: bool | None = None
        if has_abstract is not None:
            has_abstract_bool = str(has_abstract).lower() in ("true", "1", "yes")

        # Convert has_fulltext to boolean
        has_fulltext_bool: bool | None = None
        if has_fulltext is not None:
            has_fulltext_bool = str(has_fulltext).lower() in ("true", "1", "yes")

        # Convert max_results to int
        max_results_int = int(max_results) if max_results else 50

        # Convert include_abstract to bool
        include_abstract_bool = str(include_abstract).lower() in ("true", "1", "yes") if include_abstract else False

        logger.info(f"Literature search requested: query='{query}', mailto={mailto}, max_results={max_results_int}")

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
        distributor = WorkDistributor(openalex_email=mailto)
        result = await distributor.search(request)

        # Format output
        return _format_search_result(request, result, include_abstract_bool)

    except Exception as e:
        logger.error(f"Literature search failed: {e}", exc_info=True)
        return f"❌ Search failed: {str(e)}"


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
    total_count = result["total_count"]
    unique_count = result["unique_count"]
    sources = result["sources"]
    warnings = result.get("warnings", [])

    # Build report sections
    sections: list[str] = []

    # Header
    sections.append("# Literature Search Report\n")

    # Warnings and resolution status (if any)
    if warnings:
        sections.append("## ⚠️ Warnings and Resolution Status\n")
        for warning in warnings:
            sections.append(f"{warning}")
        sections.append("")

    # Search conditions
    sections.append("## Search Conditions\n")
    conditions: list[str] = []
    conditions.append(f"- **Query**: {request.query}")
    if request.author:
        conditions.append(f"- **Author**: {request.author}")
    if request.institution:
        conditions.append(f"- **Institution**: {request.institution}")
    if request.source:
        conditions.append(f"- **Source**: {request.source}")
    if request.year_from or request.year_to:
        year_range = f"{request.year_from or '...'} - {request.year_to or '...'}"
        conditions.append(f"- **Year Range**: {year_range}")
    if request.is_oa is not None:
        conditions.append(f"- **Open Access Only**: {'Yes' if request.is_oa else 'No'}")
    if request.work_type:
        conditions.append(f"- **Work Type**: {request.work_type}")
    if request.language:
        conditions.append(f"- **Language**: {request.language}")
    if request.is_retracted is not None:
        conditions.append(f"- **Exclude Retracted**: {'No' if request.is_retracted else 'Yes'}")
    if request.has_abstract is not None:
        conditions.append(f"- **Require Abstract**: {'Yes' if request.has_abstract else 'No'}")
    if request.has_fulltext is not None:
        conditions.append(f"- **Require Full Text**: {'Yes' if request.has_fulltext else 'No'}")
    conditions.append(f"- **Sort By**: {request.sort_by}")
    conditions.append(f"- **Max Results**: {request.max_results}")
    sections.append("\n".join(conditions))
    sections.append("")

    # Check if no results
    if not works:
        sections.append("## ❌ No Results Found\n")
        sections.append("**Suggestions to improve your search:**\n")
        suggestions: list[str] = []
        suggestions.append("1. **Simplify keywords**: Try broader or different terms")
        if request.author:
            suggestions.append("2. **Remove author filter**: Author name may not be recognized")
        if request.institution:
            suggestions.append("3. **Remove institution filter**: Try without institution constraint")
        if request.source:
            suggestions.append("4. **Remove source filter**: Try without journal constraint")
        if request.year_from or request.year_to:
            suggestions.append("5. **Expand year range**: Current range may be too narrow")
        if request.is_oa:
            suggestions.append("6. **Remove open access filter**: Include non-OA papers")
        suggestions.append("7. **Check spelling**: Verify all terms are spelled correctly")
        sections.append("\n".join(suggestions))
        sections.append("")
        return "\n".join(sections)

    # Statistics and overall insights
    sections.append("## Search Statistics\n")
    stats: list[str] = []
    stats.append(f"- **Total Found**: {total_count} works")
    stats.append(f"- **After Deduplication**: {unique_count} works")
    source_info = ", ".join(f"{name}: {count}" for name, count in sources.items())
    stats.append(f"- **Data Sources**: {source_info}")

    # Add insights
    if works:
        avg_citations = sum(w.cited_by_count for w in works) / len(works)
        stats.append(f"- **Average Citations**: {avg_citations:.1f}")

        oa_count = sum(1 for w in works if w.is_oa)
        oa_ratio = (oa_count / len(works)) * 100
        stats.append(f"- **Open Access Rate**: {oa_ratio:.1f}% ({oa_count}/{len(works)})")

        years = [w.publication_year for w in works if w.publication_year]
        if years:
            stats.append(f"- **Year Range**: {min(years)} - {max(years)}")

    sections.append("\n".join(stats))
    sections.append("")

    # Complete JSON list
    sections.append("## Complete Works List (JSON)\n")
    if include_abstract:
        sections.append("The following JSON contains all works with full abstracts:\n")
    else:
        sections.append("The following JSON contains all works (abstracts excluded to save tokens):\n")
    sections.append("```json")

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
            "is_oa": work.is_oa,
            "oa_url": work.oa_url,
            "source": work.source,
        }
        # Only include abstract if requested
        if include_abstract and work.abstract:
            work_data["abstract"] = work.abstract
        works_dict.append(work_data)

    sections.append(json.dumps(works_dict, indent=2, ensure_ascii=False))
    sections.append("```")
    sections.append("")

    # Next steps guidance - prevent infinite loops
    sections.append("---")
    sections.append("## 🎯 Next Steps Guide\n")
    sections.append("**Before making another search, consider:**\n")
    next_steps: list[str] = []

    if unique_count > 0:
        next_steps.append("✓ **Results found** - Review the JSON data above for your analysis")
        if unique_count >= request.max_results:
            next_steps.append(
                f"⚠️ **Result limit reached** ({request.max_results}) - "
                "Consider narrowing filters (author, year, journal) for more targeted results"
            )
        if unique_count < 10:
            next_steps.append("💡 **Few results** - Consider broadening your search by removing some filters")

    next_steps.append("")
    next_steps.append("**To refine your search:**")
    next_steps.append("- If too many results → Add more specific filters (author, institution, journal, year)")
    next_steps.append("- If too few results → Remove filters or use broader keywords")
    next_steps.append("- If wrong results → Check filter spelling and try variations")
    next_steps.append("")
    next_steps.append("⚠️ **Important**: Avoid making multiple similar searches without reviewing results first!")
    next_steps.append("Each search consumes API quota and context window. Make targeted, deliberate queries.")

    sections.append("\n".join(next_steps))

    return "\n".join(sections)


# Optional: Add a tool to get a single work by DOI
@mcp.tool()
async def get_work_by_doi(doi: str, mailto: str, data_source: str = "openalex") -> str:
    """
    Get detailed information about a specific work by DOI

    Args:
        doi: Digital Object Identifier (e.g., "10.1038/nature12345")
        mailto: Your email address for OpenAlex polite pool
        data_source: Data source to query (default: "openalex")

    Returns:
        Detailed work information in JSON format

    Examples:
        get_work_by_doi("10.1038/nature12345", "your@email.com")
    """
    try:
        distributor = WorkDistributor(openalex_email=mailto)
        client = distributor.clients.get(data_source)

        if not client:
            return f"❌ Data source '{data_source}' not available"

        work = await client.get_by_doi(doi)

        if not work:
            return f"❌ No work found with DOI: {doi}"

        # Return as formatted JSON
        work_dict = {
            "id": work.id,
            "doi": work.doi,
            "title": work.title,
            "authors": work.authors,
            "publication_year": work.publication_year,
            "cited_by_count": work.cited_by_count,
            "abstract": work.abstract,
            "journal": work.journal,
            "is_oa": work.is_oa,
            "oa_url": work.oa_url,
            "source": work.source,
        }

        return json.dumps(work_dict, indent=2, ensure_ascii=False)

    except Exception as e:
        logger.error(f"Failed to get work by DOI {doi}: {e}", exc_info=True)
        return f"❌ Failed to retrieve work: {str(e)}"
