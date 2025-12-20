"""
Unit tests for AgentRepository class, focusing on MCP server linkage operations.
"""

from uuid import uuid4

import pytest
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.agent import Agent, AgentScope
from models.links import AgentMcpServerLink
from models.mcp import McpServer
from repos.agent import AgentRepository


@pytest.mark.asyncio
class TestAgentRepositorySyncAgentMcps:
    """Test suite for sync_agent_mcps method."""

    async def test_sync_agent_mcps_creates_missing_system_links(self, db_session: AsyncSession) -> None:
        """Test that sync creates links to system-level MCP servers."""
        # Setup: Create a system MCP server
        mcp_server = McpServer(
            name="system_mcp",
            url="http://localhost:8000",
            token="test_token",
            user_id=None,  # System-level
        )
        db_session.add(mcp_server)
        await db_session.flush()

        # Create an agent
        agent = Agent(
            name="test_agent",
            scope=AgentScope.USER,
            user_id="user123",
        )
        db_session.add(agent)
        await db_session.flush()

        # Execute: Sync MCP servers for the agent
        repo = AgentRepository(db_session)
        await repo.sync_agent_mcps(agent.id)

        # Verify: Link should be created
        stmt = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent.id)
        result = await db_session.exec(stmt)
        links = result.all()
        assert len(links) == 1
        assert links[0].mcp_server_id == mcp_server.id

    async def test_sync_agent_mcps_creates_user_owned_links(self, db_session: AsyncSession) -> None:
        """Test that sync creates links to user-owned MCP servers."""
        # Setup: Create a user-owned MCP server
        mcp_server = McpServer(
            name="user_mcp",
            url="http://localhost:8001",
            token="test_token",
            user_id="user123",
        )
        db_session.add(mcp_server)
        await db_session.flush()

        # Create an agent for the same user
        agent = Agent(
            name="test_agent",
            scope=AgentScope.USER,
            user_id="user123",
        )
        db_session.add(agent)
        await db_session.flush()

        # Execute: Sync MCP servers
        repo = AgentRepository(db_session)
        await repo.sync_agent_mcps(agent.id)

        # Verify: Link should be created
        stmt = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent.id)
        result = await db_session.exec(stmt)
        links = result.all()
        assert len(links) == 1
        assert links[0].mcp_server_id == mcp_server.id

    async def test_sync_agent_mcps_excludes_other_user_servers(self, db_session: AsyncSession) -> None:
        """Test that sync excludes MCP servers owned by other users."""
        # Setup: Create MCP servers for different users
        mcp_server_user1 = McpServer(
            name="user1_mcp",
            url="http://localhost:8001",
            token="test_token",
            user_id="user1",
        )
        mcp_server_user2 = McpServer(
            name="user2_mcp",
            url="http://localhost:8002",
            token="test_token",
            user_id="user2",
        )
        db_session.add(mcp_server_user1)
        db_session.add(mcp_server_user2)
        await db_session.flush()

        # Create an agent for user1
        agent = Agent(
            name="test_agent",
            scope=AgentScope.USER,
            user_id="user1",
        )
        db_session.add(agent)
        await db_session.flush()

        # Execute: Sync MCP servers
        repo = AgentRepository(db_session)
        await repo.sync_agent_mcps(agent.id)

        # Verify: Only user1's server should be linked
        stmt = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent.id)
        result = await db_session.exec(stmt)
        links = result.all()
        linked_ids = {link.mcp_server_id for link in links}
        assert mcp_server_user1.id in linked_ids
        assert mcp_server_user2.id not in linked_ids

    async def test_sync_agent_mcps_removes_stale_links(self, db_session: AsyncSession) -> None:
        """Test that sync removes links to servers no longer accessible."""
        # Setup: Create two MCP servers
        mcp_server_accessible = McpServer(
            name="accessible_mcp",
            url="http://localhost:8001",
            token="test_token",
            user_id=None,  # System-level
        )
        mcp_server_inaccessible = McpServer(
            name="inaccessible_mcp",
            url="http://localhost:8002",
            token="test_token",
            user_id="other_user",
        )
        db_session.add(mcp_server_accessible)
        db_session.add(mcp_server_inaccessible)
        await db_session.flush()

        # Create an agent
        agent = Agent(
            name="test_agent",
            scope=AgentScope.USER,
            user_id="user123",
        )
        db_session.add(agent)
        await db_session.flush()

        # Create existing links (both accessible and inaccessible)
        link1 = AgentMcpServerLink(
            agent_id=agent.id,
            mcp_server_id=mcp_server_accessible.id,
        )
        link2 = AgentMcpServerLink(
            agent_id=agent.id,
            mcp_server_id=mcp_server_inaccessible.id,
        )
        db_session.add(link1)
        db_session.add(link2)
        await db_session.flush()

        # Execute: Sync MCP servers
        repo = AgentRepository(db_session)
        await repo.sync_agent_mcps(agent.id)

        # Verify: Only the accessible link should remain
        stmt = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent.id)
        result = await db_session.exec(stmt)
        links = result.all()
        linked_ids = {link.mcp_server_id for link in links}
        assert mcp_server_accessible.id in linked_ids
        assert mcp_server_inaccessible.id not in linked_ids

    async def test_sync_agent_mcps_idempotent(self, db_session: AsyncSession) -> None:
        """Test that sync is idempotent (multiple calls produce same result)."""
        # Setup: Create a system MCP server
        mcp_server = McpServer(
            name="system_mcp",
            url="http://localhost:8000",
            token="test_token",
            user_id=None,
        )
        db_session.add(mcp_server)
        await db_session.flush()

        # Create an agent
        agent = Agent(
            name="test_agent",
            scope=AgentScope.USER,
            user_id="user123",
        )
        db_session.add(agent)
        await db_session.flush()

        # Execute: Sync twice
        repo = AgentRepository(db_session)
        await repo.sync_agent_mcps(agent.id)
        await repo.sync_agent_mcps(agent.id)

        # Verify: Only one link should exist
        stmt = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent.id)
        result = await db_session.exec(stmt)
        links = result.all()
        assert len(links) == 1

    async def test_sync_agent_mcps_agent_not_found(self, db_session: AsyncSession) -> None:
        """Test that sync raises ValueError when agent not found."""
        repo = AgentRepository(db_session)
        nonexistent_agent_id = uuid4()

        with pytest.raises(ValueError, match="Agent not found"):
            await repo.sync_agent_mcps(nonexistent_agent_id)

    async def test_sync_agent_mcps_with_mixed_servers(self, db_session: AsyncSession) -> None:
        """Test sync with a mix of system and user-owned servers."""
        # Setup: Create multiple server types
        system_mcp = McpServer(
            name="system_mcp",
            url="http://localhost:8000",
            token="test_token",
            user_id=None,
        )
        user_mcp = McpServer(
            name="user_mcp",
            url="http://localhost:8001",
            token="test_token",
            user_id="user123",
        )
        other_user_mcp = McpServer(
            name="other_user_mcp",
            url="http://localhost:8002",
            token="test_token",
            user_id="other_user",
        )
        db_session.add(system_mcp)
        db_session.add(user_mcp)
        db_session.add(other_user_mcp)
        await db_session.flush()

        # Create an agent
        agent = Agent(
            name="test_agent",
            scope=AgentScope.USER,
            user_id="user123",
        )
        db_session.add(agent)
        await db_session.flush()

        # Execute: Sync
        repo = AgentRepository(db_session)
        await repo.sync_agent_mcps(agent.id)

        # Verify: Only system and user-owned servers should be linked
        stmt = select(AgentMcpServerLink).where(AgentMcpServerLink.agent_id == agent.id)
        result = await db_session.exec(stmt)
        links = result.all()
        linked_ids = {link.mcp_server_id for link in links}
        assert system_mcp.id in linked_ids
        assert user_mcp.id in linked_ids
        assert other_user_mcp.id not in linked_ids
        assert len(linked_ids) == 2
