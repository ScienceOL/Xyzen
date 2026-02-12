import json
import logging
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.agents.builtin import get_builtin_config, get_builtin_metadata, list_builtin_keys
from app.core.marketplace.agent_marketplace_service import AgentMarketplaceService
from app.models.agent import Agent, AgentCreate, AgentScope, ForkMode
from app.models.agent_marketplace import (
    AgentMarketplace,
    AgentMarketplaceCreate,
    AgentMarketplaceUpdate,
    MarketplaceScope,
)
from app.models.agent_snapshot import AgentSnapshot
from app.repos import AgentMarketplaceRepository, AgentRepository, AgentSnapshotRepository
from app.schemas.graph_config import GraphConfig

logger = logging.getLogger(__name__)


class BuiltinMarketplacePublisher:
    """Publishes builtin agents as OFFICIAL marketplace listings on server startup."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.agent_repo = AgentRepository(db)
        self.marketplace_repo = AgentMarketplaceRepository(db)
        self.snapshot_repo = AgentSnapshotRepository(db)
        self.marketplace_service = AgentMarketplaceService(db)

    async def ensure_builtin_listings(self) -> dict[str, UUID]:
        """
        Ensure each publishable builtin agent has an OFFICIAL marketplace listing.

        For each builtin key:
        - If not publishable and listing exists: delete listing, backing agent, and snapshots.
        - If not publishable and no listing: skip.
        - If publishable and no listing exists: create Agent, Snapshot, and Marketplace listing.
        - If publishable and listing exists and config changed: update Agent, create new Snapshot, update listing.
        - If publishable and listing exists and config unchanged: no-op.

        Returns:
            Mapping of builtin key to marketplace listing UUID.
        """
        result: dict[str, UUID] = {}

        for key in list_builtin_keys():
            config = get_builtin_config(key)
            metadata = get_builtin_metadata(key)
            if not config or not metadata:
                logger.warning(f"Skipping builtin key '{key}': missing config or metadata")
                continue

            publishable = metadata.get("publishable", True)
            listing = await self.marketplace_repo.get_by_builtin_key(key)

            if not publishable:
                if listing is not None:
                    await self._remove_listing(key, listing)
                continue

            if listing is None:
                listing = await self._create_listing(key, config, metadata)
                logger.info(f"Created OFFICIAL marketplace listing for '{key}': {listing.id}")
            else:
                listing = await self._update_if_changed(key, config, metadata, listing)

            result[key] = listing.id

        return result

    async def _create_listing(self, key: str, config: GraphConfig, metadata: dict[str, str]) -> AgentMarketplace:
        """Create Agent, Snapshot, and Marketplace listing for a builtin agent."""
        graph_config_dict = config.model_dump()
        display_name = metadata.get("display_name", key)
        description = metadata.get("description", "")
        tags = ["official", f"builtin:{key}"]
        if metadata.get("pattern"):
            tags.append(metadata["pattern"])

        # Create backing Agent record (scope=SYSTEM, no user)
        agent_data = AgentCreate(
            scope=AgentScope.SYSTEM,
            name=display_name,
            description=description,
            tags=tags,
            graph_config=graph_config_dict,
        )
        agent: Agent = await self.agent_repo.create_agent(agent_data, user_id=None)

        # Create snapshot
        snapshot = await self.marketplace_service.create_snapshot_from_agent(
            agent, commit_message=f"Initial publish of builtin agent '{key}'"
        )

        # Create marketplace listing
        listing_data = AgentMarketplaceCreate(
            agent_id=agent.id,
            active_snapshot_id=snapshot.id,
            user_id=None,
            name=display_name,
            description=description,
            tags=tags,
            scope=MarketplaceScope.OFFICIAL,
            builtin_key=key,
            fork_mode=ForkMode.EDITABLE,
        )
        listing: AgentMarketplace = await self.marketplace_repo.create_listing(listing_data)

        # Mark as published immediately
        listing.is_published = True
        listing.first_published_at = listing.created_at
        self.db.add(listing)
        await self.db.flush()

        return listing

    async def _remove_listing(self, key: str, listing: AgentMarketplace) -> None:
        """Remove a stale marketplace listing and its backing agent/snapshots."""
        agent_id = listing.agent_id

        # Delete marketplace listing first (references snapshot + agent)
        await self.marketplace_repo.delete_listing(listing.id)

        # Delete snapshots for the backing agent
        snapshots = await self.db.exec(select(AgentSnapshot).where(AgentSnapshot.agent_id == agent_id))
        for snap in snapshots.all():
            await self.db.delete(snap)

        # Delete backing agent
        await self.agent_repo.delete_agent(agent_id)

        logger.info(f"Removed stale marketplace listing for non-publishable builtin '{key}'")

    async def _update_if_changed(
        self, key: str, config: GraphConfig, metadata: dict[str, str], listing: AgentMarketplace
    ) -> AgentMarketplace:
        """Update listing if the builtin config has changed since last publish."""
        current_config_json = json.dumps(config.model_dump(), sort_keys=True)

        # Get latest snapshot to compare
        snapshot = await self.snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)
        if snapshot:
            existing_config = snapshot.configuration.get("graph_config")
            existing_config_json = json.dumps(existing_config, sort_keys=True) if existing_config else ""
        else:
            existing_config_json = ""

        if current_config_json == existing_config_json:
            logger.debug(f"Builtin '{key}' marketplace listing is up-to-date")
            return listing

        # Config changed — update agent and publish new snapshot
        logger.info(f"Builtin '{key}' config changed, updating marketplace listing")

        from app.models.agent import AgentUpdate

        graph_config_dict = config.model_dump()
        display_name = metadata.get("display_name", key)
        description = metadata.get("description", "")
        tags = ["official", f"builtin:{key}"]
        if metadata.get("pattern"):
            tags.append(metadata["pattern"])

        # Update the backing agent
        agent = await self.agent_repo.get_agent_by_id(listing.agent_id)
        if not agent:
            logger.error(f"Backing agent for builtin '{key}' not found, skipping update")
            return listing

        update_data = AgentUpdate(
            name=display_name,
            description=description,
            tags=tags,
            graph_config=graph_config_dict,
        )
        await self.agent_repo.update_agent(agent.id, update_data)
        await self.db.refresh(agent)

        # Create new snapshot
        snapshot = await self.marketplace_service.create_snapshot_from_agent(
            agent, commit_message=f"Auto-update builtin agent '{key}'"
        )

        # Update listing metadata
        listing_update = AgentMarketplaceUpdate(
            active_snapshot_id=snapshot.id,
            name=display_name,
            description=description,
            tags=tags,
        )
        updated = await self.marketplace_repo.update_listing(listing.id, listing_update)
        return updated or listing
