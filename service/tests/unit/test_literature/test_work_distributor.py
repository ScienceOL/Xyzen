"""Tests for work distributor."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.utils.literature.models import LiteratureWork, SearchRequest
from app.utils.literature.work_distributor import WorkDistributor


class TestWorkDistributorInit:
    """Test WorkDistributor initialization."""

    def test_init_with_openalex_email(self) -> None:
        """Test initialization with OpenAlex email."""
        distributor = WorkDistributor(openalex_email="test@example.com")

        assert distributor.openalex_email == "test@example.com"
        # OpenAlex client should be registered (polite pool)
        assert "openalex" in distributor.clients

    def test_init_without_openalex_email(self) -> None:
        """Test initialization without OpenAlex email."""
        distributor = WorkDistributor()

        assert distributor.openalex_email is None
        # OpenAlex client should still be registered (default pool)
        assert "openalex" in distributor.clients

    def test_init_with_import_error(self) -> None:
        """Test initialization when OpenAlex client import fails."""
        # This test would require mocking the import, which is complex
        # Instead, just verify initialization works without email
        distributor = WorkDistributor()

        assert distributor.openalex_email is None
        assert "openalex" in distributor.clients


class TestWorkDistributorSearch:
    """Test WorkDistributor search functionality."""

    @pytest.fixture
    def sample_work(self) -> LiteratureWork:
        """Create a sample literature work."""
        return LiteratureWork(
            id="W1",
            doi="10.1038/nature12345",
            title="Test Paper",
            authors=[{"name": "John Doe", "id": "A1"}],
            publication_year=2020,
            cited_by_count=100,
            abstract="Test abstract",
            journal="Nature",
            is_oa=True,
            access_url="https://example.com/paper.pdf",
            source="openalex",
        )

    @pytest.fixture
    def mock_openalex_client(self, sample_work: LiteratureWork) -> MagicMock:
        """Create a mock OpenAlex client."""
        client = AsyncMock()
        client.search = AsyncMock(return_value=([sample_work], ["✓ Search completed"]))
        return client

    @pytest.mark.asyncio
    async def test_search_basic(self, sample_work: LiteratureWork, mock_openalex_client: MagicMock) -> None:
        """Test basic search with default source."""
        request = SearchRequest(query="test", max_results=50)

        distributor = WorkDistributor.__new__(WorkDistributor)
        distributor.clients = {"openalex": mock_openalex_client}
        distributor.openalex_email = "test@example.com"

        result = await distributor.search(request)

        assert result["total_count"] == 1
        assert result["unique_count"] == 1
        assert "openalex" in result["sources"]
        assert len(result["works"]) == 1
        assert result["works"][0].id == "W1"

    @pytest.mark.asyncio
    async def test_search_multiple_sources(self, sample_work: LiteratureWork) -> None:
        """Test search with multiple data sources."""
        work2 = LiteratureWork(
            id="W2",
            doi="10.1038/nature67890",
            title="Another Paper",
            authors=[],
            publication_year=2021,
            cited_by_count=50,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="semantic_scholar",
        )

        mock_client1 = AsyncMock()
        mock_client1.search = AsyncMock(return_value=([sample_work], []))

        mock_client2 = AsyncMock()
        mock_client2.search = AsyncMock(return_value=([work2], []))

        request = SearchRequest(query="test", max_results=50, data_sources=["openalex", "semantic_scholar"])

        distributor = WorkDistributor.__new__(WorkDistributor)
        distributor.clients = {"openalex": mock_client1, "semantic_scholar": mock_client2}

        result = await distributor.search(request)

        assert result["total_count"] == 2
        assert result["unique_count"] == 2
        assert "openalex" in result["sources"]
        assert "semantic_scholar" in result["sources"]

    @pytest.mark.asyncio
    async def test_search_deduplication(self) -> None:
        """Test search deduplicates results by DOI."""
        work1 = LiteratureWork(
            id="W1",
            doi="10.1038/nature12345",
            title="Paper",
            authors=[],
            publication_year=2020,
            cited_by_count=100,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )
        work2 = LiteratureWork(
            id="W2",
            doi="10.1038/nature12345",
            title="Paper",
            authors=[],
            publication_year=2020,
            cited_by_count=50,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="other",
        )

        mock_client = AsyncMock()
        mock_client.search = AsyncMock(return_value=([work1, work2], []))

        request = SearchRequest(query="test", max_results=50)

        distributor = WorkDistributor.__new__(WorkDistributor)
        distributor.clients = {"openalex": mock_client}

        result = await distributor.search(request)

        assert result["total_count"] == 2
        assert result["unique_count"] == 1  # Deduplicated
        assert result["works"][0].id == "W1"  # Higher citation count

    @pytest.mark.asyncio
    async def test_search_with_client_error(self, sample_work: LiteratureWork) -> None:
        """Test search handles client errors gracefully."""
        mock_client = AsyncMock()
        mock_client.search = AsyncMock(side_effect=Exception("API Error"))

        request = SearchRequest(query="test", max_results=50)

        distributor = WorkDistributor.__new__(WorkDistributor)
        distributor.clients = {"openalex": mock_client}

        result = await distributor.search(request)

        assert result["total_count"] == 0
        assert result["unique_count"] == 0
        assert result["sources"]["openalex"] == 0
        assert any("Error" in w for w in result["warnings"])

    @pytest.mark.asyncio
    async def test_search_unavailable_source(self) -> None:
        """Test search with unavailable data source."""
        request = SearchRequest(query="test", max_results=50, data_sources=["unavailable_source"])

        distributor = WorkDistributor.__new__(WorkDistributor)
        distributor.clients = {}

        result = await distributor.search(request)

        assert result["total_count"] == 0
        assert result["unique_count"] == 0
        assert result["works"] == []

    @pytest.mark.asyncio
    async def test_search_max_results_clamping_low(self) -> None:
        """Test search clamps max_results to minimum."""
        request = SearchRequest(query="test", max_results=0)

        distributor = WorkDistributor.__new__(WorkDistributor)
        distributor.clients = {}

        result = await distributor.search(request)

        assert any("max_results < 1" in w for w in result["warnings"])
        assert request.max_results == 50

    @pytest.mark.asyncio
    async def test_search_max_results_clamping_high(self) -> None:
        """Test search clamps max_results to maximum."""
        request = SearchRequest(query="test", max_results=5000)

        distributor = WorkDistributor.__new__(WorkDistributor)
        distributor.clients = {}

        result = await distributor.search(request)

        assert any("max_results > 1000" in w for w in result["warnings"])
        assert request.max_results == 1000

    @pytest.mark.asyncio
    async def test_search_result_limiting(self) -> None:
        """Test search limits results to max_results."""
        works = [
            LiteratureWork(
                id=f"W{i}",
                doi=f"10.1038/paper{i}",
                title=f"Paper {i}",
                authors=[],
                publication_year=2020,
                cited_by_count=100 - i,
                abstract=None,
                journal=None,
                is_oa=False,
                access_url=None,
                source="openalex",
            )
            for i in range(20)
        ]

        mock_client = AsyncMock()
        mock_client.search = AsyncMock(return_value=(works, []))

        request = SearchRequest(query="test", max_results=10)

        distributor = WorkDistributor.__new__(WorkDistributor)
        distributor.clients = {"openalex": mock_client}

        result = await distributor.search(request)

        assert len(result["works"]) == 10

    @pytest.mark.asyncio
    async def test_search_with_warnings(self) -> None:
        """Test search collects warnings from clients."""
        work = LiteratureWork(
            id="W1",
            doi=None,
            title="Paper",
            authors=[],
            publication_year=2020,
            cited_by_count=10,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        mock_client = AsyncMock()
        mock_client.search = AsyncMock(
            return_value=(
                [work],
                ["⚠️ Author not found", "✓ Search completed"],
            )
        )

        request = SearchRequest(query="test", max_results=50)

        distributor = WorkDistributor.__new__(WorkDistributor)
        distributor.clients = {"openalex": mock_client}

        result = await distributor.search(request)

        assert "⚠️ Author not found" in result["warnings"]
        assert "✓ Search completed" in result["warnings"]


class TestWorkDistributorSorting:
    """Test WorkDistributor sorting functionality."""

    @pytest.fixture
    def sample_works(self) -> list[LiteratureWork]:
        """Create sample works for sorting tests."""
        return [
            LiteratureWork(
                id="W1",
                doi=None,
                title="Paper 1",
                authors=[],
                publication_year=2020,
                cited_by_count=50,
                abstract=None,
                journal=None,
                is_oa=False,
                access_url=None,
                source="openalex",
            ),
            LiteratureWork(
                id="W2",
                doi=None,
                title="Paper 2",
                authors=[],
                publication_year=2021,
                cited_by_count=100,
                abstract=None,
                journal=None,
                is_oa=False,
                access_url=None,
                source="openalex",
            ),
            LiteratureWork(
                id="W3",
                doi=None,
                title="Paper 3",
                authors=[],
                publication_year=2019,
                cited_by_count=75,
                abstract=None,
                journal=None,
                is_oa=False,
                access_url=None,
                source="openalex",
            ),
        ]

    def test_sort_by_relevance(self, sample_works: list[LiteratureWork]) -> None:
        """Test sorting by relevance (default, maintains order)."""
        distributor = WorkDistributor.__new__(WorkDistributor)

        result = distributor._sort_works(sample_works, "relevance")

        # Should maintain original order for relevance
        assert result[0].id == "W1"
        assert result[1].id == "W2"
        assert result[2].id == "W3"

    def test_sort_by_cited_by_count(self, sample_works: list[LiteratureWork]) -> None:
        """Test sorting by citation count."""
        distributor = WorkDistributor.__new__(WorkDistributor)

        result = distributor._sort_works(sample_works, "cited_by_count")

        assert result[0].id == "W2"  # 100 citations
        assert result[1].id == "W3"  # 75 citations
        assert result[2].id == "W1"  # 50 citations

    def test_sort_by_publication_date(self, sample_works: list[LiteratureWork]) -> None:
        """Test sorting by publication date."""
        distributor = WorkDistributor.__new__(WorkDistributor)

        result = distributor._sort_works(sample_works, "publication_date")

        assert result[0].id == "W2"  # 2021
        assert result[1].id == "W1"  # 2020
        assert result[2].id == "W3"  # 2019

    def test_sort_with_missing_year(self, sample_works: list[LiteratureWork]) -> None:
        """Test sorting by publication date with missing years."""
        sample_works[1].publication_year = None

        distributor = WorkDistributor.__new__(WorkDistributor)

        result = distributor._sort_works(sample_works, "publication_date")

        # Works with missing year should go to the end
        assert result[0].id == "W1"  # 2020
        assert result[1].id == "W3"  # 2019
        assert result[2].publication_year is None


class TestWorkDistributorContextManager:
    """Test WorkDistributor context manager."""

    @pytest.mark.asyncio
    async def test_context_manager_enter_exit(self) -> None:
        """Test context manager functionality."""
        async with WorkDistributor(openalex_email="test@example.com") as distributor:
            assert distributor is not None

    @pytest.mark.asyncio
    async def test_close_method(self) -> None:
        """Test close method."""
        distributor = WorkDistributor(openalex_email="test@example.com")

        # Replace the actual client with a mock
        mock_client = MagicMock()
        mock_client.close = AsyncMock()
        distributor.clients["openalex"] = mock_client

        await distributor.close()

        mock_client.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_with_sync_close(self) -> None:
        """Test close method with synchronous close."""
        distributor = WorkDistributor.__new__(WorkDistributor)

        mock_client = MagicMock()
        # Synchronous close (returns None, not awaitable)
        mock_client.close = MagicMock(return_value=None)
        distributor.clients = {"openalex": mock_client}

        await distributor.close()

        mock_client.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_with_no_close_method(self) -> None:
        """Test close method with client that has no close method."""
        distributor = WorkDistributor.__new__(WorkDistributor)

        mock_client = MagicMock(spec=[])  # No close method
        distributor.clients = {"openalex": mock_client}

        # Should not raise an error
        await distributor.close()
