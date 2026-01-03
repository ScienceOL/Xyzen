"""Unit tests for LiteLLM model filtering helpers."""

from __future__ import annotations

import pytest

from app.core.llm.service import ModelFilter


class TestModelFilter:
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
        f = ModelFilter.no_expensive_azure_filter()
        assert f(model_name) is expected
