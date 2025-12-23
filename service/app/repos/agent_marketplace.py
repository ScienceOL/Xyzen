import logging
from typing import Literal, Sequence
from uuid import UUID

from sqlmodel import asc, case, col, desc, func, or_, select, update
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent_like import AgentLike
from app.models.agent_marketplace import AgentMarketplace, AgentMarketplaceCreate, AgentMarketplaceUpdate

logger = logging.getLogger(__name__)


class AgentMarketplaceRepository:
    """Repository for managing agent marketplace listings"""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_listing(self, listing_data: AgentMarketplaceCreate) -> AgentMarketplace:
        """
        Creates a new marketplace listing.
        This function does NOT commit the transaction.

        Args:
            listing_data: The listing data to create.

        Returns:
            The newly created AgentMarketplace instance.
        """
        logger.debug(f"Creating marketplace listing for agent_id: {listing_data.agent_id}")

        listing = AgentMarketplace(
            agent_id=listing_data.agent_id,
            active_snapshot_id=listing_data.active_snapshot_id,
            user_id=listing_data.user_id,
            name=listing_data.name,
            description=listing_data.description,
            avatar=listing_data.avatar,
            tags=listing_data.tags,
            readme=listing_data.readme,
        )

        self.db.add(listing)
        await self.db.flush()
        await self.db.refresh(listing)

        logger.debug(f"Created marketplace listing {listing.id}")
        return listing

    async def get_by_id(self, marketplace_id: UUID) -> AgentMarketplace | None:
        """
        Fetches a marketplace listing by its ID.

        Args:
            marketplace_id: The UUID of the marketplace listing.

        Returns:
            The AgentMarketplace, or None if not found.
        """
        logger.debug(f"Fetching marketplace listing with id: {marketplace_id}")
        return await self.db.get(AgentMarketplace, marketplace_id)

    async def get_by_agent_id(self, agent_id: UUID) -> AgentMarketplace | None:
        """
        Fetches a marketplace listing by the source agent ID.

        Args:
            agent_id: The UUID of the agent.

        Returns:
            The AgentMarketplace, or None if not found.
        """
        logger.debug(f"Fetching marketplace listing for agent_id: {agent_id}")
        statement = select(AgentMarketplace).where(AgentMarketplace.agent_id == agent_id)
        result = await self.db.exec(statement)
        return result.first()

    async def update_listing(
        self, marketplace_id: UUID, update_data: AgentMarketplaceUpdate
    ) -> AgentMarketplace | None:
        """
        Updates a marketplace listing.
        This function does NOT commit the transaction.

        Args:
            marketplace_id: The UUID of the marketplace listing to update.
            update_data: The update data.

        Returns:
            The updated AgentMarketplace, or None if not found.
        """
        logger.debug(f"Updating marketplace listing {marketplace_id}")
        listing = await self.get_by_id(marketplace_id)
        if not listing:
            return None

        update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_dict.items():
            if hasattr(listing, key):
                setattr(listing, key, value)

        self.db.add(listing)
        await self.db.flush()
        await self.db.refresh(listing)

        return listing

    async def delete_listing(self, marketplace_id: UUID) -> bool:
        """
        Deletes a marketplace listing.
        This function does NOT commit the transaction.

        Args:
            marketplace_id: The UUID of the marketplace listing to delete.

        Returns:
            True if deleted, False if not found.
        """
        logger.debug(f"Deleting marketplace listing {marketplace_id}")
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
        sort_by: Literal["likes", "forks", "views", "recent", "oldest"] = "recent",
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[AgentMarketplace]:
        """
        Searches marketplace listings with filters and sorting.

        Args:
            query: Text search query (searches name and description).
            tags: Filter by tags (any match).
            user_id: Filter by publisher user_id.
            only_published: If True, only returns published listings.
            sort_by: Sort order.
            limit: Maximum number of results.
            offset: Pagination offset.

        Returns:
            List of AgentMarketplace instances.
        """
        logger.debug(f"Searching marketplace listings with query: {query}, tags: {tags}, sort: {sort_by}")

        statement = select(AgentMarketplace)

        # Filter by published status
        if only_published:
            statement = statement.where(col(AgentMarketplace.is_published).is_(True))

        # Filter by user
        if user_id:
            statement = statement.where(AgentMarketplace.user_id == user_id)

        # Text search (name or description)
        if query:
            search_pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    col(AgentMarketplace.name).ilike(search_pattern),
                    col(AgentMarketplace.description).ilike(search_pattern),
                )
            )

        # Filter by tags (match any)
        if tags and len(tags) > 0:
            # PostgreSQL: tags column is JSONB, use contains operator
            # This will match if ANY of the provided tags are in the listing's tags
            tag_conditions = [col(AgentMarketplace.tags).contains([tag]) for tag in tags]
            statement = statement.where(or_(*tag_conditions))

        # Sorting
        if sort_by == "likes":
            statement = statement.order_by(desc(AgentMarketplace.likes_count))
        elif sort_by == "forks":
            statement = statement.order_by(desc(AgentMarketplace.forks_count))
        elif sort_by == "views":
            statement = statement.order_by(desc(AgentMarketplace.views_count))
        elif sort_by == "recent":
            statement = statement.order_by(desc(AgentMarketplace.updated_at))
        elif sort_by == "oldest":
            statement = statement.order_by(asc(AgentMarketplace.created_at))

        # Pagination
        statement = statement.limit(limit).offset(offset)

        result = await self.db.exec(statement)
        return result.all()

    async def get_liked_listings_by_user(
        self,
        user_id: str,
        query: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[AgentMarketplace]:
        """
        Fetches marketplace listings liked by a specific user.

        Args:
            user_id: The ID of the user who liked the listings.
            query: Optional search query to filter liked listings.
            limit: Maximum number of results.
            offset: Pagination offset.

        Returns:
            List of liked AgentMarketplace instances.
        """
        logger.debug(f"Fetching liked listings for user {user_id}")

        statement = (
            select(AgentMarketplace)
            .join(AgentLike, col(AgentMarketplace.id) == AgentLike.marketplace_id)
            .where(AgentLike.user_id == user_id)
            .where(col(AgentMarketplace.is_published).is_(True))
        )

        if query:
            search_pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    col(AgentMarketplace.name).ilike(search_pattern),
                    col(AgentMarketplace.description).ilike(search_pattern),
                )
            )

        statement = statement.order_by(desc(AgentLike.created_at)).limit(limit).offset(offset)

        result = await self.db.exec(statement)
        return result.all()

    async def increment_likes(self, marketplace_id: UUID) -> int:
        """
        Increments the likes count for a marketplace listing atomically.
        This function does NOT commit the transaction.

        Args:
            marketplace_id: The UUID of the marketplace listing.

        Returns:
            True if successful (listing exists), False otherwise.
        """
        logger.debug(f"Incrementing likes for marketplace listing {marketplace_id}")
        statement = (
            update(AgentMarketplace)
            .where(col(AgentMarketplace.id) == marketplace_id)
            .values(likes_count=AgentMarketplace.likes_count + 1)
            .returning(col(AgentMarketplace.likes_count))
        )
        result = await self.db.exec(statement)
        new_count = result.first()
        if new_count:
            return new_count[0]
        return 0

    async def decrement_likes(self, marketplace_id: UUID) -> int:
        """
        Decrements the likes count for a marketplace listing atomically.
        This function does NOT commit the transaction.

        Args:
            marketplace_id: The UUID of the marketplace listing.

        Returns:
            True if successful (listing exists), False otherwise.
        """
        logger.debug(f"Decrementing likes for marketplace listing {marketplace_id}")
        # Ensure we don't go below 0
        statement = (
            update(AgentMarketplace)
            .where(col(AgentMarketplace.id) == marketplace_id)
            .values(
                likes_count=case(
                    (AgentMarketplace.likes_count > 0, AgentMarketplace.likes_count - 1),
                    else_=0,
                )
            )
            .returning(col(AgentMarketplace.likes_count))
        )
        result = await self.db.exec(statement)
        new_count = result.first()
        if new_count is not None:
            return new_count[0]
        return 0

    async def increment_forks(self, marketplace_id: UUID) -> bool:
        """
        Increments the forks count for a marketplace listing atomically.
        This function does NOT commit the transaction.

        Args:
            marketplace_id: The UUID of the marketplace listing.

        Returns:
            True if successful (listing exists), False otherwise.
        """
        logger.debug(f"Incrementing forks for marketplace listing {marketplace_id}")
        statement = (
            update(AgentMarketplace)
            .where(col(AgentMarketplace.id) == marketplace_id)
            .values(forks_count=AgentMarketplace.forks_count + 1)
        )
        result = await self.db.exec(statement)
        return result.rowcount > 0

    async def increment_views(self, marketplace_id: UUID) -> bool:
        """
        Increments the views count for a marketplace listing atomically.
        This function does NOT commit the transaction.

        Args:
            marketplace_id: The UUID of the marketplace listing.

        Returns:
            True if successful (listing exists), False otherwise.
        """
        logger.debug(f"Incrementing views for marketplace listing {marketplace_id}")
        statement = (
            update(AgentMarketplace)
            .where(col(AgentMarketplace.id) == marketplace_id)
            .values(views_count=AgentMarketplace.views_count + 1)
        )
        result = await self.db.exec(statement)
        return result.rowcount > 0

    async def count_listings(
        self,
        query: str | None = None,
        tags: list[str] | None = None,
        user_id: str | None = None,
        only_published: bool = True,
    ) -> int:
        """
        Counts marketplace listings matching the filters.

        Args:
            query: Text search query.
            tags: Filter by tags.
            user_id: Filter by publisher.
            only_published: If True, only counts published listings.

        Returns:
            Count of matching listings.
        """
        statement = select(func.count()).select_from(AgentMarketplace)

        if only_published:
            statement = statement.where(col(AgentMarketplace.is_published).is_(True))

        if user_id:
            statement = statement.where(AgentMarketplace.user_id == user_id)

        if query:
            search_pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    col(AgentMarketplace.name).ilike(search_pattern),
                    col(AgentMarketplace.description).ilike(search_pattern),
                )
            )

        if tags and len(tags) > 0:
            tag_conditions = [col(AgentMarketplace.tags).contains([tag]) for tag in tags]
            statement = statement.where(or_(*tag_conditions))

        result = await self.db.exec(statement)
        return result.one()
