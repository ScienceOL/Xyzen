"""Tests for Agent model."""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import pytest

from models.agent import Agent, AgentCreate, AgentRead, AgentScope, AgentUpdate


class TestAgentModel:
    """Test Agent SQLModel."""

    def test_agent_create_minimal(self):
        """Test creating an agent with minimal required fields."""
        data: dict[str, Any] = {
            "name": "Test Agent",
        }
        agent = AgentCreate(**data)

        assert agent.name == "Test Agent"
        assert agent.description is None
        assert agent.avatar is None
        assert agent.tags is None
        assert agent.model is None
        assert agent.temperature is None
        assert agent.prompt is None
        assert agent.require_tool_confirmation is False
        assert agent.provider_id is None
        assert agent.mcp_server_ids == []

    def test_agent_create_full(self):
        """Test creating an agent with all fields."""
        provider_id = uuid4()
        mcp_server_ids = [uuid4(), uuid4()]

        data: dict[str, Any] = {
            "name": "Advanced Agent",
            "description": "An advanced AI agent with multiple capabilities",
            "avatar": "https://example.com/avatar.png",
            "tags": ["ai", "assistant", "coding"],
            "model": "gpt-4o",
            "temperature": 0.7,
            "prompt": "You are a helpful AI assistant specializing in software development.",
            "require_tool_confirmation": True,
            "provider_id": provider_id,
            "mcp_server_ids": mcp_server_ids,
        }
        agent = AgentCreate(**data)

        assert agent.name == "Advanced Agent"
        assert agent.description == "An advanced AI agent with multiple capabilities"
        assert agent.avatar == "https://example.com/avatar.png"
        assert agent.tags == ["ai", "assistant", "coding"]
        assert agent.model == "gpt-4o"
        assert agent.temperature == 0.7
        assert agent.prompt == "You are a helpful AI assistant specializing in software development."

        assert agent.require_tool_confirmation is True
        assert agent.provider_id == provider_id
        assert agent.mcp_server_ids == mcp_server_ids

    def test_agent_table_model(self):
        """Test Agent table model with automatic fields."""
        agent = Agent(
            scope=AgentScope.USER,
            name="Table Agent",
            user_id="test-user-123",
        )

        # ID should be generated automatically
        assert agent.id is not None
        assert isinstance(agent.id, UUID)

        # Timestamps should be set automatically
        assert agent.created_at is not None
        assert isinstance(agent.created_at, datetime)
        assert agent.created_at.tzinfo == timezone.utc

        assert agent.updated_at is not None
        assert isinstance(agent.updated_at, datetime)
        assert agent.updated_at.tzinfo == timezone.utc

        # Check other fields
        assert agent.name == "Table Agent"

    def test_agent_tags_json_field(self):
        """Test agent tags as JSON field."""
        tags = ["python", "javascript", "ai", "web-development"]

        agent = AgentCreate(
            name="Tagged Agent",
            tags=tags,
        )

        assert agent.tags == tags
        assert isinstance(agent.tags, list)
        assert all(isinstance(tag, str) for tag in agent.tags)

    def test_agent_empty_tags(self):
        """Test agent with empty tags list."""
        agent = AgentCreate(
            name="No Tags Agent",
            tags=[],
        )

        assert agent.tags == []

    def test_agent_temperature_validation(self):
        """Test agent temperature values."""
        # Test valid temperatures
        for temp in [0.0, 0.5, 1.0, 1.5, 2.0]:
            agent = AgentCreate(
                name="Temp Agent",
                temperature=temp,
            )
            assert agent.temperature == temp

    def test_agent_mcp_server_ids(self):
        """Test agent MCP server IDs handling."""
        server_ids = [uuid4(), uuid4(), uuid4()]

        agent = AgentCreate(
            name="MCP Agent",
            mcp_server_ids=server_ids,
        )

        assert agent.mcp_server_ids == server_ids
        assert all(isinstance(server_id, UUID) for server_id in agent.mcp_server_ids)

    def test_agent_update_partial(self):
        """Test Agent update with partial data."""
        update_data = AgentUpdate(
            name="Updated Agent Name",
            temperature=0.5,
            require_tool_confirmation=True,
        )

        assert update_data.name == "Updated Agent Name"
        assert update_data.temperature == 0.5
        assert update_data.require_tool_confirmation is True
        assert update_data.description is None  # Not updated
        assert update_data.model is None  # Not updated

    def test_agent_update_tags(self):
        """Test Agent update with new tags."""
        new_tags = ["updated", "new-feature", "beta"]

        update_data = AgentUpdate(tags=new_tags)
        assert update_data.tags == new_tags

    def test_agent_update_mcp_servers(self):
        """Test Agent update with new MCP server IDs."""
        new_server_ids = [uuid4(), uuid4()]

        update_data = AgentUpdate(mcp_server_ids=new_server_ids)
        assert update_data.mcp_server_ids == new_server_ids

    def test_agent_read_model(self):
        """Test AgentRead model with required fields."""
        agent_id = uuid4()
        provider_id = uuid4()
        updated_at = datetime.now(timezone.utc)

        agent = AgentRead(
            scope=AgentScope.USER,
            id=agent_id,
            name="Read Agent",
            description="Agent for reading tests",
            user_id="test-user-123",
            provider_id=provider_id,
            updated_at=updated_at,
        )

        assert agent.id == agent_id
        assert agent.name == "Read Agent"
        assert agent.description == "Agent for reading tests"

        assert agent.provider_id == provider_id
        assert agent.updated_at == updated_at

    def test_agent_long_prompt(self):
        """Test agent with long prompt."""
        long_prompt = """You are an advanced AI assistant with the following capabilities:

1. Code Analysis and Review
   - Analyze code for bugs, security issues, and performance problems
   - Suggest improvements and best practices
   - Explain complex algorithms and data structures

2. Project Planning
   - Break down large projects into manageable tasks
   - Estimate time and resource requirements
   - Identify potential risks and mitigation strategies

3. Technical Documentation
   - Write clear, comprehensive documentation
   - Create API specifications and user guides
   - Generate code comments and docstrings

4. Problem Solving
   - Approach problems systematically
   - Consider multiple solutions and trade-offs
   - Provide step-by-step implementation guidance

Always be helpful, accurate, and thorough in your responses."""

        agent = AgentCreate(
            name="Advanced Assistant",
            prompt=long_prompt,
        )

        assert agent.prompt == long_prompt

    def test_agent_avatar_url(self):
        """Test agent with various avatar URL formats."""
        test_urls = [
            "https://example.com/avatar.png",
            "http://localhost:3000/assets/avatar.jpg",
            "/static/images/agent-avatar.svg",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
        ]

        for url in test_urls:
            agent = AgentCreate(
                name=f"Agent with {url[:20]}...",
                avatar=url,
            )
            assert agent.avatar == url

    def test_agent_special_characters(self):
        """Test agent with special characters and Unicode."""
        special_name = "Agent 🤖 with émojis and ñ chars"
        special_description = "Description with 中文字符 and symbols: @#$%^&*()"

        agent = AgentCreate(
            name=special_name,
            description=special_description,
        )

        assert agent.name == special_name
        assert agent.description == special_description

    def test_agent_serialization(self):
        """Test agent model serialization."""
        provider_id = uuid4()
        server_ids = [uuid4(), uuid4()]

        agent = AgentCreate(
            name="Serialization Agent",
            description="Test serialization",
            tags=["test", "serialization"],
            model="gpt-4o",
            temperature=0.7,
            provider_id=provider_id,
            mcp_server_ids=server_ids,
        )

        # Test model_dump
        agent_dict = agent.model_dump()
        assert agent_dict["name"] == "Serialization Agent"
        assert agent_dict["description"] == "Test serialization"
        assert agent_dict["tags"] == ["test", "serialization"]
        assert agent_dict["model"] == "gpt-4o"
        assert agent_dict["temperature"] == 0.7

        assert agent_dict["provider_id"] == provider_id
        assert agent_dict["mcp_server_ids"] == server_ids

        # Test recreating from dict
        new_agent = AgentCreate(**agent_dict)
        assert new_agent.name == agent.name
        assert new_agent.description == agent.description
        assert new_agent.tags == agent.tags
        assert new_agent.model == agent.model
        assert new_agent.temperature == agent.temperature

        assert new_agent.provider_id == agent.provider_id
        assert new_agent.mcp_server_ids == agent.mcp_server_ids

    @pytest.mark.parametrize("confirmation_required", [True, False])
    def test_agent_tool_confirmation(self, confirmation_required: bool):
        """Test agent tool confirmation setting."""
        agent = AgentCreate(
            name="Confirmation Agent",
            require_tool_confirmation=confirmation_required,
        )

        assert agent.require_tool_confirmation == confirmation_required
