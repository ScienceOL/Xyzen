import logging
from datetime import datetime, timezone
from typing import Any, Sequence
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.storage import FileScope
from app.models.agent import Agent, AgentCreate, AgentScope
from app.models.agent_marketplace import AgentMarketplace, AgentMarketplaceCreate, AgentMarketplaceUpdate
from app.models.agent_snapshot import AgentSnapshot, AgentSnapshotCreate
from app.models.file import FileCreate
from app.repos import (
    AgentLikeRepository,
    AgentMarketplaceRepository,
    AgentRepository,
    AgentSnapshotRepository,
    KnowledgeSetRepository,
)
from app.repos.file import FileRepository
from app.repos.mcp import McpRepository

logger = logging.getLogger(__name__)


class AgentMarketplaceService:
    """Service for managing agent marketplace operations"""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.agent_repo = AgentRepository(db)
        self.snapshot_repo = AgentSnapshotRepository(db)
        self.marketplace_repo = AgentMarketplaceRepository(db)
        self.like_repo = AgentLikeRepository(db)
        self.knowledge_set_repo = KnowledgeSetRepository(db)
        self.file_repo = FileRepository(db)
        self.mcp_repo = McpRepository(db)

    async def create_snapshot_from_agent(self, agent: Agent, commit_message: str) -> AgentSnapshot:
        """
        Creates a snapshot from the current agent configuration.

        Args:
            agent: The agent to snapshot.
            commit_message: Description of changes.

        Returns:
            The created AgentSnapshot.
        """
        logger.debug(f"Creating snapshot for agent {agent.id}")

        # Build configuration dictionary (exclude internal fields)
        configuration: dict[str, Any] = {
            "name": agent.name,
            "description": agent.description,
            "avatar": agent.avatar,
            "tags": agent.tags or [],
            "model": agent.model,
            "temperature": agent.temperature,
            "prompt": agent.prompt,
            "require_tool_confirmation": agent.require_tool_confirmation,
            "scope": agent.scope,
        }

        # Serialize MCP server metadata (no credentials)
        mcp_servers = await self.agent_repo.get_agent_mcp_servers(agent.id)
        mcp_server_configs: list[dict[str, Any]] = [
            {
                "id": str(server.id),
                "name": server.name,
                "description": server.description,
                # Note: We intentionally exclude 'url' and 'token' for security
            }
            for server in mcp_servers
        ]

        # Serialize knowledge set metadata (no file content)
        knowledge_set_config: dict[str, Any] | None = None
        if agent.knowledge_set_id:
            knowledge_set = await self.knowledge_set_repo.get_knowledge_set_by_id(agent.knowledge_set_id)
            if knowledge_set and not knowledge_set.is_deleted:
                file_ids = await self.knowledge_set_repo.get_files_in_knowledge_set(agent.knowledge_set_id)
                knowledge_set_config = {
                    "id": str(knowledge_set.id),
                    "name": knowledge_set.name,
                    "description": knowledge_set.description,
                    "file_count": len(file_ids),
                    "file_ids": [str(fid) for fid in file_ids],
                }

        # Create snapshot
        snapshot_data = AgentSnapshotCreate(
            agent_id=agent.id,
            configuration=configuration,
            mcp_server_configs=mcp_server_configs,
            knowledge_set_config=knowledge_set_config,
            commit_message=commit_message,
        )

        snapshot = await self.snapshot_repo.create_snapshot(snapshot_data)
        return snapshot

    async def publish_agent(
        self, agent: Agent, commit_message: str, is_published: bool = True, readme: str | None = None
    ) -> AgentMarketplace | None:
        """
        Publishes an agent to the marketplace or updates an existing listing.

        Args:
            agent: The agent to publish.
            commit_message: Description of changes.
            is_published: Whether to set the listing as published.
            readme: Optional markdown README content.

        Returns:
            The marketplace listing.
        """
        logger.info(f"Publishing agent {agent.id} to marketplace")

        # Create snapshot
        snapshot = await self.create_snapshot_from_agent(agent, commit_message)

        # Check if listing already exists
        existing_listing = await self.marketplace_repo.get_by_agent_id(agent.id)

        if existing_listing:
            # Update existing listing
            update_data = AgentMarketplaceUpdate(
                active_snapshot_id=snapshot.id,
                name=agent.name,
                description=agent.description,
                avatar=agent.avatar,
                tags=agent.tags or [],
                is_published=is_published,
                readme=readme,
            )
            listing = await self.marketplace_repo.update_listing(existing_listing.id, update_data)

            # Update first_published_at if transitioning from unpublished to published
            if is_published and not existing_listing.is_published and not existing_listing.first_published_at:
                if listing:
                    listing.first_published_at = datetime.now(timezone.utc)
                    self.db.add(listing)
                    await self.db.flush()
        else:
            # Create new listing
            listing_data = AgentMarketplaceCreate(
                agent_id=agent.id,
                active_snapshot_id=snapshot.id,
                user_id=agent.user_id or "",
                name=agent.name,
                description=agent.description,
                avatar=agent.avatar,
                tags=agent.tags or [],
                readme=readme,
            )
            listing = await self.marketplace_repo.create_listing(listing_data)

            # Set first_published_at if published immediately
            if is_published:
                listing.first_published_at = datetime.now(timezone.utc)
                listing.is_published = True
                self.db.add(listing)
                await self.db.flush()

        return listing

    async def update_listing_details(
        self, marketplace_id: UUID, update_data: AgentMarketplaceUpdate
    ) -> AgentMarketplace | None:
        """
        Updates listing details (e.g. README) without creating a new snapshot.

        Args:
            marketplace_id: The marketplace listing ID.
            update_data: The update data.

        Returns:
            The updated marketplace listing.
        """
        logger.info(f"Updating details for marketplace listing {marketplace_id}")
        return await self.marketplace_repo.update_listing(marketplace_id, update_data)

    async def unpublish_agent(self, marketplace_id: UUID) -> bool:
        """
        Unpublishes an agent from the marketplace (keeps the listing but hides it).

        Args:
            marketplace_id: The marketplace listing ID.

        Returns:
            True if successful, False if not found.
        """
        logger.info(f"Unpublishing marketplace listing {marketplace_id}")

        update_data = AgentMarketplaceUpdate(is_published=False)
        listing = await self.marketplace_repo.update_listing(marketplace_id, update_data)
        return listing is not None

    async def fork_agent(self, marketplace_id: UUID, user_id: str, fork_name: str | None = None) -> Agent:
        """
        Forks an agent from the marketplace to create a user's own copy.

        Args:
            marketplace_id: The marketplace listing ID to fork from.
            user_id: The user who is forking.
            fork_name: Optional custom name for the fork.

        Returns:
            The newly created forked agent.

        Raises:
            ValueError: If marketplace listing or snapshot not found.
        """
        logger.info(f"Forking marketplace listing {marketplace_id} for user {user_id}")

        # Get marketplace listing
        listing = await self.marketplace_repo.get_by_id(marketplace_id)
        if not listing:
            raise ValueError(f"Marketplace listing {marketplace_id} not found")

        if not listing.is_published:
            raise ValueError("Cannot fork an unpublished agent")

        # Get active snapshot
        snapshot = await self.snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)
        if not snapshot:
            raise ValueError(f"Snapshot {listing.active_snapshot_id} not found")

        # Increment views count
        await self.marketplace_repo.increment_views(marketplace_id)

        # Build forked agent from snapshot configuration
        config = snapshot.configuration
        base_name = fork_name or f"{config.get('name', 'Agent')} (Fork)"

        # Ensure unique name for user
        user_agents = await self.agent_repo.get_agents_by_user(user_id)
        existing_names = {a.name for a in user_agents}

        final_name = base_name
        counter = 1
        while final_name in existing_names:
            final_name = f"{base_name} ({counter})"
            counter += 1

        agent_create = AgentCreate(
            scope=AgentScope.USER,
            name=final_name,
            description=config.get("description"),
            avatar=config.get("avatar"),
            tags=config.get("tags", []),
            model=config.get("model"),
            temperature=config.get("temperature"),
            prompt=config.get("prompt"),
            require_tool_confirmation=config.get("require_tool_confirmation", False),
            provider_id=None,  # User must configure their own provider
            knowledge_set_id=None,  # Create empty knowledge set
            mcp_server_ids=[],  # Will link compatible MCPs below
        )

        # Create the forked agent
        forked_agent = await self.agent_repo.create_agent(agent_create, user_id)

        forked_agent.original_source_id = marketplace_id
        forked_agent.source_version = snapshot.version
        self.db.add(forked_agent)
        await self.db.flush()

        # Handle MCP servers: Link or clone MCPs
        if snapshot.mcp_server_configs:
            from app.configs import configs
            from app.mcp import registry
            from app.models.mcp import McpServerCreate

            # Get all system (registry) servers for matching
            registry_servers = registry.get_all_servers()
            # Map by display name for easy lookup
            registry_map = {s["name"]: s for s in registry_servers.values()}

            # Get user's existing MCPs to avoid duplicates
            user_mcps = await self.mcp_repo.get_mcp_servers_by_user(user_id)
            user_mcp_map = {m.name: m for m in user_mcps}

            linked_mcp_ids: list[UUID] = []

            for mcp_config in snapshot.mcp_server_configs:
                mcp_name = mcp_config.get("name")
                if not mcp_name:
                    continue

                # Check if this is a System MCP (exists in registry)
                system_config = registry_map.get(mcp_name)

                if system_config:
                    # It's a System MCP. Check if user already has it.
                    if mcp_name in user_mcp_map:
                        # Use existing user instance
                        linked_mcp_ids.append(user_mcp_map[mcp_name].id)
                    else:
                        # Create new instance for user based on system config
                        mount_path = system_config.get("mount_path", "")
                        # Construct local URL
                        # Use localhost/port from config, defaulting to standard dev defaults if missing
                        host = configs.Host if configs.Host != "0.0.0.0" else "127.0.0.1"
                        port = configs.Port
                        system_url = f"http://{host}:{port}{mount_path}/sse"

                        new_mcp_data = McpServerCreate(
                            name=mcp_name,
                            description=system_config.get("description"),
                            url=system_url,
                            token="",  # System MCPs don't need external token usually
                        )
                        # Create and track
                        new_mcp = await self.mcp_repo.create_mcp_server(new_mcp_data, user_id)
                        # Auto-set status to online since we know it's internal
                        new_mcp.status = "online"
                        self.db.add(new_mcp)
                        linked_mcp_ids.append(new_mcp.id)

                else:
                    # It's a Custom/Private MCP.
                    if mcp_name in user_mcp_map:
                        # Reuse existing user instance to avoid collision
                        linked_mcp_ids.append(user_mcp_map[mcp_name].id)
                    else:
                        # We must clone it as a "Shell" (placeholder) for the user to configure.
                        new_mcp_data = McpServerCreate(
                            name=mcp_name,
                            description=mcp_config.get("description"),
                            url="",  # User must configure
                            token="",  # Placeholder
                        )
                        new_mcp = await self.mcp_repo.create_mcp_server(new_mcp_data, user_id)
                        linked_mcp_ids.append(new_mcp.id)

            await self.db.flush()

            if linked_mcp_ids:
                # Link these MCPs to the agent
                await self.agent_repo.link_agent_to_mcp_servers(forked_agent.id, linked_mcp_ids)

        # Handle knowledge set: Create empty knowledge set for user
        if snapshot.knowledge_set_config:
            import io

            from app.core.storage import generate_storage_key, get_storage_service
            from app.models.knowledge_set import KnowledgeSetCreate

            kb_config = snapshot.knowledge_set_config
            # Create empty knowledge set
            kb_create = KnowledgeSetCreate(
                name=f"{forked_agent.name} Knowledge Base",
                description=f"Knowledge base for forked agent. Original had {kb_config.get('file_count', 0)} files.",
            )
            knowledge_set = await self.knowledge_set_repo.create_knowledge_set(kb_create, user_id)
            forked_agent.knowledge_set_id = knowledge_set.id
            self.db.add(forked_agent)
            await self.db.flush()

            # Clone files from snapshot to new knowledge set
            file_ids = kb_config.get("file_ids", [])
            storage = get_storage_service()

            for file_id_str in file_ids:
                try:
                    file_id = UUID(file_id_str)
                    original_file = await self.file_repo.get_file_by_id(file_id)

                    if original_file and not original_file.is_deleted:
                        target_file_id: UUID | None = None

                        # Strategy:
                        # 1. If user owns the original file, just link it (Efficient).
                        # 2. If user is different, we MUST physically copy to avoid Unique Constraint on storage_key.

                        if original_file.user_id == user_id:
                            # Self-fork or re-fork: Reuse existing file record
                            target_file_id = original_file.id
                        else:
                            # Cross-fork: Physical Copy required
                            # Download content
                            buffer = io.BytesIO()
                            await storage.download_file(original_file.storage_key, buffer)
                            content_bytes = buffer.getvalue()

                            # Upload to new key
                            new_key = generate_storage_key(user_id, original_file.original_filename, FileScope.PRIVATE)
                            data_stream = io.BytesIO(content_bytes)
                            await storage.upload_file(data_stream, new_key, content_type=original_file.content_type)

                            # Create new file record
                            new_file_data = FileCreate(
                                user_id=user_id,
                                folder_id=None,
                                original_filename=original_file.original_filename,
                                storage_key=new_key,
                                file_size=len(content_bytes),
                                content_type=original_file.content_type,
                                scope=FileScope.PRIVATE,
                                category=original_file.category,
                                status=original_file.status,
                            )
                            new_file = await self.file_repo.create_file(new_file_data)
                            target_file_id = new_file.id

                        if target_file_id:
                            # Link to the new knowledge set
                            await self.knowledge_set_repo.link_file_to_knowledge_set(target_file_id, knowledge_set.id)

                except Exception as e:
                    logger.warning(f"Failed to clone file {file_id_str} during fork: {e}")

            await self.db.flush()

        # Increment forks count
        await self.marketplace_repo.increment_forks(marketplace_id)

        logger.info(f"Successfully forked agent {listing.agent_id} to {forked_agent.id} for user {user_id}")
        return forked_agent

    async def get_listing_with_snapshot(self, marketplace_id: UUID) -> tuple[AgentMarketplace, AgentSnapshot] | None:
        """
        Gets a marketplace listing with its active snapshot.

        Args:
            marketplace_id: The marketplace listing ID.

        Returns:
            Tuple of (listing, snapshot) or None if not found.
        """
        listing = await self.marketplace_repo.get_by_id(marketplace_id)
        if not listing:
            return None

        snapshot = await self.snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)
        if not snapshot:
            return None

        return (listing, snapshot)

    async def get_snapshot_requirements(self, snapshot: Any) -> dict[str, Any]:
        """
        Extracts requirements from a snapshot for display.

        Args:
            snapshot: The AgentSnapshot.

        Returns:
            Dictionary with requirements information.
        """
        requirements = {
            "mcp_servers": [],
            "knowledge_base": None,
            "provider_needed": bool(snapshot.configuration.get("model")),
        }

        # MCP requirements
        if snapshot.mcp_server_configs:
            requirements["mcp_servers"] = [
                {"name": mcp.get("name"), "description": mcp.get("description")} for mcp in snapshot.mcp_server_configs
            ]

        # Knowledge base requirements
        if snapshot.knowledge_set_config:
            kb = snapshot.knowledge_set_config
            requirements["knowledge_base"] = {
                "name": kb.get("name"),
                "file_count": kb.get("file_count", 0),
            }

        return requirements

    async def check_user_has_liked(self, marketplace_id: UUID, user_id: str) -> bool:
        """
        Checks if a user has liked a marketplace listing.

        Args:
            marketplace_id: The marketplace listing ID.
            user_id: The user ID.

        Returns:
            True if user has liked, False otherwise.
        """

        return await self.like_repo.has_liked(user_id, marketplace_id)

    async def get_starred_listings(self, user_id: str) -> Sequence[Any]:
        """
        Gets all marketplace listings starred by a user.

        Args:
            user_id: The user ID.

        Returns:
            List of starred listings.
        """
        return await self.marketplace_repo.get_liked_listings_by_user(user_id)

    async def get_listing_history(self, marketplace_id: UUID) -> Sequence[AgentSnapshot]:
        """
        Gets the version history of a marketplace listing.

        Args:
            marketplace_id: The marketplace listing ID.

        Returns:
            List of AgentSnapshot instances.
        """
        listing = await self.marketplace_repo.get_by_id(marketplace_id)
        if not listing:
            return []
        return await self.snapshot_repo.list_snapshots(listing.agent_id)

    async def update_agent_and_publish(
        self,
        marketplace_id: UUID,
        agent_update: AgentMarketplaceUpdate,
        commit_message: str,
    ) -> AgentMarketplace | None:
        """
        Updates the underlying agent and publishes a new version.

        Args:
            marketplace_id: The marketplace listing ID.
            agent_update: Data to update (name, description, tags, readme).
            commit_message: Description of the update.

        Returns:
            The updated marketplace listing.
        """
        listing = await self.marketplace_repo.get_by_id(marketplace_id)
        if not listing:
            raise ValueError("Listing not found")

        # 1. Update the underlying Agent
        from app.models.agent import AgentUpdate

        agent = await self.agent_repo.get_agent_by_id(listing.agent_id)
        if not agent:
            raise ValueError("Agent not found")

        # Prepare agent update
        update_data = AgentUpdate(
            name=agent_update.name,
            description=agent_update.description,
            avatar=agent_update.avatar,
            tags=agent_update.tags,
        )
        await self.agent_repo.update_agent(agent.id, update_data)
        # Refresh agent to get latest state for snapshot
        await self.db.refresh(agent)

        # 2. Create new Snapshot
        snapshot = await self.create_snapshot_from_agent(agent, commit_message)

        # 3. Update Listing with new snapshot and metadata
        # We merge the agent_update with the new snapshot ID
        agent_update.active_snapshot_id = snapshot.id
        updated_listing = await self.marketplace_repo.update_listing(marketplace_id, agent_update)

        await self.db.commit()
        return updated_listing

    async def publish_specific_version(self, marketplace_id: UUID, version: int) -> AgentMarketplace | None:
        """
        Publishes a specific past version of the agent.

        Args:
            marketplace_id: The marketplace listing ID.
            version: The version number to publish.

        Returns:
            The updated marketplace listing.
        """
        listing = await self.marketplace_repo.get_by_id(marketplace_id)
        if not listing:
            raise ValueError("Listing not found")

        snapshot = await self.snapshot_repo.get_snapshot_by_version(listing.agent_id, version)
        if not snapshot:
            raise ValueError(f"Snapshot version {version} not found")

        # Update listing to point to this snapshot
        update_data = AgentMarketplaceUpdate(active_snapshot_id=snapshot.id)
        updated_listing = await self.marketplace_repo.update_listing(marketplace_id, update_data)
        await self.db.commit()
        return updated_listing

    async def pull_listing_update(self, agent_id: UUID, user_id: str) -> Agent:
        """
        Updates a forked agent to the latest version from the marketplace.

        Args:
            agent_id: The UUID of the forked agent.
            user_id: The user requesting the update.

        Returns:
            The updated Agent.
        """
        agent = await self.agent_repo.get_agent_by_id(agent_id)
        if not agent:
            raise ValueError("Agent not found")

        if agent.user_id != user_id:
            raise ValueError("Permission denied")

        if not agent.original_source_id:
            raise ValueError("Agent is not a fork")

        # Get the marketplace listing
        listing = await self.marketplace_repo.get_by_id(agent.original_source_id)
        if not listing:
            raise ValueError("Original listing not found")

        # Get active snapshot
        snapshot = await self.snapshot_repo.get_snapshot_by_id(listing.active_snapshot_id)
        if not snapshot:
            raise ValueError("Active snapshot not found")

        # Update Agent Configuration
        config = snapshot.configuration

        # We preserve the user's provider_id and knowledge_set_id if possible
        # but update core logic fields

        from app.models.agent import AgentUpdate

        update_data = AgentUpdate(
            description=config.get("description"),
            avatar=config.get("avatar"),
            tags=config.get("tags", []),
            model=config.get("model"),
            temperature=config.get("temperature"),
            prompt=config.get("prompt"),
            require_tool_confirmation=config.get("require_tool_confirmation", False),
        )

        updated_agent = await self.agent_repo.update_agent(agent.id, update_data)
        if not updated_agent:
            raise Exception("Failed to update agent")

        # Manually update source_version
        updated_agent.source_version = snapshot.version
        self.db.add(updated_agent)
        await self.db.commit()
        await self.db.refresh(updated_agent)

        return updated_agent

    async def toggle_like(self, marketplace_id: UUID, user_id: str) -> tuple[bool, int]:
        """
        Toggles a user's like on a marketplace listing.

        Args:
            marketplace_id: The marketplace listing ID.
            user_id: The user ID.

        Returns:
            Tuple of (is_liked, new_likes_count).
        """
        has_liked = await self.like_repo.has_liked(user_id, marketplace_id)

        if has_liked:
            # Unlike
            await self.like_repo.unlike(user_id, marketplace_id)
            likes_count = await self.marketplace_repo.decrement_likes(marketplace_id)
            is_liked = False
        else:
            # Like
            await self.like_repo.like(user_id, marketplace_id)
            likes_count = await self.marketplace_repo.increment_likes(marketplace_id)
            is_liked = True

        return (is_liked, likes_count)
