"""Tests for DOI normalization and deduplication utilities."""

import pytest

from app.utils.literature.doi_cleaner import deduplicate_by_doi, normalize_doi
from app.utils.literature.models import LiteratureWork


class TestNormalizeDOI:
    """Test DOI normalization functionality."""

    def test_normalize_doi_with_https_prefix(self) -> None:
        """Test normalizing DOI with https:// prefix."""
        result = normalize_doi("https://doi.org/10.1038/nature12345")
        assert result == "10.1038/nature12345"

    def test_normalize_doi_with_http_prefix(self) -> None:
        """Test normalizing DOI with http:// prefix."""
        result = normalize_doi("http://doi.org/10.1038/nature12345")
        assert result == "10.1038/nature12345"

    def test_normalize_doi_with_dx_prefix(self) -> None:
        """Test normalizing DOI with dx.doi.org prefix."""
        result = normalize_doi("https://dx.doi.org/10.1038/nature12345")
        assert result == "10.1038/nature12345"

    def test_normalize_doi_with_doi_colon_prefix(self) -> None:
        """Test normalizing DOI with 'doi:' prefix."""
        result = normalize_doi("doi:10.1038/nature12345")
        assert result == "10.1038/nature12345"

    def test_normalize_doi_with_doi_prefix_uppercase(self) -> None:
        """Test normalizing DOI with 'DOI:' prefix (uppercase)."""
        result = normalize_doi("DOI: 10.1038/nature12345")
        assert result == "10.1038/nature12345"

    def test_normalize_doi_with_whitespace(self) -> None:
        """Test normalizing DOI with leading/trailing whitespace."""
        result = normalize_doi("  10.1038/nature12345  ")
        assert result == "10.1038/nature12345"

    def test_normalize_doi_case_insensitive(self) -> None:
        """Test that DOI normalization converts to lowercase."""
        result = normalize_doi("10.1038/NATURE12345")
        assert result == "10.1038/nature12345"

    def test_normalize_doi_mixed_case_with_prefix(self) -> None:
        """Test normalizing DOI with mixed case and prefix."""
        result = normalize_doi("https://DOI.ORG/10.1038/NATURE12345")
        assert result == "10.1038/nature12345"

    def test_normalize_doi_none_input(self) -> None:
        """Test normalizing None DOI returns None."""
        result = normalize_doi(None)
        assert result is None

    def test_normalize_doi_empty_string(self) -> None:
        """Test normalizing empty string returns None."""
        result = normalize_doi("")
        assert result is None

    def test_normalize_doi_whitespace_only(self) -> None:
        """Test normalizing whitespace-only string returns None."""
        result = normalize_doi("   ")
        assert result is None

    def test_normalize_doi_invalid_format(self) -> None:
        """Test normalizing invalid DOI format returns None."""
        result = normalize_doi("not-a-valid-doi")
        assert result is None

    def test_normalize_doi_missing_prefix(self) -> None:
        """Test normalizing DOI missing the '10.' prefix returns None."""
        result = normalize_doi("1038/nature12345")
        assert result is None

    def test_normalize_doi_missing_suffix(self) -> None:
        """Test normalizing DOI missing the suffix returns None."""
        result = normalize_doi("10.1038/")
        assert result is None

    def test_normalize_doi_complex_suffix(self) -> None:
        """Test normalizing DOI with complex suffix."""
        result = normalize_doi("10.1145/3580305.3599315")
        assert result == "10.1145/3580305.3599315"

    def test_normalize_doi_with_version(self) -> None:
        """Test normalizing DOI with version suffix."""
        result = normalize_doi("https://doi.org/10.1038/nature.2020.27710")
        assert result == "10.1038/nature.2020.27710"


class TestDeduplicateByDOI:
    """Test DOI-based deduplication functionality."""

    @pytest.fixture
    def sample_work(self) -> LiteratureWork:
        """Create a sample literature work."""
        return LiteratureWork(
            id="W2741809807",
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

    def test_deduplicate_empty_list(self) -> None:
        """Test deduplicating empty list returns empty list."""
        result = deduplicate_by_doi([])
        assert result == []

    def test_deduplicate_single_work(self, sample_work: LiteratureWork) -> None:
        """Test deduplicating single work returns same work."""
        result = deduplicate_by_doi([sample_work])
        assert len(result) == 1
        assert result[0].id == sample_work.id

    def test_deduplicate_duplicate_doi_keeps_higher_citations(self, sample_work: LiteratureWork) -> None:
        """Test deduplication keeps work with higher citation count."""
        work1 = LiteratureWork(
            id="W1",
            doi="10.1038/nature12345",
            title="Test Paper",
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
            title="Test Paper",
            authors=[],
            publication_year=2020,
            cited_by_count=50,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        result = deduplicate_by_doi([work1, work2])
        assert len(result) == 1
        assert result[0].id == "W1"  # Higher citation count

    def test_deduplicate_duplicate_doi_equal_citations_keeps_newer(self) -> None:
        """Test deduplication keeps more recently published work when citation count is equal."""
        work1 = LiteratureWork(
            id="W1",
            doi="10.1038/nature12345",
            title="Test Paper",
            authors=[],
            publication_year=2019,
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
            title="Test Paper",
            authors=[],
            publication_year=2020,
            cited_by_count=100,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        result = deduplicate_by_doi([work1, work2])
        assert len(result) == 1
        assert result[0].id == "W2"  # More recent publication

    def test_deduplicate_without_doi(self) -> None:
        """Test deduplicating works without DOI."""
        work1 = LiteratureWork(
            id="W1",
            doi=None,
            title="Paper 1",
            authors=[],
            publication_year=2020,
            cited_by_count=10,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )
        work2 = LiteratureWork(
            id="W2",
            doi=None,
            title="Paper 2",
            authors=[],
            publication_year=2020,
            cited_by_count=20,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        result = deduplicate_by_doi([work1, work2])
        assert len(result) == 2  # Both kept since no DOI

    def test_deduplicate_invalid_doi_treated_as_no_doi(self) -> None:
        """Test deduplicating works with invalid DOI treats them as without DOI."""
        work1 = LiteratureWork(
            id="W1",
            doi="invalid-doi-format",
            title="Paper 1",
            authors=[],
            publication_year=2020,
            cited_by_count=10,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )
        work2 = LiteratureWork(
            id="W2",
            doi="10.1038/nature12345",
            title="Paper 2",
            authors=[],
            publication_year=2020,
            cited_by_count=20,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        result = deduplicate_by_doi([work1, work2])
        assert len(result) == 2
        # Invalid DOI work should be in the results
        assert any(w.id == "W1" for w in result)
        assert any(w.id == "W2" for w in result)

    def test_deduplicate_doi_with_versions_deduplicated(self) -> None:
        """Test deduplicating DOIs with version info."""
        work1 = LiteratureWork(
            id="W1",
            doi="https://doi.org/10.1038/nature.2020.27710",
            title="Paper",
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
            id="W2",
            doi="10.1038/nature.2020.27710",
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

        result = deduplicate_by_doi([work1, work2])
        assert len(result) == 1
        assert result[0].id == "W2"  # Higher citation count

    def test_deduplicate_preserves_order_with_doi(self) -> None:
        """Test that deduplication preserves order: DOI works first, then non-DOI."""
        work_no_doi = LiteratureWork(
            id="W_no_doi",
            doi=None,
            title="No DOI",
            authors=[],
            publication_year=2020,
            cited_by_count=10,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )
        work_with_doi = LiteratureWork(
            id="W_with_doi",
            doi="10.1038/nature12345",
            title="With DOI",
            authors=[],
            publication_year=2020,
            cited_by_count=10,
            abstract=None,
            journal=None,
            is_oa=False,
            access_url=None,
            source="openalex",
        )

        result = deduplicate_by_doi([work_no_doi, work_with_doi])
        assert len(result) == 2
        assert result[0].id == "W_with_doi"  # DOI works come first
        assert result[1].id == "W_no_doi"

    def test_deduplicate_complex_scenario(self) -> None:
        """Test deduplication with complex mix of works."""
        works = [
            # Duplicate pair with same DOI
            LiteratureWork(
                id="W1",
                doi="10.1038/A",
                title="A",
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
                doi="10.1038/A",
                title="A",
                authors=[],
                publication_year=2020,
                cited_by_count=100,
                abstract=None,
                journal=None,
                is_oa=False,
                access_url=None,
                source="openalex",
            ),
            # Another unique DOI
            LiteratureWork(
                id="W3",
                doi="10.1038/B",
                title="B",
                authors=[],
                publication_year=2021,
                cited_by_count=75,
                abstract=None,
                journal=None,
                is_oa=False,
                access_url=None,
                source="openalex",
            ),
            # No DOI works
            LiteratureWork(
                id="W4",
                doi=None,
                title="C",
                authors=[],
                publication_year=2022,
                cited_by_count=30,
                abstract=None,
                journal=None,
                is_oa=False,
                access_url=None,
                source="openalex",
            ),
            LiteratureWork(
                id="W5",
                doi=None,
                title="D",
                authors=[],
                publication_year=2022,
                cited_by_count=40,
                abstract=None,
                journal=None,
                is_oa=False,
                access_url=None,
                source="openalex",
            ),
        ]

        result = deduplicate_by_doi(works)
        assert len(result) == 4  # W1 removed (duplicate), others kept
        result_ids = {w.id for w in result}
        assert result_ids == {"W2", "W3", "W4", "W5"}
        # Verify W2 (higher citations) was kept over W1
        assert "W2" in result_ids
        assert "W1" not in result_ids
