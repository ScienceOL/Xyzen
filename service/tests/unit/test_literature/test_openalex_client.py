"""Tests for OpenAlex API client."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.utils.literature.models import SearchRequest
from app.utils.literature.openalex_client import OpenAlexClient


class TestOpenAlexClientInit:
    """Test OpenAlex client initialization."""

    def test_client_initialization(self) -> None:
        """Test client initializes with correct parameters."""
        email = "test@example.com"
        rate_limit = 5
        timeout = 15.0

        client = OpenAlexClient(email=email, rate_limit=rate_limit, timeout=timeout)

        assert client.email == email
        assert client.rate_limit == rate_limit
        assert client.pool_type == "polite"
        assert pytest.approx(client.rate_limiter._min_interval, rel=0.01) == 1 / rate_limit

    def test_client_initialization_defaults(self) -> None:
        """Test client initializes with default parameters."""
        email = "test@example.com"
        client = OpenAlexClient(email=email)

        assert client.email == email
        assert client.rate_limit == 10
        assert client.pool_type == "polite"
        # Verify timeout was set (httpx Timeout object)
        assert client.client.timeout is not None

    def test_client_initialization_default_pool(self) -> None:
        """Test client initializes default pool when email is missing."""
        client = OpenAlexClient(email=None)

        assert client.email is None
        assert client.rate_limit == 1
        assert client.pool_type == "default"
        assert pytest.approx(client.rate_limiter._min_interval, rel=0.01) == 1.0


class TestOpenAlexClientSearch:
    """Test OpenAlex search functionality."""

    @pytest.fixture
    def client(self) -> OpenAlexClient:
        """Create an OpenAlex client for testing."""
        return OpenAlexClient(email="test@example.com")

    @pytest.fixture
    def mock_response(self) -> dict:
        """Create a mock OpenAlex API response."""
        return {
            "meta": {"count": 1, "page": 1},
            "results": [
                {
                    "id": "https://openalex.org/W2741809807",
                    "title": "Machine Learning Fundamentals",
                    "doi": "https://doi.org/10.1038/nature12345",
                    "publication_year": 2020,
                    "cited_by_count": 150,
                    "abstract_inverted_index": {
                        "Machine": [0],
                        "learning": [1],
                        "is": [2],
                        "fundamental": [3],
                    },
                    "authorships": [
                        {
                            "author": {
                                "id": "https://openalex.org/A5023888391",
                                "display_name": "Jane Smith",
                            }
                        }
                    ],
                    "primary_location": {
                        "source": {
                            "id": "https://openalex.org/S137773608",
                            "display_name": "Nature",
                        }
                    },
                    "open_access": {
                        "is_oa": True,
                        "oa_url": "https://example.com/paper.pdf",
                    },
                }
            ],
        }

    @pytest.mark.asyncio
    async def test_search_basic_query(self, client: OpenAlexClient, mock_response: dict) -> None:
        """Test basic search with simple query."""
        request = SearchRequest(query="machine learning", max_results=10)

        with patch.object(client, "_request_with_retry", new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response

            works, warnings = await client.search(request)

            assert len(works) == 1
            assert works[0].title == "Machine Learning Fundamentals"
            assert works[0].doi == "10.1038/nature12345"
            assert isinstance(warnings, list)

    @pytest.mark.asyncio
    async def test_search_with_author_filter(self, client: OpenAlexClient, mock_response: dict) -> None:
        """Test search with author filter."""
        request = SearchRequest(query="machine learning", author="Jane Smith", max_results=10)

        with patch.object(client, "_resolve_author_id", new_callable=AsyncMock) as mock_resolve:
            mock_resolve.return_value = ("A5023888391", True, "✓ Author resolved")
            with patch.object(client, "_request_with_retry", new_callable=AsyncMock) as mock_request:
                mock_request.return_value = mock_response

                works, warnings = await client.search(request)

                assert len(works) == 1
                mock_resolve.assert_called_once_with("Jane Smith")
                assert any("Author resolved" in msg for msg in warnings)

    @pytest.mark.asyncio
    async def test_search_with_institution_filter(self, client: OpenAlexClient, mock_response: dict) -> None:
        """Test search with institution filter."""
        request = SearchRequest(query="machine learning", institution="Harvard University", max_results=10)

        with patch.object(client, "_resolve_institution_id", new_callable=AsyncMock) as mock_resolve:
            mock_resolve.return_value = ("I136199984", True, "✓ Institution resolved")
            with patch.object(client, "_request_with_retry", new_callable=AsyncMock) as mock_request:
                mock_request.return_value = mock_response

                works, warnings = await client.search(request)

                assert len(works) == 1
                mock_resolve.assert_called_once_with("Harvard University")
                assert any("Institution resolved" in msg for msg in warnings)

    @pytest.mark.asyncio
    async def test_search_with_source_filter(self, client: OpenAlexClient, mock_response: dict) -> None:
        """Test search with source (journal) filter."""
        request = SearchRequest(query="machine learning", source="Nature", max_results=10)

        with patch.object(client, "_resolve_source_id", new_callable=AsyncMock) as mock_resolve:
            mock_resolve.return_value = ("S137773608", True, "✓ Source resolved")
            with patch.object(client, "_request_with_retry", new_callable=AsyncMock) as mock_request:
                mock_request.return_value = mock_response

                works, warnings = await client.search(request)

                assert len(works) == 1
                mock_resolve.assert_called_once_with("Nature")
                assert any("Source resolved" in msg for msg in warnings)

    @pytest.mark.asyncio
    async def test_search_with_year_range(self, client: OpenAlexClient, mock_response: dict) -> None:
        """Test search with year range filter."""
        request = SearchRequest(query="machine learning", year_from=2015, year_to=2021, max_results=10)

        with patch.object(client, "_request_with_retry", new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response

            works, warnings = await client.search(request)

            assert len(works) == 1
            # Verify year filter was applied
            call_args = mock_request.call_args
            params = call_args[0][1] if call_args else {}
            assert "2015-2021" in params.get("filter", "")

    @pytest.mark.asyncio
    async def test_search_max_results_clamping_low(self, client: OpenAlexClient) -> None:
        """Test that search handles low max_results correctly."""
        request = SearchRequest(query="test", max_results=0)

        with patch.object(client, "_request_with_retry", new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"meta": {"count": 0}, "results": []}

            # Should not raise an error even with 0 max_results
            works, warnings = await client.search(request)
            assert isinstance(works, list)
            assert isinstance(warnings, list)

    @pytest.mark.asyncio
    async def test_search_max_results_clamping_high(self, client: OpenAlexClient) -> None:
        """Test that search handles high max_results correctly."""
        request = SearchRequest(query="test", max_results=5000)

        with patch.object(client, "_request_with_retry", new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"meta": {"count": 0}, "results": []}

            # Should not raise an error even with high max_results
            works, warnings = await client.search(request)
            assert isinstance(works, list)
            assert isinstance(warnings, list)


class TestOpenAlexClientPrivateMethods:
    """Test OpenAlex client private methods."""

    @pytest.fixture
    def client(self) -> OpenAlexClient:
        """Create an OpenAlex client for testing."""
        return OpenAlexClient(email="test@example.com")

    def test_build_query_params_basic(self, client: OpenAlexClient) -> None:
        """Test building basic query parameters."""
        request = SearchRequest(query="machine learning", max_results=50)
        params = client._build_query_params(request, None, None, None)

        assert params["search"] == "machine learning"
        assert params["per-page"] == "200"
        assert params["mailto"] == "test@example.com"

    def test_build_query_params_with_filters(self, client: OpenAlexClient) -> None:
        """Test building query parameters with filters."""
        request = SearchRequest(
            query="machine learning",
            year_from=2015,
            year_to=2021,
            is_oa=True,
            work_type="journal-article",
        )
        params = client._build_query_params(request, None, None, None)

        assert "filter" in params
        assert "publication_year:2015-2021" in params["filter"]
        assert "is_oa:true" in params["filter"]
        assert "type:journal-article" in params["filter"]

    def test_build_query_params_with_resolved_ids(self, client: OpenAlexClient) -> None:
        """Test building query parameters with resolved author/institution/source IDs."""
        request = SearchRequest(query="test")
        params = client._build_query_params(request, "A123", "I456", "S789")

        assert "filter" in params
        assert "authorships.author.id:A123" in params["filter"]
        assert "authorships.institutions.id:I456" in params["filter"]
        assert "primary_location.source.id:S789" in params["filter"]

    def test_build_query_params_sorting_by_citations(self, client: OpenAlexClient) -> None:
        """Test building query parameters with citation sorting."""
        request = SearchRequest(query="test", sort_by="cited_by_count")
        params = client._build_query_params(request, None, None, None)

        assert params.get("sort") == "cited_by_count:desc"

    def test_build_query_params_sorting_by_date(self, client: OpenAlexClient) -> None:
        """Test building query parameters with date sorting."""
        request = SearchRequest(query="test", sort_by="publication_date")
        params = client._build_query_params(request, None, None, None)

        assert params.get("sort") == "publication_date:desc"

    def test_reconstruct_abstract_normal(self, client: OpenAlexClient) -> None:
        """Test abstract reconstruction from inverted index."""
        inverted_index = {
            "Machine": [0],
            "learning": [1],
            "is": [2],
            "fundamental": [3],
        }

        result = client._reconstruct_abstract(inverted_index)

        assert result == "Machine learning is fundamental"

    def test_reconstruct_abstract_with_duplicates(self, client: OpenAlexClient) -> None:
        """Test abstract reconstruction with duplicate words."""
        inverted_index = {
            "The": [0, 5],
            "quick": [1],
            "brown": [2],
            "fox": [3],
            "jumps": [4],
        }

        result = client._reconstruct_abstract(inverted_index)

        assert result == "The quick brown fox jumps The"

    def test_reconstruct_abstract_none(self, client: OpenAlexClient) -> None:
        """Test abstract reconstruction returns None for empty input."""
        result = client._reconstruct_abstract(None)

        assert result is None

    def test_reconstruct_abstract_empty(self, client: OpenAlexClient) -> None:
        """Test abstract reconstruction returns None for empty dict."""
        result = client._reconstruct_abstract({})

        assert result is None

    def test_transform_work_complete(self, client: OpenAlexClient) -> None:
        """Test transforming complete OpenAlex work object."""
        work_data = {
            "id": "https://openalex.org/W2741809807",
            "title": "Machine Learning Fundamentals",
            "doi": "https://doi.org/10.1038/nature12345",
            "publication_year": 2020,
            "cited_by_count": 150,
            "abstract_inverted_index": {"Machine": [0], "learning": [1]},
            "authorships": [
                {
                    "author": {
                        "id": "https://openalex.org/A5023888391",
                        "display_name": "Jane Smith",
                    }
                },
                {
                    "author": {
                        "id": "https://openalex.org/A5023888392",
                        "display_name": "John Doe",
                    }
                },
            ],
            "primary_location": {
                "source": {
                    "id": "https://openalex.org/S137773608",
                    "display_name": "Nature",
                }
            },
            "open_access": {
                "is_oa": True,
                "oa_url": "https://example.com/paper.pdf",
            },
        }

        result = client._transform_work(work_data)

        assert result.id == "W2741809807"
        assert result.title == "Machine Learning Fundamentals"
        assert result.doi == "10.1038/nature12345"
        assert result.publication_year == 2020
        assert result.cited_by_count == 150
        assert len(result.authors) == 2
        assert result.authors[0]["name"] == "Jane Smith"
        assert result.journal == "Nature"
        assert result.is_oa is True
        assert result.access_url == "https://example.com/paper.pdf"
        assert result.source == "openalex"

    def test_transform_work_minimal(self, client: OpenAlexClient) -> None:
        """Test transforming minimal OpenAlex work object."""
        work_data = {
            "id": "https://openalex.org/W123",
            "title": "Minimal Paper",
            "authorships": [],
        }

        result = client._transform_work(work_data)

        assert result.id == "W123"
        assert result.title == "Minimal Paper"
        assert result.doi is None
        assert result.authors == []
        assert result.journal is None
        assert result.is_oa is False


class TestOpenAlexClientRequestWithRetry:
    """Test OpenAlex client request retry logic."""

    @pytest.fixture
    def client(self) -> OpenAlexClient:
        """Create an OpenAlex client for testing."""
        return OpenAlexClient(email="test@example.com")

    @pytest.mark.asyncio
    async def test_request_with_retry_success(self, client: OpenAlexClient) -> None:
        """Test successful request without retry."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"success": True}

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            result = await client._request_with_retry("http://test.com", {})

            assert result == {"success": True}
            mock_get.assert_called_once()

    @pytest.mark.asyncio
    async def test_request_with_retry_timeout(self, client: OpenAlexClient) -> None:
        """Test request retry on timeout."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"success": True}

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            # First call timeout, second call success
            mock_get.side_effect = [httpx.TimeoutException("timeout"), mock_response]

            with patch("asyncio.sleep", new_callable=AsyncMock):
                result = await client._request_with_retry("http://test.com", {})

            assert result == {"success": True}
            assert mock_get.call_count == 2

    @pytest.mark.asyncio
    async def test_request_with_retry_rate_limit(self, client: OpenAlexClient) -> None:
        """Test request retry on rate limit (403)."""
        mock_response_403 = MagicMock()
        mock_response_403.status_code = 403

        mock_response_200 = MagicMock()
        mock_response_200.status_code = 200
        mock_response_200.json.return_value = {"success": True}

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = [mock_response_403, mock_response_200]

            with patch("asyncio.sleep", new_callable=AsyncMock):
                result = await client._request_with_retry("http://test.com", {})

            assert result == {"success": True}
            assert mock_get.call_count == 2

    @pytest.mark.asyncio
    async def test_request_with_retry_server_error(self, client: OpenAlexClient) -> None:
        """Test request retry on server error (5xx)."""
        mock_response_500 = MagicMock()
        mock_response_500.status_code = 500

        mock_response_200 = MagicMock()
        mock_response_200.status_code = 200
        mock_response_200.json.return_value = {"success": True}

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = [mock_response_500, mock_response_200]

            with patch("asyncio.sleep", new_callable=AsyncMock):
                result = await client._request_with_retry("http://test.com", {})

            assert result == {"success": True}
            assert mock_get.call_count == 2


class TestOpenAlexClientContextManager:
    """Test OpenAlex client context manager."""

    @pytest.mark.asyncio
    async def test_context_manager_enter_exit(self) -> None:
        """Test client works as async context manager."""
        async with OpenAlexClient(email="test@example.com") as client:
            assert client is not None
            assert client.email == "test@example.com"

    @pytest.mark.asyncio
    async def test_close_method(self) -> None:
        """Test client close method."""
        client = OpenAlexClient(email="test@example.com")
        with patch.object(client.client, "aclose", new_callable=AsyncMock) as mock_close:
            await client.close()
            mock_close.assert_called_once()
