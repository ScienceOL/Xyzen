"""Unit tests for topic title auto-rename model selection."""

from __future__ import annotations

import pytest

from app.core.chat.topic_generator import _select_title_generation_model
from app.schemas.provider import ProviderType


class TestTopicGeneratorModelSelection:
    @pytest.mark.parametrize(
        ("provider_type", "session_model", "default_model", "expected"),
        [
            (ProviderType.GOOGLE_VERTEX, "gemini-3-pro-image-preview", "gemini-3-pro", "gemini-2.5-flash"),
            (ProviderType.AZURE_OPENAI, "gpt-5.2", "gpt-4.1", "gpt-5-mini"),
            (None, "gpt-4.1", "gpt-5-mini", "gpt-4.1"),
            (None, None, "gpt-5-mini", "gpt-5-mini"),
        ],
    )
    def test_select_title_generation_model(
        self,
        provider_type: ProviderType | None,
        session_model: str | None,
        default_model: str | None,
        expected: str,
    ) -> None:
        assert (
            _select_title_generation_model(
                provider_type=provider_type,
                session_model=session_model,
                default_model=default_model,
            )
            == expected
        )
