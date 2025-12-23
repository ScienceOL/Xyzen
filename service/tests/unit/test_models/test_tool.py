"""Tests for Tool model."""

from uuid import uuid4

from app.models.tool import (
    ToolCreate,
    ToolFunctionCreate,
    ToolFunctionUpdate,
    ToolStatus,
    ToolUpdate,
    ToolVersionCreate,
)


class TestToolModel:
    """Test Tool related SQLModels."""

    def test_tool_create_defaults(self) -> None:
        """Test Tool default values."""
        tool = ToolCreate(user_id="user-123", name="my-tool")
        assert tool.is_active is True
        assert tool.tags_json == "[]"
        assert tool.description is None

    def test_tool_update_logic(self) -> None:
        """Test Tool partial update."""
        update = ToolUpdate(name="new-tool-name", is_active=False)
        assert update.name == "new-tool-name"
        assert update.is_active is False
        assert update.description is None
        assert update.tags_json is None

    def test_tool_version_create_defaults(self) -> None:
        """Test ToolVersion default values."""
        version = ToolVersionCreate(
            user_id="user-123", tool_id=uuid4(), requirements="requests", code_content="print('hello')"
        )
        assert version.version == 1
        assert version.status == ToolStatus.BUILDING

    def test_tool_version_status_enum(self) -> None:
        """Test ToolStatus enum values."""
        # Valid values
        for status in [ToolStatus.BUILDING, ToolStatus.READY, ToolStatus.FAILED, ToolStatus.DEPRECATED]:
            version = ToolVersionCreate(
                user_id="user-123", tool_id=uuid4(), requirements="", code_content="", status=status
            )
            assert version.status == status

    def test_tool_function_create_defaults(self) -> None:
        """Test ToolFunction default values."""
        func = ToolFunctionCreate(user_id="user-123", function_name="my_func", tool_version_id=uuid4())
        assert func.input_schema == "{}"
        assert func.output_schema == "{}"
        assert func.docstring is None

    def test_tool_function_update(self) -> None:
        """Test ToolFunction partial update."""
        update = ToolFunctionUpdate(function_name="new_func", input_schema='{"type": "object"}')
        assert update.function_name == "new_func"
        assert update.input_schema == '{"type": "object"}'
        assert update.output_schema is None
