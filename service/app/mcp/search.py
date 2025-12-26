"""
MCP Server for Web Search via SearXNG

Provides web search capabilities using a self-hosted SearXNG metasearch engine.
Supports multiple search engines and categories with configurable result limits.
"""

import logging
from typing import Any, Literal

import httpx
from fastmcp import FastMCP
from fastmcp.server.auth import JWTVerifier, TokenVerifier
from pydantic import BaseModel, Field

from app.configs import configs
from app.middleware.auth import AuthProvider
from app.middleware.auth.token_verifier.bohr_app_token_verifier import BohrAppTokenVerifier

logger = logging.getLogger(__name__)

# MCP metadata for registry
__mcp_metadata__ = {
    "source": "official",
    "description": "Web search using SearXNG metasearch engine",
    "banner": None,
}

# Create MCP server instance
search_mcp: FastMCP = FastMCP(name="Web Search 🔍")

# Authentication setup (matches knowledge.py pattern)
auth: TokenVerifier
match AuthProvider.get_provider_name():
    case "bohrium":
        auth = JWTVerifier(public_key=AuthProvider.public_key)
    case "casdoor":
        auth = JWTVerifier(jwks_uri=AuthProvider.jwks_uri)
    case "bohr_app":
        auth = BohrAppTokenVerifier(
            api_url=AuthProvider.issuer,
            x_app_key="xyzen-uuid1760783737",
        )
    case _:
        raise ValueError(f"Unsupported authentication provider: {AuthProvider.get_provider_name()}")


class SearchResult(BaseModel):
    """Individual search result"""

    title: str
    url: str
    content: str = ""
    engine: str = ""


class SearchResponse(BaseModel):
    """Search response with results and metadata"""

    query: str
    results: list[SearchResult]
    total_results: int
    categories: list[str] = Field(default_factory=list)
    success: bool = True
    error: str | None = None


@search_mcp.tool
async def web_search(
    query: str,
    categories: str = "",
    engines: str = "",
    language: str = "en",
    time_range: Literal["", "day", "week", "month", "year"] = "",
    safe_search: Literal[0, 1, 2] = 0,
    page: int = 1,
    max_results: int | None = None,
) -> dict[str, Any]:
    """
    Search the web using SearXNG metasearch engine.

    This tool aggregates results from multiple search engines (Google, Bing,
    DuckDuckGo, Wikipedia, GitHub, etc.) to provide comprehensive search results.

    Args:
        query: The search query string. Supports advanced syntax like
               "site:github.com python" or "filetype:pdf machine learning".
        categories: Comma-separated categories (e.g., "general,science,news").
                   Available: general, images, videos, news, map, music,
                   it, science, files, social media.
        engines: Comma-separated engine names to use (e.g., "google,bing").
                Leave empty to use all enabled engines.
        language: Language code for results (e.g., "en", "zh", "ja").
        time_range: Filter by time - "day", "week", "month", "year", or "" for all.
        safe_search: Safe search level - 0 (off), 1 (moderate), 2 (strict).
        page: Page number for pagination (default: 1).
        max_results: Maximum number of results to return (default: from config).

    Returns:
        A dictionary containing:
        - query: The original search query
        - results: List of search results with title, url, content, engine
        - total_results: Number of results returned
        - categories: Categories searched
        - success: Boolean indicating success
        - error: Error message if failed
    """
    if not configs.SearXNG.Enable:
        return {
            "success": False,
            "error": "SearXNG integration is disabled",
            "query": query,
            "results": [],
            "total_results": 0,
        }

    if not query.strip():
        return {
            "success": False,
            "error": "Search query cannot be empty",
            "query": query,
            "results": [],
            "total_results": 0,
        }

    # Use configured defaults if not specified
    effective_categories = categories or configs.SearXNG.DefaultCategories
    effective_engines = engines or configs.SearXNG.DefaultEngines
    effective_max_results = max_results or configs.SearXNG.MaxResults

    # Build search parameters
    params: dict[str, Any] = {
        "q": query,
        "format": "json",
        "pageno": page,
        "language": language,
        "safesearch": safe_search,
    }

    if effective_categories:
        params["categories"] = effective_categories
    if effective_engines:
        params["engines"] = effective_engines
    if time_range:
        params["time_range"] = time_range

    try:
        async with httpx.AsyncClient(timeout=configs.SearXNG.Timeout) as client:
            response = await client.get(
                f"{configs.SearXNG.BaseUrl}/search",
                params=params,
            )
            response.raise_for_status()
            data = response.json()

        # Parse results
        results: list[SearchResult] = []
        for item in data.get("results", [])[:effective_max_results]:
            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    content=item.get("content", ""),
                    engine=item.get("engine", ""),
                )
            )

        logger.info(f"Search completed: '{query}' returned {len(results)} results")

        return SearchResponse(
            query=query,
            results=results,
            total_results=len(results),
            categories=effective_categories.split(",") if effective_categories else [],
            success=True,
        ).model_dump()

    except httpx.TimeoutException:
        error_msg = f"Search request timed out after {configs.SearXNG.Timeout}s"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "query": query,
            "results": [],
            "total_results": 0,
        }
    except httpx.HTTPStatusError as e:
        error_msg = f"SearXNG request failed with status {e.response.status_code}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "query": query,
            "results": [],
            "total_results": 0,
        }
    except Exception as e:
        error_msg = f"Search failed: {str(e)}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "query": query,
            "results": [],
            "total_results": 0,
        }
