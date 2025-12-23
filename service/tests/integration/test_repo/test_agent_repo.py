import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent import AgentScope
from app.repos.agent import AgentRepository
from tests.factories.agent import AgentCreateFactory


@pytest.mark.integration
class TestAgentRepository:
    """Integration tests for AgentRepository."""

    @pytest.fixture
    def agent_repo(self, db_session: AsyncSession) -> AgentRepository:
        return AgentRepository(db_session)

    async def test_create_and_get_agent(self, agent_repo: AgentRepository, db_session: AsyncSession):
        """Test creating an agent and retrieving it."""
        user_id = "test-user-repo"
        agent_create = AgentCreateFactory.build(scope=AgentScope.USER)

        # Create
        created_agent = await agent_repo.create_agent(agent_create, user_id)
        assert created_agent.id is not None
        assert created_agent.name == agent_create.name
        assert created_agent.user_id == user_id

        # Get by ID
        fetched_agent = await agent_repo.get_agent_by_id(created_agent.id)
        assert fetched_agent is not None
        assert fetched_agent.id == created_agent.id

    async def test_get_agent_by_user_and_name(self, agent_repo: AgentRepository, db_session: AsyncSession):
        """Test the deduplication lookup method."""
        user_id = "test-user-dedup"
        name = "Unique Agent Name"
        agent_create = AgentCreateFactory.build(name=name, scope=AgentScope.USER)

        await agent_repo.create_agent(agent_create, user_id)

        # Look up
        found = await agent_repo.get_agent_by_user_and_name(user_id, name)
        assert found is not None
        assert found.name == name
        assert found.user_id == user_id

        # Look up non-existent
        not_found = await agent_repo.get_agent_by_user_and_name(user_id, "Non Existent")
        assert not_found is None

    async def test_get_agents_by_user(self, agent_repo: AgentRepository, db_session: AsyncSession):
        """Test listing agents for a user."""
        user_id = "test-user-list"

        # Create 2 agents
        await agent_repo.create_agent(AgentCreateFactory.build(), user_id)
        await agent_repo.create_agent(AgentCreateFactory.build(), user_id)

        # Create agent for another user
        await agent_repo.create_agent(AgentCreateFactory.build(), "other-user")

        agents = await agent_repo.get_agents_by_user(user_id)
        assert len(agents) == 2
        for agent in agents:
            assert agent.user_id == user_id
