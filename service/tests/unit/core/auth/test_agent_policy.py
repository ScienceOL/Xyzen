"""Unit tests for AgentPolicy authorization logic."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.common.code import ErrCode, ErrCodeError
from app.core.auth.policies.agent_policy import AgentPolicy
from app.models.agent import AgentScope


def _make_agent(user_id: str = "owner-user", scope: AgentScope = AgentScope.USER):
    """Create a mock agent with the given attributes."""
    agent = MagicMock()
    agent.id = uuid4()
    agent.user_id = user_id
    agent.scope = scope
    return agent


class TestAgentPolicyAuthorizeRead:
    @pytest.fixture
    def policy(self) -> AgentPolicy:
        policy = AgentPolicy.__new__(AgentPolicy)
        policy.agent_repo = AsyncMock()
        policy.fga = None
        return policy

    async def test_owner_access(self, policy: AgentPolicy) -> None:
        agent = _make_agent(user_id="user-1")
        policy.agent_repo.get_agent_by_id.return_value = agent

        result = await policy.authorize_read(agent.id, "user-1")
        assert result is agent

    async def test_system_scope_access(self, policy: AgentPolicy) -> None:
        agent = _make_agent(user_id="other-user", scope=AgentScope.SYSTEM)
        policy.agent_repo.get_agent_by_id.return_value = agent

        result = await policy.authorize_read(agent.id, "any-user")
        assert result is agent

    async def test_published_marketplace_access_via_fga(self, policy: AgentPolicy) -> None:
        """Non-owner access is granted when FGA check passes (e.g., published marketplace agent)."""
        agent = _make_agent(user_id="other-user")
        policy.agent_repo.get_agent_by_id.return_value = agent
        policy.fga = AsyncMock()
        policy.fga.check.return_value = True

        result = await policy.authorize_read(agent.id, "reader-user")
        assert result is agent
        policy.fga.check.assert_awaited_once_with("reader-user", "viewer", "agent", str(agent.id))

    async def test_non_owner_no_fga_denied(self, policy: AgentPolicy) -> None:
        """Non-owner without FGA access is denied."""
        agent = _make_agent(user_id="other-user")
        policy.agent_repo.get_agent_by_id.return_value = agent

        with pytest.raises(ErrCodeError) as exc_info:
            await policy.authorize_read(agent.id, "reader-user")
        assert exc_info.value.code == ErrCode.AGENT_ACCESS_DENIED

    async def test_non_owner_fga_denied(self, policy: AgentPolicy) -> None:
        """Non-owner is denied when FGA check returns False."""
        agent = _make_agent(user_id="other-user")
        policy.agent_repo.get_agent_by_id.return_value = agent
        policy.fga = AsyncMock()
        policy.fga.check.return_value = False

        with pytest.raises(ErrCodeError) as exc_info:
            await policy.authorize_read(agent.id, "reader-user")
        assert exc_info.value.code == ErrCode.AGENT_ACCESS_DENIED

    async def test_not_found(self, policy: AgentPolicy) -> None:
        policy.agent_repo.get_agent_by_id.return_value = None

        with pytest.raises(ErrCodeError) as exc_info:
            await policy.authorize_read(uuid4(), "any-user")
        assert exc_info.value.code == ErrCode.AGENT_NOT_FOUND


class TestAgentPolicyAuthorizeWrite:
    @pytest.fixture
    def policy(self) -> AgentPolicy:
        policy = AgentPolicy.__new__(AgentPolicy)
        policy.agent_repo = AsyncMock()

        policy.fga = None
        return policy

    async def test_owner_write(self, policy: AgentPolicy) -> None:
        agent = _make_agent(user_id="user-1")
        policy.agent_repo.get_agent_by_id.return_value = agent

        result = await policy.authorize_write(agent.id, "user-1")
        assert result is agent

    async def test_non_owner_write_denied(self, policy: AgentPolicy) -> None:
        agent = _make_agent(user_id="owner")
        policy.agent_repo.get_agent_by_id.return_value = agent

        with pytest.raises(ErrCodeError) as exc_info:
            await policy.authorize_write(agent.id, "other-user")
        assert exc_info.value.code == ErrCode.AGENT_NOT_OWNED

    async def test_not_found(self, policy: AgentPolicy) -> None:
        policy.agent_repo.get_agent_by_id.return_value = None

        with pytest.raises(ErrCodeError) as exc_info:
            await policy.authorize_write(uuid4(), "any-user")
        assert exc_info.value.code == ErrCode.AGENT_NOT_FOUND


class TestAgentPolicyAuthorizeDelete:
    @pytest.fixture
    def policy(self) -> AgentPolicy:
        policy = AgentPolicy.__new__(AgentPolicy)
        policy.agent_repo = AsyncMock()

        policy.fga = None
        return policy

    async def test_owner_delete(self, policy: AgentPolicy) -> None:
        agent = _make_agent(user_id="user-1")
        policy.agent_repo.get_agent_by_id_raw.return_value = agent

        result = await policy.authorize_delete(agent.id, "user-1")
        assert result is agent

    async def test_non_owner_delete_denied(self, policy: AgentPolicy) -> None:
        agent = _make_agent(user_id="owner")
        policy.agent_repo.get_agent_by_id_raw.return_value = agent

        with pytest.raises(ErrCodeError) as exc_info:
            await policy.authorize_delete(agent.id, "other-user")
        assert exc_info.value.code == ErrCode.AGENT_NOT_OWNED

    async def test_not_found(self, policy: AgentPolicy) -> None:
        policy.agent_repo.get_agent_by_id_raw.return_value = None

        with pytest.raises(ErrCodeError) as exc_info:
            await policy.authorize_delete(uuid4(), "any-user")
        assert exc_info.value.code == ErrCode.AGENT_NOT_FOUND
