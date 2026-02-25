import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Sequence
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.skills.storage import (
    build_skill_prefix,
    load_skill_md,
    load_skill_resource_files,
    sync_skill_folder,
)
from app.core.storage import get_storage_service
from app.models.file import File
from app.models.skill import Skill, SkillCreate, SkillScope
from app.models.skill_marketplace import (
    SkillMarketplace,
    SkillMarketplaceCreate,
    SkillMarketplaceUpdate,
)
from app.models.skill_snapshot import SkillSnapshot, SkillSnapshotCreate
from app.repos import (
    SkillLikeRepository,
    SkillMarketplaceRepository,
    SkillRepository,
    SkillSnapshotRepository,
)
from app.repos.file import FileRepository

logger = logging.getLogger(__name__)


class SkillMarketplaceService:
    """Service for managing skill marketplace operations."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.skill_repo = SkillRepository(db)
        self.snapshot_repo = SkillSnapshotRepository(db)
        self.marketplace_repo = SkillMarketplaceRepository(db)
        self.like_repo = SkillLikeRepository(db)
        self.file_repo = FileRepository(db)

    async def create_snapshot_from_skill(
        self,
        skill: Skill,
        commit_message: str,
    ) -> SkillSnapshot:
        """
        Creates a snapshot from the current skill state.

        Loads SKILL.md content, builds resource manifest from File records,
        and captures metadata.
        """
        logger.debug(f"Creating snapshot for skill {skill.id}")

        # Load SKILL.md content
        skill_md_content = await load_skill_md(
            skill.resource_prefix,
            skill=skill,
            db=self.db,
        )
        if not skill_md_content:
            skill_md_content = ""

        # Build resource manifest from File records
        resource_manifest = await self._build_resource_manifest(skill)

        # Build metadata dict
        skill_metadata: dict[str, Any] = {
            "name": skill.name,
            "description": skill.description,
            "license": skill.license,
            "compatibility": skill.compatibility,
        }

        snapshot_data = SkillSnapshotCreate(
            skill_id=skill.id,
            skill_md_content=skill_md_content,
            resource_manifest=resource_manifest,
            skill_metadata=skill_metadata,
            commit_message=commit_message,
        )

        snapshot = await self.snapshot_repo.create_snapshot(snapshot_data)
        return snapshot

    async def _build_resource_manifest(self, skill: Skill) -> list[dict[str, Any]]:
        """Build resource manifest from the skill's files."""
        manifest: list[dict[str, Any]] = []

        if skill.root_folder_id:
            # DB-backed: query File table
            from sqlmodel import col, select

            statement = (
                select(File)
                .where(File.skill_id == skill.id)
                .where(col(File.is_deleted).is_(False))
                .where(File.is_dir == False)  # noqa: E712
            )
            items = (await self.db.exec(statement)).all()

            # Build path map for reconstructing relative paths
            all_statement = select(File).where(File.skill_id == skill.id).where(col(File.is_deleted).is_(False))
            all_items = {f.id: f for f in (await self.db.exec(all_statement)).all()}

            def _build_path(file_item: File) -> str:
                parts: list[str] = [file_item.original_filename]
                current = file_item
                while current.parent_id and current.parent_id != skill.root_folder_id:
                    parent = all_items.get(current.parent_id)
                    if not parent:
                        break
                    parts.insert(0, parent.original_filename)
                    current = parent
                return "/".join(parts)

            for item in items:
                if item.original_filename == "SKILL.md" and item.parent_id == skill.root_folder_id:
                    continue
                rel_path = _build_path(item)
                content_hash = hashlib.sha256(rel_path.encode()).hexdigest()[:16]
                manifest.append(
                    {
                        "path": rel_path,
                        "size_bytes": item.file_size or 0,
                        "content_hash": content_hash,
                    }
                )
        elif skill.resource_prefix:
            # Legacy OSS-prefix path
            storage = get_storage_service()
            files = await storage.list_files(prefix=f"{skill.resource_prefix}/")
            for f in files:
                key = f.get("key", "")
                if not key:
                    continue
                base = f"{skill.resource_prefix}/"
                if not key.startswith(base):
                    continue
                rel_path = key[len(base) :]
                if not rel_path or rel_path == "SKILL.md":
                    continue
                manifest.append(
                    {
                        "path": rel_path,
                        "size_bytes": f.get("size", 0),
                        "content_hash": "",
                    }
                )

        return manifest

    async def publish_skill(
        self,
        skill: Skill,
        commit_message: str,
        is_published: bool = True,
        readme: str | None = None,
        author_display_name: str | None = None,
        author_avatar_url: str | None = None,
    ) -> SkillMarketplace | None:
        """
        Publishes a skill to the marketplace or updates an existing listing.
        """
        logger.info(f"Publishing skill {skill.id} to marketplace")

        # Create snapshot
        snapshot = await self.create_snapshot_from_skill(skill, commit_message)

        # Check if listing already exists
        existing_listing = await self.marketplace_repo.get_by_skill_id(skill.id)

        if existing_listing:
            update_data = SkillMarketplaceUpdate(
                active_snapshot_id=snapshot.id,
                name=skill.name,
                description=skill.description,
                tags=[],
                is_published=is_published,
                readme=readme,
                author_display_name=author_display_name,
                author_avatar_url=author_avatar_url,
            )
            listing = await self.marketplace_repo.update_listing(existing_listing.id, update_data)

            if is_published and not existing_listing.is_published and not existing_listing.first_published_at:
                if listing:
                    listing.first_published_at = datetime.now(timezone.utc)
                    self.db.add(listing)
                    await self.db.flush()
        else:
            listing_data = SkillMarketplaceCreate(
                skill_id=skill.id,
                active_snapshot_id=snapshot.id,
                user_id=skill.user_id or "",
                author_display_name=author_display_name,
                author_avatar_url=author_avatar_url,
                name=skill.name,
                description=skill.description,
                tags=[],
                readme=readme,
            )
            listing = await self.marketplace_repo.create_listing(listing_data)

            if is_published:
                listing.first_published_at = datetime.now(timezone.utc)
                listing.is_published = True
                self.db.add(listing)
                await self.db.flush()

        return listing

    async def update_listing_details(
        self, marketplace_id: UUID, update_data: SkillMarketplaceUpdate
    ) -> SkillMarketplace | None:
        """Updates listing details without creating a new snapshot."""
        logger.info(f"Updating details for skill marketplace listing {marketplace_id}")
        return await self.marketplace_repo.update_listing(marketplace_id, update_data)

    async def unpublish_skill(self, marketplace_id: UUID) -> bool:
        """Unpublishes a skill from the marketplace."""
        logger.info(f"Unpublishing skill marketplace listing {marketplace_id}")
        update_data = SkillMarketplaceUpdate(is_published=False)
        listing = await self.marketplace_repo.update_listing(marketplace_id, update_data)
        return listing is not None

    async def fork_skill(
        self,
        marketplace_id: UUID,
        user_id: str,
        fork_name: str | None = None,
    ) -> Skill:
        """
        Forks a skill from the marketplace to create a user's own copy.
        """
        logger.info(f"Forking skill marketplace listing {marketplace_id} for user {user_id}")

        listing = await self.marketplace_repo.get_by_id(marketplace_id)
        if not listing:
            raise ValueError(f"Skill marketplace listing {marketplace_id} not found")

        if not listing.is_published:
            raise ValueError("Cannot fork an unpublished skill")

        # Get active snapshot
        snapshot = await self.snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)
        if not snapshot:
            raise ValueError(f"Snapshot {listing.active_snapshot_id} not found")

        # Determine name
        base_name = fork_name or f"{snapshot.skill_metadata.get('name', listing.name)} (Fork)"

        # Ensure unique name
        existing_skills = await self.skill_repo.get_skills_by_user(user_id)
        existing_names = {s.name for s in existing_skills}
        final_name = base_name
        counter = 1
        while final_name in existing_names:
            final_name = f"{base_name} ({counter})"
            counter += 1

        # Create skill record
        skill_data = SkillCreate(
            name=final_name,
            description=snapshot.skill_metadata.get("description", listing.description or ""),
            scope=SkillScope.USER,
            license=snapshot.skill_metadata.get("license"),
            compatibility=snapshot.skill_metadata.get("compatibility"),
        )
        new_skill = await self.skill_repo.create_skill(skill_data, user_id)

        # Copy SKILL.md + resource files to new OSS prefix
        prefix = build_skill_prefix(user_id, new_skill.id)

        # Load resource files from snapshot source
        source_skill = await self.skill_repo.get_skill_by_id(listing.skill_id)
        resource_files = await load_skill_resource_files(
            source_skill.resource_prefix if source_skill else None,
            skill=source_skill,
            db=self.db,
        )

        # Convert to sync format
        resources = [{"path": r["path"], "content": r["content"]} for r in resource_files] if resource_files else None

        await sync_skill_folder(
            prefix=prefix,
            skill_md=snapshot.skill_md_content,
            resources=resources,
        )

        # Update skill with prefix
        new_skill.resource_prefix = prefix
        self.db.add(new_skill)
        await self.db.flush()

        # Increment forks count
        await self.marketplace_repo.increment_forks(marketplace_id)

        logger.info(f"Successfully forked skill {listing.skill_id} to {new_skill.id} for user {user_id}")
        return new_skill

    async def get_listing_with_snapshot(self, marketplace_id: UUID) -> tuple[SkillMarketplace, SkillSnapshot] | None:
        """Gets a skill marketplace listing with its active snapshot."""
        listing = await self.marketplace_repo.get_by_id(marketplace_id)
        if not listing:
            return None

        snapshot = await self.snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)
        if not snapshot:
            return None

        return (listing, snapshot)

    async def check_user_has_liked(self, marketplace_id: UUID, user_id: str) -> bool:
        """Checks if a user has liked a skill marketplace listing."""
        return await self.like_repo.has_liked(user_id, marketplace_id)

    async def get_starred_listings(self, user_id: str) -> Sequence[SkillMarketplace]:
        """Gets all skill marketplace listings starred by a user."""
        return await self.marketplace_repo.get_liked_listings_by_user(user_id)

    async def get_listing_history(self, marketplace_id: UUID) -> Sequence[SkillSnapshot]:
        """Gets the version history of a skill marketplace listing."""
        listing = await self.marketplace_repo.get_by_id(marketplace_id)
        if not listing:
            return []
        return await self.snapshot_repo.list_snapshots(listing.skill_id)

    async def toggle_like(self, marketplace_id: UUID, user_id: str) -> tuple[bool, int]:
        """
        Toggles a user's like on a skill marketplace listing.

        Returns:
            Tuple of (is_liked, new_likes_count).
        """
        has_liked = await self.like_repo.has_liked(user_id, marketplace_id)

        if has_liked:
            await self.like_repo.unlike(user_id, marketplace_id)
            likes_count = await self.marketplace_repo.decrement_likes(marketplace_id)
            is_liked = False
        else:
            await self.like_repo.like(user_id, marketplace_id)
            likes_count = await self.marketplace_repo.increment_likes(marketplace_id)
            is_liked = True

        return (is_liked, likes_count)
