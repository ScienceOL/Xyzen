import logging
from typing import Sequence
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent_snapshot import AgentSnapshot, AgentSnapshotCreate

logger = logging.getLogger(__name__)


class AgentSnapshotRepository:
    """Repository for managing agent snapshots (version history)"""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_snapshot(self, snapshot_data: AgentSnapshotCreate) -> AgentSnapshot:
        """
        Creates a new agent snapshot with auto-incremented version number.
        This function does NOT commit the transaction.

        Args:
            snapshot_data: The snapshot data to create.

        Returns:
            The newly created AgentSnapshot instance.
        """
        logger.debug(f"Creating snapshot for agent_id: {snapshot_data.agent_id}")

        # Get next version number
        version = await self.get_next_version(snapshot_data.agent_id)

        # Create snapshot with version
        snapshot = AgentSnapshot(
            agent_id=snapshot_data.agent_id,
            version=version,
            configuration=snapshot_data.configuration,
            mcp_server_configs=snapshot_data.mcp_server_configs,
            knowledge_set_config=snapshot_data.knowledge_set_config,
            commit_message=snapshot_data.commit_message,
        )

        self.db.add(snapshot)
        await self.db.flush()
        await self.db.refresh(snapshot)

        logger.debug(f"Created snapshot {snapshot.id} version {version} for agent {snapshot_data.agent_id}")
        return snapshot

    async def get_snapshot_by_id(self, snapshot_id: UUID) -> AgentSnapshot | None:
        """
        Fetches a snapshot by its ID.

        Args:
            snapshot_id: The UUID of the snapshot to fetch.

        Returns:
            The AgentSnapshot, or None if not found.
        """
        logger.debug(f"Fetching snapshot with id: {snapshot_id}")
        return await self.db.get(AgentSnapshot, snapshot_id)

    async def get_latest_snapshot(self, agent_id: UUID) -> AgentSnapshot | None:
        """
        Fetches the latest snapshot for an agent.

        Args:
            agent_id: The UUID of the agent.

        Returns:
            The latest AgentSnapshot, or None if no snapshots exist.
        """
        logger.debug(f"Fetching latest snapshot for agent_id: {agent_id}")
        statement = (
            select(AgentSnapshot)
            .where(AgentSnapshot.agent_id == agent_id)
            .order_by(col(AgentSnapshot.version).desc())
            .limit(1)
        )
        result = await self.db.exec(statement)
        return result.first()

    async def list_snapshots(self, agent_id: UUID, limit: int | None = None) -> Sequence[AgentSnapshot]:
        """
        Lists all snapshots for an agent, ordered by version descending.

        Args:
            agent_id: The UUID of the agent.
            limit: Optional limit on number of snapshots to return.

        Returns:
            List of AgentSnapshot instances.
        """
        logger.debug(f"Listing snapshots for agent_id: {agent_id}")
        statement = (
            select(AgentSnapshot).where(AgentSnapshot.agent_id == agent_id).order_by(col(AgentSnapshot.version).desc())
        )

        if limit:
            statement = statement.limit(limit)

        result = await self.db.exec(statement)
        return result.all()

    async def get_next_version(self, agent_id: UUID) -> int:
        """
        Calculates the next version number for an agent.

        Args:
            agent_id: The UUID of the agent.

        Returns:
            The next version number (1 if no snapshots exist).
        """
        latest = await self.get_latest_snapshot(agent_id)
        return 1 if not latest else latest.version + 1

    async def get_snapshot_by_version(self, agent_id: UUID, version: int) -> AgentSnapshot | None:
        """
        Fetches a specific version of an agent snapshot.

        Args:
            agent_id: The UUID of the agent.
            version: The version number to fetch.

        Returns:
            The AgentSnapshot, or None if not found.
        """
        logger.debug(f"Fetching snapshot version {version} for agent_id: {agent_id}")
        statement = select(AgentSnapshot).where(
            AgentSnapshot.agent_id == agent_id,
            AgentSnapshot.version == version,
        )
        result = await self.db.exec(statement)
        return result.first()

    async def count_snapshots(self, agent_id: UUID) -> int:
        """
        Counts the number of snapshots for an agent.

        Args:
            agent_id: The UUID of the agent.

        Returns:
            The count of snapshots.
        """
        statement = select(AgentSnapshot).where(AgentSnapshot.agent_id == agent_id)
        result = await self.db.exec(statement)
        return len(list(result.all()))
