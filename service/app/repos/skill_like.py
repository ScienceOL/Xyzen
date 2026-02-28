import logging
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.skill_like import SkillLike

logger = logging.getLogger(__name__)


class SkillLikeRepository:
    """Repository for managing user likes on skill marketplace listings."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def like(self, user_id: str, skill_marketplace_id: UUID) -> bool:
        """
        Creates a like for a skill marketplace listing.
        This function does NOT commit the transaction.

        Returns:
            True if created, False if already exists.
        """
        logger.debug(f"User {user_id} liking skill marketplace listing {skill_marketplace_id}")

        existing = await self.has_liked(user_id, skill_marketplace_id)
        if existing:
            logger.debug(f"User {user_id} has already liked skill marketplace listing {skill_marketplace_id}")
            return False

        like = SkillLike(user_id=user_id, skill_marketplace_id=skill_marketplace_id)
        self.db.add(like)
        await self.db.flush()
        return True

    async def unlike(self, user_id: str, skill_marketplace_id: UUID) -> bool:
        """
        Removes a like from a skill marketplace listing.
        This function does NOT commit the transaction.

        Returns:
            True if removed, False if didn't exist.
        """
        logger.debug(f"User {user_id} unliking skill marketplace listing {skill_marketplace_id}")

        statement = select(SkillLike).where(
            SkillLike.user_id == user_id,
            SkillLike.skill_marketplace_id == skill_marketplace_id,
        )
        result = await self.db.exec(statement)
        like = result.first()

        if not like:
            logger.debug(f"User {user_id} has not liked skill marketplace listing {skill_marketplace_id}")
            return False

        await self.db.delete(like)
        await self.db.flush()
        return True

    async def has_liked(self, user_id: str, skill_marketplace_id: UUID) -> bool:
        """Checks if a user has liked a skill marketplace listing."""
        statement = select(SkillLike).where(
            SkillLike.user_id == user_id,
            SkillLike.skill_marketplace_id == skill_marketplace_id,
        )
        result = await self.db.exec(statement)
        return result.first() is not None

    async def get_likes_for_listings(self, marketplace_ids: list[UUID], user_id: str) -> dict[UUID, bool]:
        """Checks which skill listings a user has liked from a list."""
        if not marketplace_ids:
            return {}

        statement = select(SkillLike.skill_marketplace_id).where(
            col(SkillLike.user_id) == user_id,
            col(SkillLike.skill_marketplace_id).in_(marketplace_ids),
        )
        result = await self.db.exec(statement)
        liked_ids = set(result.all())

        return {marketplace_id: marketplace_id in liked_ids for marketplace_id in marketplace_ids}
