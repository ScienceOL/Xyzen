import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from core.storage import FileScope
from models.agent import Agent, AgentCreate, AgentScope
from models.agent_marketplace import AgentMarketplaceCreate, AgentMarketplaceUpdate
from models.agent_snapshot import AgentSnapshotCreate
from models.file import FileCreate
from repos import (
    AgentLikeRepository,
    AgentMarketplaceRepository,
    AgentRepository,
    AgentSnapshotRepository,
    KnowledgeSetRepository,
)
from repos.file import FileRepository
from repos.mcp import McpRepository

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

    async def create_snapshot_from_agent(self, agent: Agent, commit_message: str) -> Any:
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

    async def publish_agent(self, agent: Agent, commit_message: str, is_published: bool = True) -> Any:
        """
        Publishes an agent to the marketplace or updates an existing listing.

        Args:
            agent: The agent to publish.
            commit_message: Description of changes.
            is_published: Whether to set the listing as published.

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
            )
            listing = await self.marketplace_repo.create_listing(listing_data)

            # Set first_published_at if published immediately
            if is_published:
                listing.first_published_at = datetime.now(timezone.utc)
                listing.is_published = True
                self.db.add(listing)
                await self.db.flush()

        return listing

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
        agent_create = AgentCreate(
            scope=AgentScope.USER,
            name=fork_name or f"{config.get('name', 'Agent')} (Fork)",
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

        # Set original_source_id to track provenance
        forked_agent.original_source_id = marketplace_id
        self.db.add(forked_agent)
        await self.db.flush()

        # Handle MCP servers: Link or clone MCPs
        if snapshot.mcp_server_configs:
            from core.configs import configs
            from handler.mcp import registry
            from models.mcp import McpServerCreate

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
                    # We must clone it as a "Shell" (placeholder) for the user to configure.
                    # We check if they already have one with this name to be safe/nice?
                    # No, for custom tools, better to create a new one to avoid semantic collision
                    # unless we want to be smart. Let's create new for now to be safe.

                    new_mcp_data = McpServerCreate(
                        name=mcp_name,
                        description=mcp_config.get("description"),
                        url="",  # Placeholder
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
            kb_config = snapshot.knowledge_set_config
            # Create empty knowledge set
            from models.knowledge_set import KnowledgeSetCreate

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
            for file_id_str in file_ids:
                try:
                    file_id = UUID(file_id_str)
                    original_file = await self.file_repo.get_file_by_id(file_id)

                    if original_file and not original_file.is_deleted:
                        # Create a new file record pointing to the same storage key
                        # This effectively "copies" the file without duplicating storage bytes
                        new_file_data = FileCreate(
                            user_id=user_id,
                            folder_id=None,  # Knowledge sets are flat
                            original_filename=original_file.original_filename,
                            storage_key=original_file.storage_key,
                            file_size=original_file.file_size,
                            content_type=original_file.content_type,
                            scope=FileScope.PRIVATE,  # User owns this copy
                            category=original_file.category,
                            status=original_file.status,
                        )

                        new_file = await self.file_repo.create_file(new_file_data)

                        # Link to the new knowledge set
                        await self.knowledge_set_repo.link_file_to_knowledge_set(new_file.id, knowledge_set.id)

                except Exception as e:
                    logger.warning(f"Failed to clone file {file_id_str} during fork: {e}")

            await self.db.flush()

        # Increment forks count
        await self.marketplace_repo.increment_forks(marketplace_id)

        logger.info(f"Successfully forked agent {listing.agent_id} to {forked_agent.id} for user {user_id}")
        return forked_agent

    async def get_listing_with_snapshot(self, marketplace_id: UUID) -> tuple[Any, Any] | None:
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
