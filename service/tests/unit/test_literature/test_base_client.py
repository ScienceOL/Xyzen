"""Tests for base literature client."""

import pytest

from app.utils.literature.base_client import BaseLiteratureClient
from app.utils.literature.models import LiteratureWork, SearchRequest


class ConcreteClient(BaseLiteratureClient):
    """Concrete implementation of BaseLiteratureClient for testing."""

    async def search(self, request: SearchRequest) -> tuple[list[LiteratureWork], list[str]]:
        """Dummy search implementation."""
        return [], []


class TestBaseLiteratureClientProtocol:
    """Test BaseLiteratureClient protocol and abstract methods."""

    def test_cannot_instantiate_abstract_class(self) -> None:
        """Test that BaseLiteratureClient cannot be instantiated directly."""
        with pytest.raises(TypeError):
            BaseLiteratureClient()  # type: ignore

    def test_concrete_implementation(self) -> None:
        """Test that concrete implementation can be instantiated."""
        client = ConcreteClient()
        assert client is not None
        assert isinstance(client, BaseLiteratureClient)

    @pytest.mark.asyncio
    async def test_search_method_required(self) -> None:
        """Test that search method is required."""
        request = SearchRequest(query="test")
        result = await ConcreteClient().search(request)
        assert result == ([], [])


class TestSearchRequestDataclass:
    """Test SearchRequest data model."""

    def test_search_request_required_field(self) -> None:
        """Test SearchRequest with required query field."""
        request = SearchRequest(query="machine learning")
        assert request.query == "machine learning"

    def test_search_request_default_values(self) -> None:
        """Test SearchRequest default values."""
        request = SearchRequest(query="test")
        assert request.query == "test"
        assert request.author is None
        assert request.institution is None
        assert request.source is None
        assert request.year_from is None
        assert request.year_to is None
        assert request.is_oa is None
        assert request.work_type is None
        assert request.language is None
        assert request.is_retracted is None
        assert request.has_abstract is None
        assert request.has_fulltext is None
        assert request.sort_by == "relevance"
        assert request.max_results == 50
        assert request.data_sources is None

    def test_search_request_all_fields(self) -> None:
        """Test SearchRequest with all fields specified."""
        request = SearchRequest(
            query="machine learning",
            author="John Doe",
            institution="MIT",
            source="Nature",
            year_from=2015,
            year_to=2021,
            is_oa=True,
            work_type="journal-article",
            language="en",
            is_retracted=False,
            has_abstract=True,
            has_fulltext=True,
            sort_by="cited_by_count",
            max_results=100,
            data_sources=["openalex", "semantic_scholar"],
        )

        assert request.query == "machine learning"
        assert request.author == "John Doe"
        assert request.institution == "MIT"
        assert request.source == "Nature"
        assert request.year_from == 2015
        assert request.year_to == 2021
        assert request.is_oa is True
        assert request.work_type == "journal-article"
        assert request.language == "en"
        assert request.is_retracted is False
        assert request.has_abstract is True
        assert request.has_fulltext is True
        assert request.sort_by == "cited_by_count"
        assert request.max_results == 100
        assert request.data_sources == ["openalex", "semantic_scholar"]

    def test_search_request_partial_year_range(self) -> None:
        """Test SearchRequest with only year_from."""
        request = SearchRequest(query="test", year_from=2015)
        assert request.year_from == 2015
        assert request.year_to is None

    def test_search_request_partial_year_range_to_only(self) -> None:
        """Test SearchRequest with only year_to."""
        request = SearchRequest(query="test", year_to=2021)
        assert request.year_from is None
        assert request.year_to == 2021


class TestLiteratureWorkDataclass:
    """Test LiteratureWork data model."""

    def test_literature_work_minimal(self) -> None:
        """Test LiteratureWork with minimal required fields."""
        work = LiteratureWork(
            id="W123",
            doi=None,
            title="Test Paper",
            authors=[],
            publication_year=None,
            cited_by_count=0,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        assert work.id == "W123"
        assert work.title == "Test Paper"
        assert work.cited_by_count == 0
        assert work.source == "openalex"

    def test_literature_work_complete(self) -> None:
        """Test LiteratureWork with all fields."""
        authors: list[dict[str, str | None]] = [
            {"name": "John Doe", "id": "A1"},
            {"name": "Jane Smith", "id": "A2"},
        ]

        work = LiteratureWork(
            id="W2741809807",
            doi="10.1038/nature12345",
            title="Machine Learning Fundamentals",
            authors=authors,
            publication_year=2020,
            cited_by_count=150,
            abstract="This is a comprehensive review of machine learning concepts.",
            journal="Nature",
            is_oa=True,
            access_url="https://example.com/paper.pdf",
            source="openalex",
        )

        assert work.id == "W2741809807"
        assert work.doi == "10.1038/nature12345"
        assert work.title == "Machine Learning Fundamentals"
        assert len(work.authors) == 2
        assert work.authors[0]["name"] == "John Doe"
        assert work.publication_year == 2020
        assert work.cited_by_count == 150
        assert work.abstract is not None
        assert work.journal == "Nature"
        assert work.is_oa is True
        assert work.access_url is not None

    def test_literature_work_raw_data_default(self) -> None:
        """Test LiteratureWork raw_data defaults to empty dict."""
        work = LiteratureWork(
            id="W123",
            doi=None,
            title="Test",
            authors=[],
            publication_year=None,
            cited_by_count=0,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        assert work.raw_data == {}

    def test_literature_work_raw_data_custom(self) -> None:
        """Test LiteratureWork with custom raw_data."""
        raw_data = {"custom_field": "value", "api_response": {"status": "ok"}}

        work = LiteratureWork(
            id="W123",
            doi=None,
            title="Test",
            authors=[],
            publication_year=None,
            cited_by_count=0,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
            raw_data=raw_data,
        )

        assert work.raw_data == raw_data
        assert work.raw_data["custom_field"] == "value"

    def test_literature_work_multiple_authors(self) -> None:
        """Test LiteratureWork with multiple authors."""
        authors = [
            {"name": "Author 1", "id": "A1"},
            {"name": "Author 2", "id": None},  # Author without ID
            {"name": "Author 3", "id": "A3"},
        ]

        work = LiteratureWork(
            id="W123",
            doi=None,
            title="Test",
            authors=authors,
            publication_year=2020,
            cited_by_count=10,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        assert len(work.authors) == 3
        assert work.authors[1]["id"] is None

    def test_literature_work_comparison(self) -> None:
        """Test LiteratureWork equality comparison."""
        work1 = LiteratureWork(
            id="W123",
            doi="10.1038/nature12345",
            title="Test Paper",
            authors=[],
            publication_year=2020,
            cited_by_count=50,
            abstract=None,
            journal="Nature",
            is_oa=True,
            access_url=None,
            source="openalex",
        )

        work2 = LiteratureWork(
            id="W123",
            doi="10.1038/nature12345",
            title="Test Paper",
            authors=[],
            publication_year=2020,
            cited_by_count=50,
            abstract=None,
            journal="Nature",
            is_oa=True,
            access_url=None,
            source="openalex",
        )

        # DataclassesObjects with same values should be equal
        assert work1 == work2

    def test_literature_work_inequality(self) -> None:
        """Test LiteratureWork inequality."""
        work1 = LiteratureWork(
            id="W123",
            doi="10.1038/nature12345",
            title="Paper 1",
            authors=[],
            publication_year=2020,
            cited_by_count=50,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        work2 = LiteratureWork(
            id="W456",
            doi="10.1038/nature67890",
            title="Paper 2",
            authors=[],
            publication_year=2021,
            cited_by_count=100,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        assert work1 != work2
