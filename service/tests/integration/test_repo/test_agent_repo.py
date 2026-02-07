import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent import Agent, AgentScope, AgentUpdate
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

    async def test_create_agent_rejects_legacy_graph_config(
        self, agent_repo: AgentRepository, db_session: AsyncSession
    ):
        user_id = "test-user-v3-create"
        legacy_v2 = {
            "version": "2.0",
            "nodes": [
                {
                    "id": "agent",
                    "name": "Legacy Agent",
                    "type": "llm",
                    "llm_config": {"prompt_template": "legacy"},
                }
            ],
            "edges": [
                {"from_node": "START", "to_node": "agent"},
                {"from_node": "agent", "to_node": "END"},
            ],
            "entry_point": "agent",
        }
        agent_create = AgentCreateFactory.build(scope=AgentScope.USER, graph_config=legacy_v2)

        with pytest.raises(Exception):
            await agent_repo.create_agent(agent_create, user_id)

    async def test_get_agent_by_id_rejects_legacy_graph_config(
        self, agent_repo: AgentRepository, db_session: AsyncSession
    ):
        legacy = Agent(
            scope=AgentScope.USER,
            user_id="test-user-v3-read",
            name="legacy",
            graph_config={
                "version": "2.0",
                "nodes": [
                    {
                        "id": "agent",
                        "name": "Legacy Agent",
                        "type": "llm",
                        "llm_config": {"prompt_template": "legacy"},
                    }
                ],
                "edges": [
                    {"from_node": "START", "to_node": "agent"},
                    {"from_node": "agent", "to_node": "END"},
                ],
                "entry_point": "agent",
            },
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        with pytest.raises(Exception):
            await agent_repo.get_agent_by_id(legacy.id)

    async def test_update_agent_rejects_legacy_graph_config(
        self, agent_repo: AgentRepository, db_session: AsyncSession
    ):
        user_id = "test-user-v3-update"
        created = await agent_repo.create_agent(AgentCreateFactory.build(scope=AgentScope.USER), user_id)
        await db_session.flush()

        legacy_v2 = {
            "version": "2.0",
            "nodes": [
                {
                    "id": "agent",
                    "name": "Legacy Agent",
                    "type": "llm",
                    "llm_config": {"prompt_template": "legacy"},
                }
            ],
            "edges": [
                {"from_node": "START", "to_node": "agent"},
                {"from_node": "agent", "to_node": "END"},
            ],
            "entry_point": "agent",
        }
        update = AgentUpdate(graph_config=legacy_v2)
        with pytest.raises(Exception):
            await agent_repo.update_agent(created.id, update)

    async def test_backfill_graph_configs_migrates_legacy_rows(
        self, agent_repo: AgentRepository, db_session: AsyncSession
    ):
        legacy = Agent(
            scope=AgentScope.USER,
            user_id="test-user-v3-backfill",
            name="legacy-backfill",
            graph_config={
                "version": "2.0",
                "nodes": [
                    {
                        "id": "agent",
                        "name": "Legacy Agent",
                        "type": "llm",
                        "llm_config": {"prompt_template": "legacy"},
                    }
                ],
                "edges": [
                    {"from_node": "START", "to_node": "agent"},
                    {"from_node": "agent", "to_node": "END"},
                ],
                "entry_point": "agent",
                "metadata": {
                    "builtin_key": "react",
                    "icon": "brain",
                    "author": "Xyzen",
                    "version": "2.0.0",
                    "pattern": "react",
                    "system_agent_key": "react",
                },
            },
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        summary = await agent_repo.backfill_graph_configs(batch_size=1)
        await db_session.commit()

        upgraded = await db_session.get(Agent, legacy.id)
        assert upgraded is not None
        assert isinstance(upgraded.graph_config, dict)
        assert upgraded.graph_config["schema_version"] == "3.0"
        assert "graph" in upgraded.graph_config
        assert summary["changed_rows"] >= 1
        assert summary["migrated_rows"] >= 1

    async def test_backfill_graph_configs_falls_back_to_default_when_unmigratable(
        self, agent_repo: AgentRepository, db_session: AsyncSession
    ):
        broken = Agent(
            scope=AgentScope.USER,
            user_id="test-user-v3-backfill-default",
            name="broken-backfill",
            graph_config={
                "version": "2.0",
                "nodes": [],
                "edges": [],
            },
            prompt="Use fallback prompt",
        )
        db_session.add(broken)
        await db_session.commit()
        await db_session.refresh(broken)

        summary = await agent_repo.backfill_graph_configs(batch_size=1)
        await db_session.commit()

        upgraded = await db_session.get(Agent, broken.id)
        assert upgraded is not None
        assert isinstance(upgraded.graph_config, dict)
        assert upgraded.graph_config["schema_version"] == "3.0"
        assert upgraded.graph_config["graph"]["entrypoints"] == ["agent"]
        assert summary["fallback_defaults"] >= 1
