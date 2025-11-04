"""Tests for Message model."""

import pytest
from datetime import datetime, timezone
from uuid import uuid4, UUID

from models.message import Message, MessageCreate, MessageUpdate, MessageRead


class TestMessageModel:
    """Test Message SQLModel."""

    def test_message_create_valid(self):
        """Test creating a valid message."""
        topic_id = uuid4()
        data = {
            "role": "user",
            "content": "Hello, how are you?",
            "topic_id": topic_id,
        }
        message = MessageCreate(**data)

        assert message.role == "user"
        assert message.content == "Hello, how are you?"
        assert message.topic_id == topic_id

    def test_message_table_model(self):
        """Test Message table model with automatic fields."""
        topic_id = uuid4()
        message = Message(
            role="assistant",
            content="I'm doing well, thank you!",
            topic_id=topic_id,
        )

        # ID should be generated automatically
        assert message.id is not None
        assert isinstance(message.id, UUID)

        # created_at should be set automatically
        assert message.created_at is not None
        assert isinstance(message.created_at, datetime)
        assert message.created_at.tzinfo == timezone.utc

        # Check other fields
        assert message.role == "assistant"
        assert message.content == "I'm doing well, thank you!"
        assert message.topic_id == topic_id

    @pytest.mark.parametrize("role", ["user", "assistant", "system", "tool", "function"])
    def test_message_roles(self, role: str):
        """Test different message roles."""
        topic_id = uuid4()
        message = MessageCreate(
            role=role,
            content="Test content",
            topic_id=topic_id,
        )

        assert message.role == role

    def test_message_update_partial(self):
        """Test Message update with partial data."""
        update_data = MessageUpdate(
            content="Updated content",
        )

        assert update_data.content == "Updated content"
        assert update_data.role is None  # Not updated

    def test_message_update_all_fields(self):
        """Test Message update with all fields."""
        update_data = MessageUpdate(
            role="system",
            content="Updated system message",
        )

        assert update_data.role == "system"
        assert update_data.content == "Updated system message"

    def test_message_read_model(self):
        """Test MessageRead model with required fields."""
        topic_id = uuid4()
        message_id = uuid4()
        created_at = datetime.now(timezone.utc)

        message = MessageRead(
            id=message_id,
            role="user",
            content="Test message",
            topic_id=topic_id,
            created_at=created_at,
        )

        assert message.id == message_id
        assert message.role == "user"
        assert message.content == "Test message"
        assert message.topic_id == topic_id
        assert message.created_at == created_at

    def test_message_long_content(self):
        """Test message with long content."""
        topic_id = uuid4()
        long_content = "A" * 10000  # Very long content

        message = MessageCreate(
            role="user",
            content=long_content,
            topic_id=topic_id,
        )

        assert message.content == long_content
        assert len(message.content) == 10000

    def test_message_empty_content(self):
        """Test message with empty content (should be allowed)."""
        topic_id = uuid4()

        message = MessageCreate(
            role="system",
            content="",
            topic_id=topic_id,
        )

        assert message.content == ""

    def test_message_multiline_content(self):
        """Test message with multiline content."""
        topic_id = uuid4()
        multiline_content = """This is a multiline message.

It contains multiple paragraphs.

And some code:
```python
def hello():
    print("Hello, World!")
```

End of message."""

        message = MessageCreate(
            role="user",
            content=multiline_content,
            topic_id=topic_id,
        )

        assert message.content == multiline_content

    def test_message_special_characters(self):
        """Test message with special characters and Unicode."""
        topic_id = uuid4()
        special_content = "Hello! 🌟 This message contains émojis, ñ special chars, and 中文字符."

        message = MessageCreate(
            role="user",
            content=special_content,
            topic_id=topic_id,
        )

        assert message.content == special_content

    def test_message_json_content(self):
        """Test message with JSON-like content."""
        topic_id = uuid4()
        json_content = '{"type": "function_call", "name": "get_weather", "args": {"location": "San Francisco"}}'

        message = MessageCreate(
            role="tool",
            content=json_content,
            topic_id=topic_id,
        )

        assert message.content == json_content

    def test_message_serialization(self):
        """Test message model serialization."""
        topic_id = uuid4()
        message = MessageCreate(
            role="user",
            content="Test serialization",
            topic_id=topic_id,
        )

        # Test model_dump
        message_dict = message.model_dump()
        expected_keys = {"role", "content", "topic_id"}
        assert set(message_dict.keys()) == expected_keys
        assert message_dict["role"] == "user"
        assert message_dict["content"] == "Test serialization"
        assert message_dict["topic_id"] == topic_id

        # Test recreating from dict
        new_message = MessageCreate(**message_dict)
        assert new_message.role == message.role
        assert new_message.content == message.content
        assert new_message.topic_id == message.topic_id
