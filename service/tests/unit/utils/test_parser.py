"""Unit tests for app/utils/parser.py — parse_requirements()."""

import pytest

from app.utils.parser import parse_requirements


class TestParseRequirements:
    """Tests for parse_requirements() with various input formats and flag combinations."""

    # ------------------------------------------------------------------
    # Basic format handling
    # ------------------------------------------------------------------

    def test_simple_newline_separated(self) -> None:
        result = parse_requirements("numpy\npandas\nrequests")
        assert result == ["numpy", "pandas", "requests"]

    def test_simple_space_separated(self) -> None:
        result = parse_requirements("numpy pandas requests")
        assert result == ["numpy", "pandas", "requests"]

    def test_mixed_newlines_and_spaces(self) -> None:
        result = parse_requirements("numpy pandas\nrequests scipy")
        assert result == ["numpy", "pandas", "requests", "scipy"]

    def test_versioned_newline_separated(self) -> None:
        result = parse_requirements("numpy>=1.20.0\npandas==1.3.0")
        assert result == ["numpy", "pandas"]

    # ------------------------------------------------------------------
    # preserve_extras × keep_version matrix
    # ------------------------------------------------------------------

    @pytest.mark.parametrize(
        ("preserve_extras", "keep_version", "expected"),
        [
            (True, True, ["requests[security]>=2.25.0"]),
            (True, False, ["requests[security]"]),
            (False, True, ["requests>=2.25.0"]),
            (False, False, ["requests"]),
        ],
        ids=["extras+version", "extras-only", "version-only", "name-only"],
    )
    def test_extras_version_matrix(self, preserve_extras: bool, keep_version: bool, expected: list[str]) -> None:
        result = parse_requirements(
            "requests[security]>=2.25.0",
            preserve_extras=preserve_extras,
            keep_version=keep_version,
        )
        assert result == expected

    # ------------------------------------------------------------------
    # Version operator coverage
    # ------------------------------------------------------------------

    @pytest.mark.parametrize(
        "spec",
        [
            "numpy>=1.20",
            "numpy<=1.20",
            "numpy==1.20",
            "numpy!=1.20",
            "numpy>1.20",
            "numpy<1.20",
            "numpy~=1.20",
        ],
        ids=[">=", "<=", "==", "!=", ">", "<", "~="],
    )
    def test_version_operators_stripped_by_default(self, spec: str) -> None:
        result = parse_requirements(spec)
        assert result == ["numpy"]

    @pytest.mark.parametrize(
        ("spec", "expected"),
        [
            ("numpy>=1.20", "numpy>=1.20"),
            ("numpy<=2.0", "numpy<=2.0"),
            ("numpy==1.20.3", "numpy==1.20.3"),
            ("numpy!=1.19", "numpy!=1.19"),
            ("numpy~=1.20", "numpy~=1.20"),
        ],
    )
    def test_version_operators_kept(self, spec: str, expected: str) -> None:
        result = parse_requirements(spec, keep_version=True)
        assert result == [expected]

    # ------------------------------------------------------------------
    # Comments, blank lines, whitespace
    # ------------------------------------------------------------------

    def test_comments_ignored(self) -> None:
        result = parse_requirements("# this is a comment\nnumpy\n# another comment\npandas")
        assert result == ["numpy", "pandas"]

    def test_blank_lines_ignored(self) -> None:
        result = parse_requirements("numpy\n\n\npandas\n\n")
        assert result == ["numpy", "pandas"]

    def test_leading_trailing_whitespace(self) -> None:
        result = parse_requirements("  numpy  \n  pandas  ")
        assert result == ["numpy", "pandas"]

    # ------------------------------------------------------------------
    # Deduplication
    # ------------------------------------------------------------------

    def test_duplicate_packages_deduplicated(self) -> None:
        result = parse_requirements("numpy\nnumpy\npandas")
        assert result == ["numpy", "pandas"]

    # ------------------------------------------------------------------
    # Edge cases
    # ------------------------------------------------------------------

    def test_empty_string(self) -> None:
        assert parse_requirements("") == []

    def test_only_whitespace(self) -> None:
        assert parse_requirements("   \n  \n  ") == []

    def test_only_comments(self) -> None:
        assert parse_requirements("# comment one\n# comment two") == []

    def test_single_package(self) -> None:
        assert parse_requirements("numpy") == ["numpy"]

    def test_package_with_dashes_and_dots(self) -> None:
        result = parse_requirements("my-package\nsome.pkg")
        assert result == ["my-package", "some.pkg"]

    # ------------------------------------------------------------------
    # Multiple extras
    # ------------------------------------------------------------------

    def test_multiple_extras(self) -> None:
        result = parse_requirements("django[postgres,redis]>=3.0", preserve_extras=True)
        assert result == ["django[postgres,redis]"]

    def test_multiple_packages_with_versions_on_one_line(self) -> None:
        result = parse_requirements("numpy>=1.20 pandas==1.3 requests>=2.25", keep_version=True)
        assert result == ["numpy>=1.20", "pandas==1.3", "requests>=2.25"]
