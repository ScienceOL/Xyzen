import logging
from datetime import datetime, timezone
from typing import Literal, Sequence
from uuid import UUID

from sqlalchemy import Float, cast, literal
from sqlmodel import case, col, desc, func, or_, select, update
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.skill_like import SkillLike
from app.models.skill_marketplace import (
    SkillMarketplace,
    SkillMarketplaceCreate,
    SkillMarketplaceUpdate,
)

logger = logging.getLogger(__name__)


class SkillMarketplaceRepository:
    """Repository for managing skill marketplace listings."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_listing(self, listing_data: SkillMarketplaceCreate) -> SkillMarketplace:
        """
        Creates a new skill marketplace listing.
        This function does NOT commit the transaction.
        """
        logger.debug(f"Creating skill marketplace listing for skill_id: {listing_data.skill_id}")

        listing = SkillMarketplace(
            skill_id=listing_data.skill_id,
            active_snapshot_id=listing_data.active_snapshot_id,
            user_id=listing_data.user_id,
            author_display_name=listing_data.author_display_name,
            author_avatar_url=listing_data.author_avatar_url,
            name=listing_data.name,
            description=listing_data.description,
            tags=listing_data.tags,
            readme=listing_data.readme,
            scope=listing_data.scope,
            builtin_name=listing_data.builtin_name,
        )

        self.db.add(listing)
        await self.db.flush()
        await self.db.refresh(listing)

        logger.debug(f"Created skill marketplace listing {listing.id}")
        return listing

    async def get_by_id(self, marketplace_id: UUID) -> SkillMarketplace | None:
        """Fetches a skill marketplace listing by its ID."""
        logger.debug(f"Fetching skill marketplace listing with id: {marketplace_id}")
        return await self.db.get(SkillMarketplace, marketplace_id)

    async def get_by_skill_id(self, skill_id: UUID) -> SkillMarketplace | None:
        """Fetches a skill marketplace listing by the source skill ID."""
        logger.debug(f"Fetching skill marketplace listing for skill_id: {skill_id}")
        statement = select(SkillMarketplace).where(SkillMarketplace.skill_id == skill_id)
        result = await self.db.exec(statement)
        return result.first()

    async def get_by_builtin_name(self, builtin_name: str) -> SkillMarketplace | None:
        """Fetches a skill marketplace listing by its builtin skill name."""
        logger.debug(f"Fetching skill marketplace listing for builtin_name: {builtin_name}")
        statement = select(SkillMarketplace).where(SkillMarketplace.builtin_name == builtin_name)
        result = await self.db.exec(statement)
        return result.first()

    async def update_listing(
        self, marketplace_id: UUID, update_data: SkillMarketplaceUpdate
    ) -> SkillMarketplace | None:
        """
        Updates a skill marketplace listing.
        This function does NOT commit the transaction.
        """
        logger.debug(f"Updating skill marketplace listing {marketplace_id}")
        listing = await self.get_by_id(marketplace_id)
        if not listing:
            return None

        update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_dict.items():
            if hasattr(listing, key):
                setattr(listing, key, value)

        listing.updated_at = datetime.now(timezone.utc)
        self.db.add(listing)
        await self.db.flush()
        await self.db.refresh(listing)

        return listing

    async def delete_listing(self, marketplace_id: UUID) -> bool:
        """
        Deletes a skill marketplace listing.
        This function does NOT commit the transaction.
        """
        logger.debug(f"Deleting skill marketplace listing {marketplace_id}")
        listing = await self.get_by_id(marketplace_id)
        if not listing:
            return False

        await self.db.delete(listing)
        await self.db.flush()
        return True

    async def search_listings(
        self,
        query: str | None = None,
        tags: list[str] | None = None,
        user_id: str | None = None,
        only_published: bool = True,
        scope: str | None = None,
        sort_by: Literal["likes", "forks", "views", "recent", "oldest"] = "recent",
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[SkillMarketplace]:
        """Searches skill marketplace listings with filters and sorting."""
        logger.debug(f"Searching skill marketplace listings with query: {query}, tags: {tags}, sort: {sort_by}")

        statement = select(SkillMarketplace)

        if only_published:
            statement = statement.where(col(SkillMarketplace.is_published).is_(True))

        if scope:
            statement = statement.where(SkillMarketplace.scope == scope)

        if user_id:
            statement = statement.where(SkillMarketplace.user_id == user_id)

        if query:
            search_pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    col(SkillMarketplace.name).ilike(search_pattern),
                    col(SkillMarketplace.description).ilike(search_pattern),
                )
            )

        if tags and len(tags) > 0:
            tag_conditions = [col(SkillMarketplace.tags).contains([tag]) for tag in tags]
            statement = statement.where(or_(*tag_conditions))

        # Sorting — OFFICIAL listings first
        official_first = case(
            (SkillMarketplace.scope == "official", 0),
            else_=1,
        )
        if sort_by == "likes":
            statement = statement.order_by(official_first, desc(SkillMarketplace.likes_count))
        elif sort_by == "forks":
            statement = statement.order_by(official_first, desc(SkillMarketplace.forks_count))
        elif sort_by == "views":
            statement = statement.order_by(official_first, desc(SkillMarketplace.views_count))
        elif sort_by == "recent":
            statement = statement.order_by(official_first, desc(SkillMarketplace.updated_at))
        elif sort_by == "oldest":
            from sqlmodel import asc

            statement = statement.order_by(official_first, asc(SkillMarketplace.created_at))

        statement = statement.limit(limit).offset(offset)

        result = await self.db.exec(statement)
        return result.all()

    async def get_liked_listings_by_user(
        self,
        user_id: str,
        query: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[SkillMarketplace]:
        """Fetches skill marketplace listings liked by a specific user."""
        logger.debug(f"Fetching liked skill listings for user {user_id}")

        statement = (
            select(SkillMarketplace)
            .join(SkillLike, col(SkillMarketplace.id) == SkillLike.skill_marketplace_id)
            .where(SkillLike.user_id == user_id)
            .where(col(SkillMarketplace.is_published).is_(True))
        )

        if query:
            search_pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    col(SkillMarketplace.name).ilike(search_pattern),
                    col(SkillMarketplace.description).ilike(search_pattern),
                )
            )

        statement = statement.order_by(desc(SkillLike.created_at)).limit(limit).offset(offset)

        result = await self.db.exec(statement)
        return result.all()

    async def increment_likes(self, marketplace_id: UUID) -> int:
        """Increments the likes count atomically. Does NOT commit."""
        logger.debug(f"Incrementing likes for skill marketplace listing {marketplace_id}")
        statement = (
            update(SkillMarketplace)
            .where(col(SkillMarketplace.id) == marketplace_id)
            .values(likes_count=SkillMarketplace.likes_count + 1)
            .returning(col(SkillMarketplace.likes_count))
        )
        result = await self.db.exec(statement)
        new_count = result.first()
        if new_count:
            return new_count[0]
        return 0

    async def decrement_likes(self, marketplace_id: UUID) -> int:
        """Decrements the likes count atomically. Does NOT commit."""
        logger.debug(f"Decrementing likes for skill marketplace listing {marketplace_id}")
        statement = (
            update(SkillMarketplace)
            .where(col(SkillMarketplace.id) == marketplace_id)
            .values(
                likes_count=case(
                    (SkillMarketplace.likes_count > 0, SkillMarketplace.likes_count - 1),
                    else_=0,
                )
            )
            .returning(col(SkillMarketplace.likes_count))
        )
        result = await self.db.exec(statement)
        new_count = result.first()
        if new_count is not None:
            return new_count[0]
        return 0

    async def increment_forks(self, marketplace_id: UUID) -> bool:
        """Increments the forks count atomically. Does NOT commit."""
        logger.debug(f"Incrementing forks for skill marketplace listing {marketplace_id}")
        statement = (
            update(SkillMarketplace)
            .where(col(SkillMarketplace.id) == marketplace_id)
            .values(forks_count=SkillMarketplace.forks_count + 1)
        )
        result = await self.db.exec(statement)
        return result.rowcount > 0

    async def increment_views(self, marketplace_id: UUID) -> bool:
        """Increments the views count atomically. Does NOT commit."""
        logger.debug(f"Incrementing views for skill marketplace listing {marketplace_id}")
        statement = (
            update(SkillMarketplace)
            .where(col(SkillMarketplace.id) == marketplace_id)
            .values(views_count=SkillMarketplace.views_count + 1)
        )
        result = await self.db.exec(statement)
        return result.rowcount > 0

    async def count_listings(
        self,
        query: str | None = None,
        tags: list[str] | None = None,
        user_id: str | None = None,
        only_published: bool = True,
        scope: str | None = None,
    ) -> int:
        """Counts skill marketplace listings matching the filters."""
        statement = select(func.count()).select_from(SkillMarketplace)

        if only_published:
            statement = statement.where(col(SkillMarketplace.is_published).is_(True))

        if scope:
            statement = statement.where(SkillMarketplace.scope == scope)

        if user_id:
            statement = statement.where(SkillMarketplace.user_id == user_id)

        if query:
            search_pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    col(SkillMarketplace.name).ilike(search_pattern),
                    col(SkillMarketplace.description).ilike(search_pattern),
                )
            )

        if tags and len(tags) > 0:
            tag_conditions = [col(SkillMarketplace.tags).contains([tag]) for tag in tags]
            statement = statement.where(or_(*tag_conditions))

        result = await self.db.exec(statement)
        return result.one()

    async def get_trending_listings(
        self,
        limit: int = 10,
        decay_days: int = 30,
    ) -> Sequence[SkillMarketplace]:
        """
        Fetches trending skill marketplace listings ranked by weighted score with time decay.

        Score = (likes*3 + forks*5 + views*0.5) * (1 / (1 + days_since_update / decay_days))
        """
        days_since_update = func.extract("epoch", func.now() - SkillMarketplace.updated_at) / 86400.0
        base_score = (
            cast(SkillMarketplace.likes_count, Float) * 3
            + cast(SkillMarketplace.forks_count, Float) * 5
            + cast(SkillMarketplace.views_count, Float) * 0.5
        )
        decay_factor = literal(1.0) / (literal(1.0) + days_since_update / literal(float(decay_days)))
        trending_score = base_score * decay_factor

        statement = (
            select(SkillMarketplace)
            .where(col(SkillMarketplace.is_published).is_(True))
            .order_by(desc(trending_score))
            .limit(limit)
        )

        result = await self.db.exec(statement)
        return result.all()

    async def get_recently_published_listings(
        self,
        limit: int = 6,
    ) -> Sequence[SkillMarketplace]:
        """Fetches recently published skill marketplace listings."""
        statement = (
            select(SkillMarketplace)
            .where(col(SkillMarketplace.is_published).is_(True))
            .where(col(SkillMarketplace.first_published_at).is_not(None))
            .order_by(desc(SkillMarketplace.first_published_at))
            .limit(limit)
        )

        result = await self.db.exec(statement)
        return result.all()
