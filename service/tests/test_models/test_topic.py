"""Tests for Topic model."""

from typing import Any
import pytest
from datetime import datetime, timezone
from uuid import uuid4, UUID
from pydantic import ValidationError

from models.topic import Topic, TopicCreate, TopicUpdate, TopicRead


class TestTopicModel:
    """Test Topic SQLModel."""

    def test_topic_create_valid(self):
        """Test creating a valid topic."""
        session_id = uuid4()
        data: dict[str, Any] = {
            "name": "Test Topic",
            "description": "A test topic for conversation",
            "is_active": True,
            "session_id": session_id,
        }
        topic = TopicCreate(**data)

        assert topic.name == "Test Topic"
        assert topic.description == "A test topic for conversation"
        assert topic.is_active is True
        assert topic.session_id == session_id

    def test_topic_create_minimal(self):
        """Test creating a topic with minimal required fields."""
        session_id = uuid4()
        data: dict[str, Any] = {
            "name": "Minimal Topic",
            "session_id": session_id,
        }
        topic = TopicCreate(**data)

        assert topic.name == "Minimal Topic"
        assert topic.description is None  # default value
        assert topic.is_active is True  # default value
        assert topic.session_id == session_id

    def test_topic_table_model(self):
        """Test Topic table model with automatic fields."""
        session_id = uuid4()
        topic = Topic(
            name="Auto Topic",
            session_id=session_id,
        )

        # ID should be generated automatically
        assert topic.id is not None
        assert isinstance(topic.id, UUID)

        # Timestamps should be set automatically
        assert topic.created_at is not None
        assert isinstance(topic.created_at, datetime)
        assert topic.created_at.tzinfo == timezone.utc

        assert topic.updated_at is not None
        assert isinstance(topic.updated_at, datetime)
        assert topic.updated_at.tzinfo == timezone.utc

        # Check other fields
        assert topic.name == "Auto Topic"
        assert topic.session_id == session_id

    def test_topic_name_validation(self):
        """Test topic name validation constraints."""
        session_id = uuid4()

        # Test valid name at boundary
        valid_name = "x" * 100  # Max length
        topic = TopicCreate(name=valid_name, session_id=session_id)
        assert topic.name == valid_name

        # Test name too long
        with pytest.raises(ValidationError) as exc_info:
            TopicCreate(
                name="x" * 101,  # Too long
                session_id=session_id,
            )
        errors = exc_info.value.errors()
        assert any("String should have at most 100 characters" in str(error) for error in errors)

    def test_topic_description_validation(self):
        """Test topic description validation constraints."""
        session_id = uuid4()

        # Test valid description at boundary
        valid_description = "x" * 500  # Max length
        topic = TopicCreate(
            name="Test Topic",
            description=valid_description,
            session_id=session_id,
        )
        assert topic.description == valid_description

        # Test description too long
        with pytest.raises(ValidationError) as exc_info:
            TopicCreate(
                name="Test Topic",
                description="x" * 501,  # Too long
                session_id=session_id,
            )
        errors = exc_info.value.errors()
        assert any("String should have at most 500 characters" in str(error) for error in errors)

    def test_topic_description_none(self):
        """Test topic with None description."""
        session_id = uuid4()
        topic = TopicCreate(
            name="No Description Topic",
            description=None,
            session_id=session_id,
        )

        assert topic.description is None

    def test_topic_description_empty_string(self):
        """Test topic with empty description."""
        session_id = uuid4()
        topic = TopicCreate(
            name="Empty Description Topic",
            description="",
            session_id=session_id,
        )

        assert topic.description == ""

    def test_topic_is_active_default(self):
        """Test topic is_active default value."""
        session_id = uuid4()
        topic = TopicCreate(name="Active Topic", session_id=session_id)
        assert topic.is_active is True

    def test_topic_is_active_explicit(self):
        """Test setting topic is_active explicitly."""
        session_id = uuid4()

        # Test active
        active_topic = TopicCreate(
            name="Active Topic",
            is_active=True,
            session_id=session_id,
        )
        assert active_topic.is_active is True

        # Test inactive
        inactive_topic = TopicCreate(
            name="Inactive Topic",
            is_active=False,
            session_id=session_id,
        )
        assert inactive_topic.is_active is False

    def test_topic_update_partial(self):
        """Test Topic update with partial data."""
        update_data = TopicUpdate(
            name="Updated Topic Name",
            is_active=False,
        )

        assert update_data.name == "Updated Topic Name"
        assert update_data.is_active is False
        assert update_data.description is None  # Not updated

    def test_topic_update_all_fields(self):
        """Test Topic update with all fields."""
        update_data = TopicUpdate(
            name="Fully Updated Topic",
            description="Updated description",
            is_active=False,
        )

        assert update_data.name == "Fully Updated Topic"
        assert update_data.description == "Updated description"
        assert update_data.is_active is False

    def test_topic_update_validation(self):
        """Test Topic update validation."""
        # TopicUpdate doesn't inherit validation from TopicBase, so it may allow longer fields
        # Test that we can create update objects (they may not have strict validation)
        update_long_name = TopicUpdate(name="x" * 101)
        assert update_long_name.name == "x" * 101

        update_long_desc = TopicUpdate(description="x" * 501)
        assert update_long_desc.description == "x" * 501

    def test_topic_read_model(self):
        """Test TopicRead model with required fields."""
        session_id = uuid4()
        topic_id = uuid4()
        updated_at = datetime.now(timezone.utc)

        topic = TopicRead(
            id=topic_id,
            name="Read Topic",
            description="Topic for reading",
            is_active=True,
            session_id=session_id,
            updated_at=updated_at,
        )

        assert topic.id == topic_id
        assert topic.name == "Read Topic"
        assert topic.description == "Topic for reading"
        assert topic.is_active is True
        assert topic.session_id == session_id
        assert topic.updated_at == updated_at

    def test_topic_special_characters(self):
        """Test topic with special characters and Unicode."""
        session_id = uuid4()
        special_name = "Topic with émojis 🚀 and ñ chars"
        special_desc = "Description with 中文字符 and symbols: @#$%^&*()"

        topic = TopicCreate(
            name=special_name,
            description=special_desc,
            session_id=session_id,
        )

        assert topic.name == special_name
        assert topic.description == special_desc

    def test_topic_serialization(self):
        """Test topic model serialization."""
        session_id = uuid4()
        topic = TopicCreate(
            name="Serialization Topic",
            description="Test serialization",
            is_active=True,
            session_id=session_id,
        )

        # Test model_dump
        topic_dict = topic.model_dump()
        expected_keys = {"name", "description", "is_active", "session_id"}
        assert set(topic_dict.keys()) == expected_keys
        assert topic_dict["name"] == "Serialization Topic"
        assert topic_dict["description"] == "Test serialization"
        assert topic_dict["is_active"] is True
        assert topic_dict["session_id"] == session_id

        # Test recreating from dict
        new_topic = TopicCreate(**topic_dict)
        assert new_topic.name == topic.name
        assert new_topic.description == topic.description
        assert new_topic.is_active == topic.is_active
        assert new_topic.session_id == topic.session_id

    def test_topic_multiline_description(self):
        """Test topic with multiline description."""
        session_id = uuid4()
        multiline_desc = """This is a multiline description.

It contains multiple paragraphs and explains
the purpose of this topic in detail.

Features:
- AI conversations
- Code analysis
- Project planning"""

        topic = TopicCreate(
            name="Multiline Topic",
            description=multiline_desc,
            session_id=session_id,
        )

        assert topic.description == multiline_desc
