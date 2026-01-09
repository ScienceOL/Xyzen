"""Unit tests for model filtering utilities."""

from __future__ import annotations

import pytest

from app.core.model_registry.filter import ModelFilter, ProviderFilterConfig


class TestProviderFilterConfig:
    """Tests for the ProviderFilterConfig class."""

    @pytest.mark.parametrize(
        ("model_name", "expected"),
        [
            ("azure/gpt-5.2-pro", False),
            ("azure/gpt-5-pro", False),
            ("azure/gpt-5.2", True),
            ("azure/gpt-5", True),
            ("gpt-5-pro", False),
        ],
    )
    def test_no_expensive_azure_filter(self, model_name: str, expected: bool) -> None:
        """Test that expensive Azure models are filtered out."""
        config = ProviderFilterConfig(
            no_slash=False,  # Allow slashes for azure/model format
            no_date_suffix=False,
            no_tts=False,
            no_expensive_azure=True,
        )
        assert config.matches(model_name) is expected

    @pytest.mark.parametrize(
        ("model_name", "expected"),
        [
            ("gpt-5", True),
            ("gpt-5.2", True),
            ("gpt-4o", False),  # Version 4 < min_version 5
            ("gemini-2.5-flash", False),  # Not GPT
        ],
    )
    def test_openai_filter(self, model_name: str, expected: bool) -> None:
        """Test OpenAI provider filter config."""
        config = ProviderFilterConfig(
            include_patterns=["gpt"],
            min_version=5,
            no_date_suffix=False,
        )
        assert config.matches(model_name) is expected

    @pytest.mark.parametrize(
        ("model_name", "expected"),
        [
            ("gemini-2.5-flash", True),
            ("gemini-2.5-pro", True),
            ("gemini-2.0-flash", False),  # Version 2.0 < min_version 2.5
            ("gemini-1.5-pro", False),  # Version 1.5 < min_version 2.5
            ("gpt-5", False),  # Not Gemini
        ],
    )
    def test_google_filter(self, model_name: str, expected: bool) -> None:
        """Test Google provider filter config."""
        config = ProviderFilterConfig(
            include_patterns=["gemini"],
            min_version=2.5,
            no_date_suffix=False,
        )
        assert config.matches(model_name) is expected

    @pytest.mark.parametrize(
        ("model_name", "expected"),
        [
            ("gpt-5-0125", False),  # Date suffix
            ("gpt-5-1106", False),  # Date suffix
            ("gpt-5", True),
            ("gpt-5-turbo", True),
        ],
    )
    def test_date_suffix_filter(self, model_name: str, expected: bool) -> None:
        """Test date suffix filtering."""
        config = ProviderFilterConfig(
            no_date_suffix=True,
            no_tts=False,
        )
        assert config.matches(model_name) is expected

    @pytest.mark.parametrize(
        ("model_name", "expected"),
        [
            ("tts-1", False),
            ("tts-1-hd", False),
            ("gpt-5", True),
        ],
    )
    def test_tts_filter(self, model_name: str, expected: bool) -> None:
        """Test TTS model filtering."""
        config = ProviderFilterConfig(
            no_tts=True,
            no_date_suffix=False,
        )
        assert config.matches(model_name) is expected


class TestModelFilter:
    """Tests for the ModelFilter utility class."""

    @pytest.mark.parametrize(
        ("model_name", "expected"),
        [
            ("gemini-1.5-pro", (1.5, "gemini-1.5-pro")),
            ("gemini-2.0-flash", (2.0, "gemini-2.0-flash")),
            ("gemini-2.5-flash", (2.5, "gemini-2.5-flash")),
            ("gpt-4o", (4.0, "gpt-4o")),
            ("gpt-5", (5.0, "gpt-5")),
            ("claude-3-opus", (3.0, "claude-3-opus")),
        ],
    )
    def test_extract_version(self, model_name: str, expected: tuple[float, str]) -> None:
        """Test version extraction from model names."""
        result = ModelFilter.extract_version(model_name)
        assert result == expected

    def test_extract_version_no_version(self) -> None:
        """Test version extraction when no version is present."""
        result = ModelFilter.extract_version("text-embedding-ada")
        assert result is None

    def test_filter_models(self) -> None:
        """Test filtering a list of models with config."""
        models = ["gpt-5", "gpt-5.2", "gpt-4o", "gemini-2.5-flash", "tts-1"]
        config = ProviderFilterConfig(
            include_patterns=["gpt"],
            min_version=5,
            no_tts=True,
            no_date_suffix=False,
        )
        result = ModelFilter.filter_models(models, config)
        assert result == ["gpt-5", "gpt-5.2"]
