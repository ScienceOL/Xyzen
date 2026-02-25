import logging
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.skill_marketplace.skill_marketplace_service import SkillMarketplaceService
from app.models.skill import Skill
from app.models.skill_marketplace import (
    SkillMarketplace,
    SkillMarketplaceCreate,
    SkillMarketplaceUpdate,
)
from app.repos import SkillMarketplaceRepository, SkillRepository, SkillSnapshotRepository

logger = logging.getLogger(__name__)


class BuiltinSkillPublisher:
    """Publishes builtin skills as OFFICIAL marketplace listings on server startup."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.skill_repo = SkillRepository(db)
        self.marketplace_repo = SkillMarketplaceRepository(db)
        self.snapshot_repo = SkillSnapshotRepository(db)
        self.marketplace_service = SkillMarketplaceService(db)

    async def ensure_builtin_skill_listings(self) -> dict[str, UUID]:
        """
        Ensure each builtin skill has an OFFICIAL marketplace listing.

        For each builtin skill:
        - If no listing exists: create Snapshot and Marketplace listing.
        - If listing exists and content changed: create new Snapshot, update listing.
        - If listing exists and content unchanged: no-op.

        Returns:
            Mapping of builtin skill name to marketplace listing UUID.
        """
        result: dict[str, UUID] = {}

        builtin_skills = await self.skill_repo.list_builtin_skills()

        for skill in builtin_skills:
            listing = await self.marketplace_repo.get_by_builtin_name(skill.name)

            if listing is None:
                listing = await self._create_listing(skill)
                logger.info(f"Created OFFICIAL skill marketplace listing for '{skill.name}': {listing.id}")
            else:
                listing = await self._update_if_changed(skill, listing)

            result[skill.name] = listing.id

        return result

    async def _create_listing(self, skill: Skill) -> SkillMarketplace:
        """Create Snapshot and Marketplace listing for a builtin skill."""
        snapshot = await self.marketplace_service.create_snapshot_from_skill(
            skill, commit_message=f"Initial publish of builtin skill '{skill.name}'"
        )

        listing_data = SkillMarketplaceCreate(
            skill_id=skill.id,
            active_snapshot_id=snapshot.id,
            user_id=None,
            name=skill.name,
            description=skill.description,
            tags=["official", f"builtin:{skill.name}"],
            scope="official",
            builtin_name=skill.name,
        )
        listing = await self.marketplace_repo.create_listing(listing_data)

        listing.is_published = True
        listing.first_published_at = listing.created_at
        self.db.add(listing)
        await self.db.flush()

        return listing

    async def _update_if_changed(self, skill: Skill, listing: SkillMarketplace) -> SkillMarketplace:
        """Update listing if the builtin skill content has changed since last publish."""
        from app.core.skills.storage import load_skill_md

        # Get current SKILL.md content
        current_md = await load_skill_md(
            skill.resource_prefix,
            skill=skill,
            db=self.db,
        )
        current_md = current_md or ""

        # Get latest snapshot content
        snapshot = await self.snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)
        existing_md = snapshot.skill_md_content if snapshot else ""

        if current_md == existing_md:
            logger.debug(f"Builtin skill '{skill.name}' marketplace listing is up-to-date")
            return listing

        # Content changed — create new snapshot and update listing
        logger.info(f"Builtin skill '{skill.name}' content changed, updating marketplace listing")

        new_snapshot = await self.marketplace_service.create_snapshot_from_skill(
            skill, commit_message=f"Auto-update builtin skill '{skill.name}'"
        )

        listing_update = SkillMarketplaceUpdate(
            active_snapshot_id=new_snapshot.id,
            name=skill.name,
            description=skill.description,
            tags=["official", f"builtin:{skill.name}"],
        )
        updated = await self.marketplace_repo.update_listing(listing.id, listing_update)
        return updated or listing
