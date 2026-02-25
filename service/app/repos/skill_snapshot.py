import logging
from typing import Sequence
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.skill_snapshot import SkillSnapshot, SkillSnapshotCreate

logger = logging.getLogger(__name__)


class SkillSnapshotRepository:
    """Repository for managing skill snapshots (version history)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_snapshot(self, snapshot_data: SkillSnapshotCreate) -> SkillSnapshot:
        """
        Creates a new skill snapshot with auto-incremented version number.
        This function does NOT commit the transaction.
        """
        logger.debug(f"Creating skill snapshot for skill_id: {snapshot_data.skill_id}")

        version = await self.get_next_version(snapshot_data.skill_id)

        snapshot = SkillSnapshot(
            skill_id=snapshot_data.skill_id,
            version=version,
            skill_md_content=snapshot_data.skill_md_content,
            resource_manifest=snapshot_data.resource_manifest,
            skill_metadata=snapshot_data.skill_metadata,
            commit_message=snapshot_data.commit_message,
        )

        self.db.add(snapshot)
        await self.db.flush()
        await self.db.refresh(snapshot)

        logger.debug(f"Created skill snapshot {snapshot.id} version {version} for skill {snapshot_data.skill_id}")
        return snapshot

    async def get_snapshot_by_id(self, snapshot_id: UUID) -> SkillSnapshot | None:
        """Fetches a skill snapshot by its ID."""
        logger.debug(f"Fetching skill snapshot with id: {snapshot_id}")
        return await self.db.get(SkillSnapshot, snapshot_id)

    async def get_latest_snapshot(self, skill_id: UUID) -> SkillSnapshot | None:
        """Fetches the latest snapshot for a skill."""
        logger.debug(f"Fetching latest skill snapshot for skill_id: {skill_id}")
        statement = (
            select(SkillSnapshot)
            .where(SkillSnapshot.skill_id == skill_id)
            .order_by(col(SkillSnapshot.version).desc())
            .limit(1)
        )
        result = await self.db.exec(statement)
        return result.first()

    async def list_snapshots(self, skill_id: UUID, limit: int | None = None) -> Sequence[SkillSnapshot]:
        """Lists all snapshots for a skill, ordered by version descending."""
        logger.debug(f"Listing skill snapshots for skill_id: {skill_id}")
        statement = (
            select(SkillSnapshot).where(SkillSnapshot.skill_id == skill_id).order_by(col(SkillSnapshot.version).desc())
        )

        if limit:
            statement = statement.limit(limit)

        result = await self.db.exec(statement)
        return result.all()

    async def get_next_version(self, skill_id: UUID) -> int:
        """Calculates the next version number for a skill."""
        latest = await self.get_latest_snapshot(skill_id)
        return 1 if not latest else latest.version + 1

    async def get_snapshot_by_version(self, skill_id: UUID, version: int) -> SkillSnapshot | None:
        """Fetches a specific version of a skill snapshot."""
        logger.debug(f"Fetching skill snapshot version {version} for skill_id: {skill_id}")
        statement = select(SkillSnapshot).where(
            SkillSnapshot.skill_id == skill_id,
            SkillSnapshot.version == version,
        )
        result = await self.db.exec(statement)
        return result.first()
