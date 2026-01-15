"""
Web Search Tool

LangChain tool for web search via SearXNG metasearch engine.
Converted from mcp/search.py to a native LangChain tool.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

import httpx
from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from app.configs import configs

logger = logging.getLogger(__name__)


class WebSearchInput(BaseModel):
    """Input schema for web search tool."""

    query: str = Field(
        description="The search query string. Supports advanced syntax like "
        '"site:github.com python" or "filetype:pdf machine learning".'
    )
    categories: str = Field(
        default="",
        description='Comma-separated categories (e.g., "general,science,news"). '
        "Available: general, images, videos, news, map, music, it, science, files, social media.",
    )
    engines: str = Field(
        default="",
        description='Comma-separated engine names to use (e.g., "google,bing"). '
        "Leave empty to use all enabled engines.",
    )
    language: str = Field(
        default="en",
        description='Language code for results (e.g., "en", "zh", "ja").',
    )
    time_range: Literal["", "day", "week", "month", "year"] = Field(
        default="",
        description='Filter by time - "day", "week", "month", "year", or "" for all.',
    )
    max_results: int = Field(
        default=10,
        description="Maximum number of results to return.",
    )


class SearchResult(BaseModel):
    """Individual search result."""

    title: str
    url: str
    content: str = ""
    engine: str = ""


async def _web_search(
    query: str,
    categories: str = "",
    engines: str = "",
    language: str = "en",
    time_range: Literal["", "day", "week", "month", "year"] = "",
    max_results: int = 10,
) -> dict[str, Any]:
    """
    Search the web using SearXNG metasearch engine.

    This function aggregates results from multiple search engines (Google, Bing,
    DuckDuckGo, Wikipedia, GitHub, etc.) to provide comprehensive search results.

    Returns:
        A dictionary containing:
        - query: The original search query
        - results: List of search results with title, url, content, engine
        - total_results: Number of results returned
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
        "pageno": 1,
        "language": language,
        "safesearch": 0,
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
        results: list[dict[str, str]] = []
        for item in data.get("results", [])[:effective_max_results]:
            results.append(
                {
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "content": item.get("content", ""),
                    "engine": item.get("engine", ""),
                }
            )

        logger.info(f"Search completed: '{query}' returned {len(results)} results")

        return {
            "query": query,
            "results": results,
            "total_results": len(results),
            "success": True,
        }

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
        error_msg = f"Search failed: {e!s}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "query": query,
            "results": [],
            "total_results": 0,
        }


def create_web_search_tool() -> BaseTool | None:
    """
    Create the web search tool.

    Returns:
        StructuredTool for web search, or None if SearXNG is disabled.
    """
    if not configs.SearXNG.Enable:
        logger.info("SearXNG is disabled, web search tool not created")
        return None

    return StructuredTool(
        name="web_search",
        description=(
            "Search the web using SearXNG metasearch engine. "
            "Aggregates results from multiple search engines (Google, Bing, DuckDuckGo, etc.) "
            "to provide comprehensive search results. "
            "Use this when you need to find current information, verify facts, or research topics."
        ),
        args_schema=WebSearchInput,
        coroutine=_web_search,
    )


__all__ = ["create_web_search_tool", "WebSearchInput"]
