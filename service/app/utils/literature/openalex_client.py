"""
OpenAlex API client for literature search

Implements the best practices from OpenAlex API guide:
- Two-step lookup for names (author/institution/source -> ID -> filter)
- Rate limiting with mailto parameter (10 req/s)
- Exponential backoff retry for errors
- Batch queries with pipe separator (up to 50 IDs)
- Maximum page size (200 per page)
- Abstract reconstruction from inverted index
"""

import asyncio
import logging
import random
from typing import Any

import httpx

from .base_client import BaseLiteratureClient
from .doi_cleaner import normalize_doi
from .models import LiteratureWork, SearchRequest

logger = logging.getLogger(__name__)


class _RateLimiter:
    """
    Simple global rate limiter with optional concurrency guard.

    Enforces a minimum interval between request starts across all callers.
    """

    def __init__(self, rate_per_second: float, max_concurrency: int) -> None:
        self._min_interval = 1.0 / rate_per_second if rate_per_second > 0 else 0.0
        self._lock = asyncio.Lock()
        self._last_request = 0.0
        self._semaphore = asyncio.Semaphore(max_concurrency)

    async def __aenter__(self) -> None:
        await self._semaphore.acquire()
        await self._throttle()

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: Any | None,
    ) -> None:
        self._semaphore.release()

    async def _throttle(self) -> None:
        if self._min_interval <= 0:
            return

        async with self._lock:
            now = asyncio.get_running_loop().time()
            wait_time = self._last_request + self._min_interval - now
            if wait_time > 0:
                await asyncio.sleep(wait_time)
            self._last_request = asyncio.get_running_loop().time()


class OpenAlexClient(BaseLiteratureClient):
    """
    OpenAlex API client

    Implements best practices from official API guide for LLMs:
    https://docs.openalex.org/api-guide-for-llms
    """

    BASE_URL = "https://api.openalex.org"
    MAX_PER_PAGE = 200
    MAX_RETRIES = 5
    TIMEOUT = 30.0

    def __init__(self, email: str | None, rate_limit: int | None = None, timeout: float = 30.0) -> None:
        """
        Initialize OpenAlex client

        Args:
            email: Email for polite pool (10x rate limit increase). If None, use default pool.
            rate_limit: Requests per second (default: 10 with email, 1 without email)
            timeout: Request timeout in seconds (default: 30.0)
        """
        self.email = email
        self.rate_limit = rate_limit or (10 if self.email else 1)
        max_concurrency = 10 if self.email else 1
        self.rate_limiter = _RateLimiter(rate_per_second=self.rate_limit, max_concurrency=max_concurrency)
        self.client = httpx.AsyncClient(timeout=timeout)
        pool_type = "polite" if self.email else "default"
        logger.info(
            "OpenAlex client initialized with pool=%s, email=%s, rate_limit=%s/s",
            pool_type,
            "<redacted>" if self.email else None,
            self.rate_limit,
        )

    @property
    def pool_type(self) -> str:
        """Return pool type string."""
        return "polite" if self.email else "default"

    async def search(self, request: SearchRequest) -> tuple[list[LiteratureWork], list[str]]:
        """
        Execute search and return results in standard format

        Implementation steps:
        1. Convert author name -> author ID (if specified)
        2. Convert institution name -> institution ID (if specified)
        3. Convert journal name -> source ID (if specified)
        4. Build filter query
        5. Paginate through results
        6. Transform to standard format

        Args:
            request: Standardized search request

        Returns:
            Tuple of (works, warnings)
            - works: List of literature works in standard format
            - warnings: List of warning/info messages for LLM feedback
        """
        logger.info(
            "OpenAlex search [%s @ %s/s]: query=%r, max_results=%d",
            self.pool_type,
            self.rate_limit,
            request.query,
            request.max_results,
        )

        warnings: list[str] = []

        # Step 1-3: Resolve IDs for names (two-step lookup pattern)
        author_id = None
        if request.author:
            author_id, _success, msg = await self._resolve_author_id(request.author)
            warnings.append(msg)

        institution_id = None
        if request.institution:
            institution_id, _success, msg = await self._resolve_institution_id(request.institution)
            warnings.append(msg)

        source_id = None
        if request.source:
            source_id, _success, msg = await self._resolve_source_id(request.source)
            warnings.append(msg)

        # Step 4: Build query parameters
        params = self._build_query_params(request, author_id, institution_id, source_id)

        # Step 5: Fetch all pages
        works = await self._fetch_all_pages(params, request.max_results)

        # Step 6: Transform to standard format
        return [self._transform_work(w) for w in works], warnings

    def _build_query_params(
        self,
        request: SearchRequest,
        author_id: str | None,
        institution_id: str | None,
        source_id: str | None,
    ) -> dict[str, str]:
        """
        Build OpenAlex query parameters

        Args:
            request: Search request
            author_id: Resolved author ID (if any)
            institution_id: Resolved institution ID (if any)
            source_id: Resolved source ID (if any)

        Returns:
            Dictionary of query parameters
        """
        params: dict[str, str] = {
            "per-page": str(self.MAX_PER_PAGE),
        }

        if self.email:
            params["mailto"] = self.email

        # Search keywords
        if request.query:
            params["search"] = request.query

        # Build filters
        filters: list[str] = []

        if author_id:
            filters.append(f"authorships.author.id:{author_id}")

        if institution_id:
            filters.append(f"authorships.institutions.id:{institution_id}")

        if source_id:
            filters.append(f"primary_location.source.id:{source_id}")

        # Year range
        if request.year_from and request.year_to:
            filters.append(f"publication_year:{request.year_from}-{request.year_to}")
        elif request.year_from:
            filters.append(f"publication_year:>{request.year_from - 1}")
        elif request.year_to:
            filters.append(f"publication_year:<{request.year_to + 1}")

        # Open access filter
        if request.is_oa is not None:
            filters.append(f"is_oa:{str(request.is_oa).lower()}")

        # Work type filter
        if request.work_type:
            filters.append(f"type:{request.work_type}")

        # Language filter
        if request.language:
            filters.append(f"language:{request.language}")

        # Retracted filter
        if request.is_retracted is not None:
            filters.append(f"is_retracted:{str(request.is_retracted).lower()}")

        # Abstract filter
        if request.has_abstract is not None:
            filters.append(f"has_abstract:{str(request.has_abstract).lower()}")

        # Fulltext filter
        if request.has_fulltext is not None:
            filters.append(f"has_fulltext:{str(request.has_fulltext).lower()}")

        if filters:
            params["filter"] = ",".join(filters)

        # Sorting
        sort_map = {
            "relevance": None,  # Default sorting by relevance
            "cited_by_count": "cited_by_count:desc",
            "publication_date": "publication_date:desc",
        }
        if sort := sort_map.get(request.sort_by):
            params["sort"] = sort

        return params

    async def _resolve_author_id(self, author_name: str) -> tuple[str | None, bool, str]:
        """
        Two-step lookup: author name -> author ID

        Args:
            author_name: Author name to search

        Returns:
            Tuple of (author_id, success, message)
            - author_id: Author ID (e.g., "A5023888391") or None if not found
            - success: Whether resolution was successful
            - message: Status message for LLM feedback
        """
        async with self.rate_limiter:
            try:
                url = f"{self.BASE_URL}/authors"
                params: dict[str, str] = {"search": author_name}
                if self.email:
                    params["mailto"] = self.email
                response = await self._request_with_retry(url, params)

                if results := response.get("results", []):
                    # Return first result's ID in short format
                    author_id = results[0]["id"].split("/")[-1]
                    author_display = results[0].get("display_name", author_name)
                    logger.info("Resolved author %r -> %s", author_name, author_id)
                    return author_id, True, f"✓ Author resolved: '{author_name}' -> '{author_display}'"
                else:
                    msg = (
                        f"⚠️ Author '{author_name}' not found. "
                        f"Suggestions: (1) Try full name format like 'Smith, John' or 'John Smith', "
                        f"(2) Check spelling, (3) Try removing middle name/initial."
                    )
                    logger.warning(msg)
                    return None, False, msg
            except Exception as e:
                msg = f"⚠️ Failed to resolve author '{author_name}': {e}"
                logger.warning(msg)
                return None, False, msg

    async def _resolve_institution_id(self, institution_name: str) -> tuple[str | None, bool, str]:
        """
        Two-step lookup: institution name -> institution ID

        Args:
            institution_name: Institution name to search

        Returns:
            Tuple of (institution_id, success, message)
            - institution_id: Institution ID (e.g., "I136199984") or None if not found
            - success: Whether resolution was successful
            - message: Status message for LLM feedback
        """
        async with self.rate_limiter:
            try:
                url = f"{self.BASE_URL}/institutions"
                params: dict[str, str] = {"search": institution_name}
                if self.email:
                    params["mailto"] = self.email
                response = await self._request_with_retry(url, params)

                if results := response.get("results", []):
                    institution_id = results[0]["id"].split("/")[-1]
                    inst_display = results[0].get("display_name", institution_name)
                    logger.info("Resolved institution %r -> %s", institution_name, institution_id)
                    return institution_id, True, f"✓ Institution resolved: '{institution_name}' -> '{inst_display}'"
                else:
                    msg = (
                        f"⚠️ Institution '{institution_name}' not found. "
                        f"Suggestions: (1) Use full official name (e.g., 'Harvard University' not 'Harvard'), "
                        f"(2) Try variations (e.g., 'MIT' vs 'Massachusetts Institute of Technology'), "
                        f"(3) Check spelling."
                    )
                    logger.warning(msg)
                    return None, False, msg
            except Exception as e:
                msg = f"⚠️ Failed to resolve institution '{institution_name}': {e}"
                logger.warning(msg)
                return None, False, msg

    async def _resolve_source_id(self, source_name: str) -> tuple[str | None, bool, str]:
        """
        Two-step lookup: source name -> source ID

        Args:
            source_name: Journal/conference name to search

        Returns:
            Tuple of (source_id, success, message)
            - source_id: Source ID (e.g., "S137773608") or None if not found
            - success: Whether resolution was successful
            - message: Status message for LLM feedback
        """
        async with self.rate_limiter:
            try:
                url = f"{self.BASE_URL}/sources"
                params: dict[str, str] = {"search": source_name}
                if self.email:
                    params["mailto"] = self.email
                response = await self._request_with_retry(url, params)

                if results := response.get("results", []):
                    source_id = results[0]["id"].split("/")[-1]
                    source_display = results[0].get("display_name", source_name)
                    logger.info("Resolved source %r -> %s", source_name, source_id)
                    return source_id, True, f"✓ Source resolved: '{source_name}' -> '{source_display}'"
                else:
                    msg = (
                        f"⚠️ Source/Journal '{source_name}' not found. "
                        f"Suggestions: (1) Use full journal name (e.g., 'Nature' or 'Science'), "
                        f"(2) Try alternative names (e.g., 'JAMA' vs 'Journal of the American Medical Association'), "
                        f"(3) Check spelling."
                    )
                    logger.warning(msg)
                    return None, False, msg
            except Exception as e:
                msg = f"⚠️ Failed to resolve source '{source_name}': {e}"
                logger.warning(msg)
                return None, False, msg

    async def _fetch_all_pages(self, params: dict[str, str], max_results: int) -> list[dict[str, Any]]:
        """
        Paginate through all results up to max_results

        Args:
            params: Base query parameters
            max_results: Maximum number of results to fetch

        Returns:
            List of work objects from API
        """
        all_works: list[dict[str, Any]] = []
        page = 1

        while len(all_works) < max_results:
            async with self.rate_limiter:
                try:
                    url = f"{self.BASE_URL}/works"
                    page_params = {**params, "page": str(page)}
                    response = await self._request_with_retry(url, page_params)

                    works = response.get("results", [])
                    if not works:
                        break

                    all_works.extend(works)
                    logger.info("Fetched page %d: %d works", page, len(works))

                    # Check if there are more pages
                    meta = response.get("meta", {})
                    total_count = meta.get("count", 0)
                    if len(all_works) >= total_count:
                        break

                    page += 1

                except Exception as e:
                    logger.error(f"Error fetching page {page}: {e}")
                    break

        return all_works[:max_results]

    async def _request_with_retry(self, url: str, params: dict[str, str]) -> dict[str, Any]:
        """
        HTTP request with exponential backoff retry

        Implements best practices:
        - Retry on 403 (rate limit) with exponential backoff
        - Retry on 5xx (server error) with exponential backoff
        - Don't retry on 4xx (except 403)
        - Retry on timeout

        Args:
            url: Request URL
            params: Query parameters

        Returns:
            JSON response

        Raises:
            Exception: If all retries fail
        """
        for attempt in range(self.MAX_RETRIES):
            try:
                response = await self.client.get(url, params=params)

                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 429:
                    retry_after = self._parse_retry_after(response.headers.get("Retry-After"))
                    wait_time = retry_after if retry_after is not None else 2**attempt
                    wait_time = self._apply_jitter(wait_time)
                    logger.warning(
                        "Rate limited (429), waiting %.2fs... (attempt %d)",
                        wait_time,
                        attempt + 1,
                    )
                    await asyncio.sleep(wait_time)
                elif response.status_code == 403:
                    # Rate limited
                    wait_time = self._apply_jitter(2**attempt)
                    logger.warning(
                        "Rate limited (403), waiting %.2fs... (attempt %d)",
                        wait_time,
                        attempt + 1,
                    )
                    await asyncio.sleep(wait_time)
                elif response.status_code >= 500:
                    # Server error
                    wait_time = self._apply_jitter(2**attempt)
                    logger.warning(
                        "Server error (%d), waiting %.2fs... (attempt %d)",
                        response.status_code,
                        wait_time,
                        attempt + 1,
                    )
                    await asyncio.sleep(wait_time)
                else:
                    # Other error, don't retry
                    response.raise_for_status()

            except httpx.TimeoutException:
                if attempt >= self.MAX_RETRIES - 1:
                    raise
                wait_time = self._apply_jitter(2**attempt)
                logger.warning("Timeout, retrying in %.2fs... (attempt %d)", wait_time, attempt + 1)
                await asyncio.sleep(wait_time)
            except Exception as e:
                logger.error(f"Request failed: {e}")
                if attempt >= self.MAX_RETRIES - 1:
                    raise
                wait_time = self._apply_jitter(2**attempt)
                await asyncio.sleep(wait_time)

        raise Exception(f"Failed after {self.MAX_RETRIES} retries")

    @staticmethod
    def _apply_jitter(wait_time: float) -> float:
        return wait_time + random.uniform(0.1, 0.9)

    @staticmethod
    def _parse_retry_after(retry_after: str | None) -> float | None:
        if not retry_after:
            return None
        try:
            return float(retry_after)
        except ValueError:
            return None

    def _transform_work(self, work: dict[str, Any]) -> LiteratureWork:
        """
        Transform OpenAlex work data to standard format

        Args:
            work: Raw work object from OpenAlex API

        Returns:
            Standardized LiteratureWork object
        """
        # Extract authors
        authors: list[dict[str, str | None]] = []
        for authorship in work.get("authorships", []):
            author = authorship.get("author", {})
            authors.append(
                {
                    "name": author.get("display_name", "Unknown"),
                    "id": author.get("id", "").split("/")[-1] if author.get("id") else None,
                }
            )

        # Extract journal/source
        journal = None
        primary_location = work.get("primary_location") or {}
        if source := primary_location.get("source"):
            journal = source.get("display_name")

        # Extract open access info
        oa_info = work.get("open_access", {})
        is_oa = oa_info.get("is_oa", False)
        oa_url = oa_info.get("oa_url")

        # Extract abstract (reconstruct from inverted index)
        abstract = self._reconstruct_abstract(work.get("abstract_inverted_index"))

        # Extract DOI (remove prefix)
        doi = None
        if doi_raw := work.get("doi"):
            doi = normalize_doi(doi_raw)

        # Extract primary institution (first available)
        primary_institution = None
        for authorship in work.get("authorships", []):
            institutions = authorship.get("institutions", [])
            if institutions:
                primary_institution = institutions[0].get("display_name")
                if primary_institution:
                    break

        # Build best access URL (OA first, then landing page, then DOI)
        access_url = oa_url
        if not access_url:
            access_url = primary_location.get("landing_page_url") or primary_location.get("pdf_url")
        if not access_url and doi:
            access_url = f"https://doi.org/{doi}"

        return LiteratureWork(
            id=work["id"].split("/")[-1],
            doi=doi,
            title=work.get("title", "Untitled"),
            authors=authors,
            publication_year=work.get("publication_year"),
            cited_by_count=work.get("cited_by_count", 0),
            abstract=abstract,
            journal=journal,
            is_oa=is_oa,
            source="openalex",
            access_url=access_url,
            primary_institution=primary_institution,
            raw_data=work,
        )

    def _reconstruct_abstract(self, inverted_index: dict[str, list[int]] | None) -> str | None:
        """
        Reconstruct abstract from inverted index

        OpenAlex stores abstracts as inverted index for efficiency.
        Format: {"word": [position1, position2, ...], ...}

        Args:
            inverted_index: Inverted index from OpenAlex

        Returns:
            Reconstructed abstract text or None

        Examples:
            >>> index = {"Hello": [0], "world": [1], "!": [2]}
            >>> _reconstruct_abstract(index)
            "Hello world !"
        """
        if not inverted_index:
            return None

        # Expand inverted index to (position, word) pairs
        word_positions: list[tuple[int, str]] = [
            (pos, word) for word, positions in inverted_index.items() for pos in positions
        ]

        # Sort by position and join
        word_positions.sort()
        return " ".join(word for _, word in word_positions)

    async def close(self) -> None:
        """Close the HTTP client"""
        await self.client.aclose()

    async def __aenter__(self) -> "OpenAlexClient":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: Any | None,
    ) -> None:
        await self.close()
