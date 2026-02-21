"""Unit tests for app.core.consume.pricing module."""

from app.core.consume.pricing import (
    MODEL_COST_RATES,
    calculate_tool_cost,
    get_model_cost,
)


class TestCalculateToolCost:
    def test_web_search(self) -> None:
        assert calculate_tool_cost("web_search") == 1

    def test_generate_image(self) -> None:
        assert calculate_tool_cost("generate_image") == 10

    def test_knowledge_write(self) -> None:
        assert calculate_tool_cost("knowledge_write") == 5

    def test_read_image(self) -> None:
        assert calculate_tool_cost("read_image") == 2

    def test_unknown_tool_returns_zero(self) -> None:
        assert calculate_tool_cost("unknown_tool") == 0

    def test_empty_string_returns_zero(self) -> None:
        assert calculate_tool_cost("") == 0


class TestGetModelCost:
    def test_known_model(self) -> None:
        cost = get_model_cost("gemini-3-pro-preview", input_tokens=1000, output_tokens=500)
        rates = MODEL_COST_RATES["gemini-3-pro-preview"]
        expected = 1000 * rates["input"] + 500 * rates["output"]
        assert cost == expected

    def test_unknown_model_returns_zero(self) -> None:
        assert get_model_cost("unknown-model", input_tokens=1000, output_tokens=500) == 0.0

    def test_zero_tokens(self) -> None:
        assert get_model_cost("gemini-3-pro-preview", input_tokens=0, output_tokens=0) == 0.0

    def test_only_input_tokens(self) -> None:
        cost = get_model_cost("gemini-3-pro-preview", input_tokens=1000, output_tokens=0)
        expected = 1000 * MODEL_COST_RATES["gemini-3-pro-preview"]["input"]
        assert cost == expected

    def test_only_output_tokens(self) -> None:
        cost = get_model_cost("gemini-3-pro-preview", input_tokens=0, output_tokens=1000)
        expected = 1000 * MODEL_COST_RATES["gemini-3-pro-preview"]["output"]
        assert cost == expected
