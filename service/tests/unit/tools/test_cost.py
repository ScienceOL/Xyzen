"""Unit tests for tool cost calculation."""

import pytest

from app.tools.cost import calculate_tool_cost
from app.tools.registry import BuiltinToolRegistry, ToolCostConfig, ToolInfo


class TestCalculateToolCost:
    """Tests for calculate_tool_cost function."""

    @pytest.fixture(autouse=True)
    def setup_registry(self) -> None:
        """Set up test registry before each test."""
        BuiltinToolRegistry.clear()

        # Register mock tools for testing
        from unittest.mock import MagicMock

        mock_tool = MagicMock()
        mock_tool.name = "test_tool"
        mock_tool.description = "Test tool"

        # Tool with base cost only
        BuiltinToolRegistry._metadata["generate_image"] = ToolInfo(
            id="generate_image",
            name="Generate Image",
            description="Generate images",
            category="image",
            cost=ToolCostConfig(base_cost=10, input_image_cost=5),
        )

        # Tool with input_image_cost
        BuiltinToolRegistry._metadata["read_image"] = ToolInfo(
            id="read_image",
            name="Read Image",
            description="Read images",
            category="image",
            cost=ToolCostConfig(base_cost=2),
        )

        # Tool with output_file_cost
        BuiltinToolRegistry._metadata["knowledge_write"] = ToolInfo(
            id="knowledge_write",
            name="Knowledge Write",
            description="Write files",
            category="knowledge",
            cost=ToolCostConfig(output_file_cost=5),
        )

        # Tool with no cost
        BuiltinToolRegistry._metadata["knowledge_read"] = ToolInfo(
            id="knowledge_read",
            name="Knowledge Read",
            description="Read files",
            category="knowledge",
            cost=ToolCostConfig(),
        )

        # Web search tool
        BuiltinToolRegistry._metadata["web_search"] = ToolInfo(
            id="web_search",
            name="Web Search",
            description="Search the web",
            category="search",
            cost=ToolCostConfig(base_cost=1),
        )

    def test_generate_image_without_reference(self) -> None:
        """Test generate_image cost without reference image."""
        cost = calculate_tool_cost(
            tool_name="generate_image",
            tool_args={"prompt": "a beautiful sunset"},
            tool_result={"success": True, "image_id": "abc123"},
        )
        # Base cost only (10), no input_image_cost
        assert cost == 10

    def test_generate_image_with_reference(self) -> None:
        """Test generate_image cost with single reference image."""
        cost = calculate_tool_cost(
            tool_name="generate_image",
            tool_args={"prompt": "a beautiful sunset", "image_ids": ["ref123"]},
            tool_result={"success": True, "image_id": "abc123"},
        )
        # Base cost (10) + input_image_cost (5) = 15
        assert cost == 15

    def test_generate_image_with_multiple_references(self) -> None:
        """Test generate_image cost with multiple reference images."""
        cost = calculate_tool_cost(
            tool_name="generate_image",
            tool_args={"prompt": "combine these images", "image_ids": ["ref1", "ref2", "ref3"]},
            tool_result={"success": True, "image_id": "abc123"},
        )
        # Base cost (10) + input_image_cost (5) * 3 = 25
        assert cost == 25

    def test_generate_image_with_empty_image_ids(self) -> None:
        """Test generate_image cost with empty image_ids list."""
        cost = calculate_tool_cost(
            tool_name="generate_image",
            tool_args={"prompt": "a sunset", "image_ids": []},
            tool_result={"success": True, "image_id": "abc123"},
        )
        # Base cost only (10), empty list means no input images
        assert cost == 10

    def test_read_image_cost(self) -> None:
        """Test read_image cost."""
        cost = calculate_tool_cost(
            tool_name="read_image",
            tool_args={"image_id": "abc123", "question": "What is in this image?"},
            tool_result={"success": True, "analysis": "A beautiful sunset"},
        )
        assert cost == 2

    def test_knowledge_write_creating_file(self) -> None:
        """Test knowledge_write cost when creating a new file."""
        cost = calculate_tool_cost(
            tool_name="knowledge_write",
            tool_args={"filename": "report.txt", "content": "Hello world"},
            tool_result={"success": True, "message": "Created file: report.txt"},
        )
        # output_file_cost (5) for creating new file
        assert cost == 5

    def test_knowledge_write_updating_file(self) -> None:
        """Test knowledge_write cost when updating an existing file."""
        cost = calculate_tool_cost(
            tool_name="knowledge_write",
            tool_args={"filename": "report.txt", "content": "Updated content"},
            tool_result={"success": True, "message": "Updated file: report.txt"},
        )
        # No cost for updating (message doesn't contain "Created")
        assert cost == 0

    def test_knowledge_read_is_free(self) -> None:
        """Test that knowledge_read is free."""
        cost = calculate_tool_cost(
            tool_name="knowledge_read",
            tool_args={"filename": "report.txt"},
            tool_result={"success": True, "content": "Hello world"},
        )
        assert cost == 0

    def test_web_search_cost(self) -> None:
        """Test web_search cost."""
        cost = calculate_tool_cost(
            tool_name="web_search",
            tool_args={"query": "Python programming"},
            tool_result={"results": [{"title": "Result 1"}]},
        )
        assert cost == 1

    def test_unknown_tool_is_free(self) -> None:
        """Test that unknown tools have zero cost."""
        cost = calculate_tool_cost(
            tool_name="unknown_tool",
            tool_args={"some": "args"},
            tool_result={"some": "result"},
        )
        assert cost == 0

    def test_no_args_provided(self) -> None:
        """Test cost calculation when no args are provided."""
        cost = calculate_tool_cost(
            tool_name="generate_image",
            tool_args=None,
            tool_result={"success": True, "image_id": "abc123"},
        )
        # Should only return base cost
        assert cost == 10

    def test_no_result_provided(self) -> None:
        """Test cost calculation when no result is provided."""
        cost = calculate_tool_cost(
            tool_name="knowledge_write",
            tool_args={"filename": "test.txt", "content": "Hello"},
            tool_result=None,
        )
        # Should only return base cost (0 for knowledge_write)
        assert cost == 0

    def test_failed_tool_execution(self) -> None:
        """Test that failed tool executions don't charge output_file_cost."""
        cost = calculate_tool_cost(
            tool_name="knowledge_write",
            tool_args={"filename": "test.txt", "content": "Hello"},
            tool_result={"success": False, "error": "Permission denied"},
        )
        # No charge for failed execution
        assert cost == 0
