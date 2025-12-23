"""Tests for Message model."""

from uuid import uuid4

import pytest

from app.models.message import MessageCreate, MessageUpdate


class TestMessageModel:
    """Test Message SQLModel."""

    @pytest.mark.parametrize("role", ["user", "assistant", "system"])
    def test_message_creation(self, role: str) -> None:
        """Test message creation with different roles."""
        msg = MessageCreate(role=role, content="Hello", topic_id=uuid4())
        assert msg.role == role
        assert msg.content == "Hello"

    def test_message_update(self) -> None:
        """Test message partial update."""
        update = MessageUpdate(content="New content")
        assert update.content == "New content"
        assert update.role is None
