"""
Web Fetch Tool

LangChain tool for fetching and extracting content from web pages using Trafilatura.
Extracts clean text/markdown content from HTML pages with metadata extraction.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

import trafilatura
from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field
from trafilatura.settings import use_config

logger = logging.getLogger(__name__)


class WebFetchInput(BaseModel):
    """Input schema for web fetch tool."""

    url: str = Field(description="The URL of the web page to fetch and extract content from.")
    output_format: Literal["markdown", "text"] = Field(
        default="markdown",
        description="Output format: 'markdown' for structured content, 'text' for plain text.",
    )
    include_links: bool = Field(
        default=True,
        description="Whether to include hyperlinks in the extracted content.",
    )
    include_images: bool = Field(
        default=False,
        description="Whether to include image references in the output.",
    )
    timeout: int = Field(
        default=30,
        ge=5,
        le=120,
        description="Request timeout in seconds.",
    )


async def _web_fetch(
    url: str,
    output_format: Literal["markdown", "text"] = "markdown",
    include_links: bool = True,
    include_images: bool = False,
    timeout: int = 30,
) -> dict[str, Any]:
    """
    Fetch and extract content from a web page.

    Uses Trafilatura for robust HTML content extraction and conversion
    to clean markdown or plain text.

    Returns:
        A dictionary containing:
        - success: Boolean indicating success
        - url: The original URL
        - title: Page title if available
        - author: Author if available
        - date: Publication date if available
        - content: Extracted markdown/text content
        - error: Error message if failed
    """
    if not url.strip():
        return {
            "success": False,
            "error": "URL cannot be empty",
            "url": url,
            "title": None,
            "author": None,
            "date": None,
            "content": None,
        }

    # Configure trafilatura
    config = use_config()
    config.set("DEFAULT", "EXTRACTION_TIMEOUT", str(timeout))

    try:
        # Fetch the page
        downloaded = trafilatura.fetch_url(url)
        if downloaded is None:
            return {
                "success": False,
                "error": "Failed to fetch URL - the page may be unavailable or blocked",
                "url": url,
                "title": None,
                "author": None,
                "date": None,
                "content": None,
            }

        # Extract content
        content = trafilatura.extract(
            downloaded,
            output_format="markdown" if output_format == "markdown" else "txt",
            include_links=include_links,
            include_images=include_images,
            include_comments=False,
        )

        if content is None:
            return {
                "success": False,
                "error": "Failed to extract content from page - the page may have no readable content",
                "url": url,
                "title": None,
                "author": None,
                "date": None,
                "content": None,
            }

        # Extract metadata
        metadata = trafilatura.extract_metadata(downloaded)

        logger.info(f"Web fetch completed: '{url}' extracted {len(content)} characters")

        return {
            "success": True,
            "url": url,
            "title": metadata.title if metadata else None,
            "author": metadata.author if metadata else None,
            "date": metadata.date if metadata else None,
            "content": content,
        }

    except Exception as e:
        error_msg = f"Fetch failed: {e!s}"
        logger.error(f"Web fetch error for '{url}': {error_msg}")
        return {
            "success": False,
            "error": error_msg,
            "url": url,
            "title": None,
            "author": None,
            "date": None,
            "content": None,
        }


def create_web_fetch_tool() -> BaseTool:
    """
    Create the web fetch tool.

    Returns:
        StructuredTool for web page content extraction.
    """
    return StructuredTool(
        name="web_fetch",
        description=(
            "Fetch and extract content from a web page. "
            "Converts HTML to clean markdown or plain text, removing ads, navigation, and boilerplate. "
            "Also extracts metadata like title, author, and publication date when available. "
            "Use this when you need to read the full content of a specific web page."
        ),
        args_schema=WebFetchInput,
        coroutine=_web_fetch,
    )


__all__ = ["create_web_fetch_tool", "WebFetchInput"]
