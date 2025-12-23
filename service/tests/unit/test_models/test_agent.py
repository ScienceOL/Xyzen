"""Tests for Agent model."""

from uuid import uuid4

import pytest

from app.models.agent import AgentCreate, AgentScope, AgentUpdate
from tests.factories.agent import AgentCreateFactory


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
        agent = AgentCreateFactory.build(tags=tags)
        assert agent.tags == tags

    def test_agent_update_operations(self) -> None:
        """Test partial updates work as expected."""
        update = AgentUpdate(name="New Name", temperature=0.9)
        assert update.name == "New Name"
        assert update.temperature == 0.9
        assert update.description is None

    def test_agent_create_full_payload(self) -> None:
        """Test creating agent with all fields populated via factory."""
        agent = AgentCreateFactory.build(
            scope=AgentScope.SYSTEM,
            tags=["a", "b"],
            require_tool_confirmation=True,
            provider_id=uuid4(),
        )
        assert agent.scope == AgentScope.SYSTEM
        assert agent.tags == ["a", "b"]
        assert agent.require_tool_confirmation is True
        assert agent.provider_id is not None  # Factory generates this
