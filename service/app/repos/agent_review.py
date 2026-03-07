import logging
from datetime import datetime, timezone
from typing import Sequence
from uuid import UUID

from sqlmodel import desc, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent_review import AgentReview

logger = logging.getLogger(__name__)


class AgentReviewRepository:
    """Repository for managing user reviews on marketplace listings"""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_or_update(
        self,
        user_id: str,
        marketplace_id: UUID,
        is_positive: bool,
        content: str | None,
        author_display_name: str | None = None,
        author_avatar_url: str | None = None,
    ) -> tuple[AgentReview, bool, bool | None]:
        """
        Creates or updates a review for a marketplace listing.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID.
            marketplace_id: The marketplace listing ID.
            is_positive: Whether the review is positive.
            content: Optional review text.
            author_display_name: Author display name snapshot.
            author_avatar_url: Author avatar URL snapshot.

        Returns:
            Tuple of (review, is_new, old_is_positive).
            old_is_positive is None when is_new is True.
        """
        existing = await self.get_by_user_and_listing(user_id, marketplace_id)

        if existing:
            old_is_positive = existing.is_positive
            existing.is_positive = is_positive
            existing.content = content
            existing.updated_at = datetime.now(timezone.utc)
            if author_display_name is not None:
                existing.author_display_name = author_display_name
            if author_avatar_url is not None:
                existing.author_avatar_url = author_avatar_url
            self.db.add(existing)
            await self.db.flush()
            await self.db.refresh(existing)
            return (existing, False, old_is_positive)

        review = AgentReview(
            user_id=user_id,
            marketplace_id=marketplace_id,
            is_positive=is_positive,
            content=content,
            author_display_name=author_display_name,
            author_avatar_url=author_avatar_url,
        )
        self.db.add(review)
        await self.db.flush()
        await self.db.refresh(review)
        return (review, True, None)

    async def get_by_user_and_listing(self, user_id: str, marketplace_id: UUID) -> AgentReview | None:
        """
        Gets a user's review for a specific listing.

        Args:
            user_id: The user ID.
            marketplace_id: The marketplace listing ID.

        Returns:
            The AgentReview, or None if not found.
        """
        statement = select(AgentReview).where(
            AgentReview.user_id == user_id,
            AgentReview.marketplace_id == marketplace_id,
        )
        result = await self.db.exec(statement)
        return result.first()

    async def delete(self, user_id: str, marketplace_id: UUID) -> AgentReview | None:
        """
        Deletes a user's review for a marketplace listing.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID.
            marketplace_id: The marketplace listing ID.

        Returns:
            The deleted AgentReview, or None if not found.
        """
        review = await self.get_by_user_and_listing(user_id, marketplace_id)
        if not review:
            return None

        await self.db.delete(review)
        await self.db.flush()
        return review

    async def list_by_listing(
        self,
        marketplace_id: UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[AgentReview]:
        """
        Lists reviews for a marketplace listing, newest first.

        Args:
            marketplace_id: The marketplace listing ID.
            limit: Maximum number of results.
            offset: Pagination offset.

        Returns:
            List of AgentReview instances.
        """
        statement = (
            select(AgentReview)
            .where(AgentReview.marketplace_id == marketplace_id)
            .order_by(desc(AgentReview.created_at))
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.exec(statement)
        return result.all()

    async def count_by_listing(self, marketplace_id: UUID) -> int:
        """
        Counts reviews for a marketplace listing.

        Args:
            marketplace_id: The marketplace listing ID.

        Returns:
            Count of reviews.
        """
        statement = (
            select(func.count())
            .select_from(AgentReview)
            .where(
                AgentReview.marketplace_id == marketplace_id,
            )
        )
        result = await self.db.exec(statement)
        return result.one()
