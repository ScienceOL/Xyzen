"""Tests for Topic model."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from models.topic import TopicCreate


class TestTopicModel:
    """Test Topic SQLModel."""

    def test_valid_topic_creation(self) -> None:
        """Test creating a valid topic."""
        topic = TopicCreate(name="Valid Topic", description="Desc", session_id=uuid4())
        assert topic.is_active is True  # Default

    @pytest.mark.parametrize(
        "name,is_valid",
        [
            ("Normal Name", True),
            ("x" * 100, True),
            ("x" * 101, False),
        ],
    )
    def test_topic_name_constraints(self, name: str, is_valid: bool) -> None:
        """Test name length constraints."""
        session_id = uuid4()
        if is_valid:
            assert TopicCreate(name=name, session_id=session_id).name == name
        else:
            with pytest.raises(ValidationError):
                TopicCreate(name=name, session_id=session_id)

    @pytest.mark.parametrize(
        "desc,is_valid",
        [
            (None, True),
            ("", True),
            ("x" * 500, True),
            ("x" * 501, False),
        ],
    )
    def test_topic_description_constraints(self, desc: str | None, is_valid: bool) -> None:
        """Test description length constraints."""
        session_id = uuid4()
        if is_valid:
            assert TopicCreate(name="T", description=desc, session_id=session_id).description == desc
        else:
            with pytest.raises(ValidationError):
                TopicCreate(name="T", description=desc, session_id=session_id)
