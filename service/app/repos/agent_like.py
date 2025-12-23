import logging
from typing import Sequence
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent_like import AgentLike

logger = logging.getLogger(__name__)


class AgentLikeRepository:
    """Repository for managing user likes on marketplace listings"""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def like(self, user_id: str, marketplace_id: UUID) -> bool:
        """
        Creates a like for a marketplace listing.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID.
            marketplace_id: The marketplace listing ID.

        Returns:
            True if created, False if already exists.
        """
        logger.debug(f"User {user_id} liking marketplace listing {marketplace_id}")

        # Check if already liked
        existing = await self.has_liked(user_id, marketplace_id)
        if existing:
            logger.debug(f"User {user_id} has already liked marketplace listing {marketplace_id}")
            return False

        like = AgentLike(user_id=user_id, marketplace_id=marketplace_id)
        self.db.add(like)
        await self.db.flush()
        return True

    async def unlike(self, user_id: str, marketplace_id: UUID) -> bool:
        """
        Removes a like from a marketplace listing.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID.
            marketplace_id: The marketplace listing ID.

        Returns:
            True if removed, False if didn't exist.
        """
        logger.debug(f"User {user_id} unliking marketplace listing {marketplace_id}")

        statement = select(AgentLike).where(
            AgentLike.user_id == user_id,
            AgentLike.marketplace_id == marketplace_id,
        )
        result = await self.db.exec(statement)
        like = result.first()

        if not like:
            logger.debug(f"User {user_id} has not liked marketplace listing {marketplace_id}")
            return False

        await self.db.delete(like)
        await self.db.flush()
        return True

    async def has_liked(self, user_id: str, marketplace_id: UUID) -> bool:
        """
        Checks if a user has liked a marketplace listing.

        Args:
            user_id: The user ID.
            marketplace_id: The marketplace listing ID.

        Returns:
            True if liked, False otherwise.
        """
        statement = select(AgentLike).where(
            AgentLike.user_id == user_id,
            AgentLike.marketplace_id == marketplace_id,
        )
        result = await self.db.exec(statement)
        return result.first() is not None

    async def get_user_likes(self, user_id: str) -> Sequence[UUID]:
        """
        Gets all marketplace listing IDs that a user has liked.

        Args:
            user_id: The user ID.

        Returns:
            List of marketplace listing UUIDs.
        """
        logger.debug(f"Fetching likes for user {user_id}")
        statement = select(AgentLike.marketplace_id).where(AgentLike.user_id == user_id)
        result = await self.db.exec(statement)
        return result.all()

    async def get_listing_likes(self, marketplace_id: UUID) -> Sequence[str]:
        """
        Gets all user IDs who have liked a marketplace listing.

        Args:
            marketplace_id: The marketplace listing ID.

        Returns:
            List of user IDs.
        """
        logger.debug(f"Fetching likes for marketplace listing {marketplace_id}")
        statement = select(AgentLike.user_id).where(AgentLike.marketplace_id == marketplace_id)
        result = await self.db.exec(statement)
        return result.all()

    async def count_likes(self, marketplace_id: UUID) -> int:
        """
        Counts the number of likes for a marketplace listing.

        Args:
            marketplace_id: The marketplace listing ID.

        Returns:
            Count of likes.
        """
        statement = select(AgentLike).where(AgentLike.marketplace_id == marketplace_id)
        result = await self.db.exec(statement)
        return len(list(result.all()))

    async def get_likes_for_listings(self, marketplace_ids: list[UUID], user_id: str) -> dict[UUID, bool]:
        """
        Checks which listings a user has liked from a list.

        Args:
            marketplace_ids: List of marketplace listing IDs.
            user_id: The user ID.

        Returns:
            Dictionary mapping marketplace_id to whether user has liked it.
        """
        if not marketplace_ids:
            return {}

        statement = select(AgentLike.marketplace_id).where(
            col(AgentLike.user_id) == user_id,
            col(AgentLike.marketplace_id).in_(marketplace_ids),
        )
        result = await self.db.exec(statement)
        liked_ids = set(result.all())

        return {marketplace_id: marketplace_id in liked_ids for marketplace_id in marketplace_ids}
