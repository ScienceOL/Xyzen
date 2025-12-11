"""Tests for Agent model."""

from typing import Any
from uuid import uuid4

import pytest

from models.agent import AgentCreate, AgentScope, AgentUpdate


class TestAgentModel:
    """Test Agent SQLModel."""

    def test_agent_create_defaults(self) -> None:
        """Test creating an agent with minimal fields ensures defaults."""
        agent = AgentCreate(name="Minimal Agent")
        assert agent.scope == AgentScope.USER
        assert agent.require_tool_confirmation is False
        assert agent.mcp_server_ids == []
        assert agent.tags is None

    @pytest.mark.parametrize("tags", [None, [], ["coding", "ai"]])
    def test_agent_tags_handling(self, tags: list[str] | None) -> None:
        """Test agent tags are correctly handled (JSON field)."""
        agent = AgentCreate(name="Tag Agent", tags=tags)
        assert agent.tags == tags

    def test_agent_update_operations(self) -> None:
        """Test partial updates work as expected."""
        update = AgentUpdate(name="New Name", temperature=0.9)
        assert update.name == "New Name"
        assert update.temperature == 0.9
        assert update.description is None

    def test_agent_create_full_payload(self) -> None:
        """Test creating agent with all optional fields."""
        data: dict[str, Any] = {
            "name": "Full Agent",
            "scope": AgentScope.SYSTEM,
            "description": "Desc",
            "avatar": "http://img.com",
            "tags": ["a", "b"],
            "model": "gpt-4",
            "temperature": 0.5,
            "prompt": "You are AI",
            "require_tool_confirmation": True,
            "provider_id": uuid4(),
            "mcp_server_ids": [uuid4()],
        }
        agent = AgentCreate(**data)
        for key, value in data.items():
            assert getattr(agent, key) == value
