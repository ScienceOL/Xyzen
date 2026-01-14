import logging
from uuid import UUID

from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.links import SessionMcpServerLink
from app.models.mcp import McpServer
from app.models.sessions import Session as SessionModel
from app.models.sessions import SessionCreate, SessionUpdate
from app.models.topic import Topic

logger = logging.getLogger(__name__)


class SessionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_session_by_id(self, session_id: UUID) -> SessionModel | None:
        """
        Fetches a session by its ID.

        Args:
            session_id: The UUID of the session to fetch.

        Returns:
            The SessionModel, or None if not found.
        """
        logger.debug(f"Fetching session with id: {session_id}")
        session = await self.db.get(SessionModel, session_id)
        return session

    async def get_sessions_by_user(self, user_id: str) -> list[SessionModel]:
        """
        Fetches all sessions for a given user.

        Args:
            user_id: The user ID.

        Returns:
            List of SessionModel instances.
        """
        logger.debug(f"Fetching sessions for user_id: {user_id}")
        statement = select(SessionModel).where(SessionModel.user_id == user_id)
        result = await self.db.exec(statement)
        return list(result.all())

    async def get_session_by_user_and_agent(self, user_id: str, agent_id: UUID | None) -> SessionModel | None:
        """
        Fetches a session for a specific user and agent combination.

        Args:
            user_id: The user ID.
            agent_id: The agent UUID, or None for default agent.

        Returns:
            The SessionModel, or None if not found.
        """
        logger.debug(f"Fetching session for user_id: {user_id}, agent_id: {agent_id}")
        statement = select(SessionModel).where(SessionModel.user_id == user_id, SessionModel.agent_id == agent_id)
        result = await self.db.exec(statement)
        return result.first()

    async def create_session(self, session_data: SessionCreate, user_id: str) -> SessionModel:
        """
        Creates a new session.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the session object is populated with DB-defaults before being returned.

        Args:
            session_data: The Pydantic model containing the data for the new session.
            user_id: The user ID (from authentication).

        Returns:
            The newly created SessionModel instance.
        """
        logger.debug(f"Creating new session for user_id: {user_id}")

        # Convert agent_id from string to UUID if needed
        agent_id = session_data.agent_id
        if isinstance(agent_id, str):
            try:
                from uuid import UUID

                agent_id = UUID(agent_id)
            except ValueError:
                raise ValueError(f"SessionRepository received invalid UUID string: {agent_id}")

        session = SessionModel(
            name=session_data.name,
            description=session_data.description,
            is_active=session_data.is_active,
            user_id=user_id,
            agent_id=agent_id,
            provider_id=session_data.provider_id,
            model=session_data.model,
            spatial_layout=getattr(session_data, "spatial_layout", None),
            google_search_enabled=session_data.google_search_enabled,
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def update_session(self, session_id: UUID, session_update: SessionUpdate) -> SessionModel | None:
        """
        Updates an existing session.
        This function does NOT commit the transaction.

        When model_tier is changed, clears session.model to trigger re-selection
        on the next message.

        Args:
            session_id: The UUID of the session to update.
            session_update: The Pydantic model containing the update data.

        Returns:
            The updated SessionModel instance, or None if not found.
        """
        logger.debug(f"Updating session with id: {session_id}")
        session = await self.db.get(SessionModel, session_id)
        if not session:
            return None

        # Check if model_tier is being changed
        update_data = session_update.model_dump(exclude_unset=True)
        if "model_tier" in update_data:
            new_tier = update_data.get("model_tier")
            if new_tier != session.model_tier:
                # Clear session.model to trigger re-selection on next message
                logger.info(
                    f"Session {session_id}: model_tier changed from {session.model_tier} to {new_tier}, "
                    f"clearing model to trigger re-selection"
                )
                session.model = None

        # Only update fields that are not None to avoid null constraint violations
        # But we already handled model clearing above for tier changes
        update_data_filtered = session_update.model_dump(exclude_unset=True, exclude_none=True)
        for field, value in update_data_filtered.items():
            if hasattr(session, field):
                setattr(session, field, value)

        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def delete_session(self, session_id: UUID) -> bool:
        """
        Deletes a session by its ID.
        This function does NOT commit the transaction.
        Note: Caller should handle cascade deletion of related topics and messages.

        Args:
            session_id: The UUID of the session to delete.

        Returns:
            True if the session was deleted, False if not found.
        """
        logger.debug(f"Deleting session with id: {session_id}")
        session = await self.db.get(SessionModel, session_id)
        if not session:
            return False
        await self.db.delete(session)
        await self.db.flush()
        return True

    async def get_sessions_by_user_ordered_by_activity(self, user_id: str) -> list[SessionModel]:
        """
        Fetches all sessions for a given user, ordered by most recent topic activity.

        Uses a single optimized query with LEFT JOIN and subquery to avoid N+1 problem.
        Sessions are sorted by the most recent topic's updated_at timestamp in descending order.
        Sessions without topics are sorted to the end (NULL values last).

        Args:
            user_id: The user ID.

        Returns:
            List of SessionModel instances ordered by recent topic activity.
        """
        logger.debug(f"Fetching sessions for user_id: {user_id} ordered by topic activity")
        max_topic_activity = (
            select(Topic.session_id, func.max(Topic.updated_at).label("latest_activity"))
            # Type UUID is not compatible with accepted types
            .group_by(col(Topic.session_id))
            .subquery()
        )
        statement = (
            select(SessionModel)
            .where(SessionModel.user_id == user_id)
            .outerjoin(
                max_topic_activity,
                col(SessionModel.id) == max_topic_activity.c.session_id,
            )
            .order_by(max_topic_activity.c.latest_activity.desc().nulls_last())
        )
        result = await self.db.exec(statement)
        return list(result.all())

    # Session-MCP link methods (for search engines and other session-level MCPs)
    async def link_session_to_mcp(self, session_id: UUID, mcp_server_id: UUID) -> SessionMcpServerLink:
        """
        Links a session to an MCP server (e.g., search engine).
        This function does NOT commit the transaction, but it does flush the session.

        Args:
            session_id: The UUID of the session.
            mcp_server_id: The UUID of the MCP server.

        Returns:
            The newly created SessionMcpServerLink instance.
        """
        logger.debug(f"Linking session {session_id} to MCP server {mcp_server_id}")

        # Check if link already exists
        existing = await self.get_session_mcp_link(session_id, mcp_server_id)
        if existing:
            logger.debug(f"Link already exists between session {session_id} and MCP server {mcp_server_id}")
            return existing

        link = SessionMcpServerLink(session_id=session_id, mcp_server_id=mcp_server_id)
        self.db.add(link)
        await self.db.flush()

        logger.info(f"Linked session {session_id} to MCP server {mcp_server_id}")
        return link

    async def unlink_session_from_mcp(self, session_id: UUID, mcp_server_id: UUID) -> bool:
        """
        Unlinks a session from an MCP server.
        This function does NOT commit the transaction.

        Args:
            session_id: The UUID of the session.
            mcp_server_id: The UUID of the MCP server.

        Returns:
            True if the link was deleted, False if not found.
        """
        logger.debug(f"Unlinking session {session_id} from MCP server {mcp_server_id}")

        statement = select(SessionMcpServerLink).where(
            SessionMcpServerLink.session_id == session_id, SessionMcpServerLink.mcp_server_id == mcp_server_id
        )
        result = await self.db.exec(statement)
        link = result.first()

        if not link:
            logger.debug(f"No link found between session {session_id} and MCP server {mcp_server_id}")
            return False

        await self.db.delete(link)
        await self.db.flush()

        logger.info(f"Unlinked session {session_id} from MCP server {mcp_server_id}")
        return True

    async def get_session_mcp_link(self, session_id: UUID, mcp_server_id: UUID) -> SessionMcpServerLink | None:
        """
        Get a specific session-MCP link.

        Args:
            session_id: The UUID of the session.
            mcp_server_id: The UUID of the MCP server.

        Returns:
            The SessionMcpServerLink if found, None otherwise.
        """
        logger.debug(f"Fetching link between session {session_id} and MCP server {mcp_server_id}")

        statement = select(SessionMcpServerLink).where(
            SessionMcpServerLink.session_id == session_id, SessionMcpServerLink.mcp_server_id == mcp_server_id
        )
        result = await self.db.exec(statement)
        return result.first()

    async def get_session_mcp_servers(self, session_id: UUID) -> list[McpServer]:
        """
        Get all MCP servers linked to a session.

        Args:
            session_id: The UUID of the session.

        Returns:
            List of McpServer instances linked to the session.
        """
        logger.debug(f"Fetching MCP servers for session {session_id}")

        # First, get all link records for this session
        links_statement = select(SessionMcpServerLink).where(SessionMcpServerLink.session_id == session_id)
        links_result = await self.db.exec(links_statement)
        links = list(links_result.all())

        if not links:
            logger.debug(f"No MCP servers linked to session {session_id}")
            return []

        # Extract MCP server IDs from links
        mcp_server_ids = [link.mcp_server_id for link in links if link.mcp_server_id is not None]

        if not mcp_server_ids:
            logger.debug(f"No valid MCP server IDs found for session {session_id}")
            return []

        # Fetch all MCP servers by IDs
        servers: list[McpServer] = []
        for mcp_id in mcp_server_ids:
            server = await self.db.get(McpServer, mcp_id)
            if server:
                servers.append(server)

        logger.debug(f"Found {len(servers)} MCP servers for session {session_id}")
        return servers

    async def get_active_search_mcp(self, session_id: UUID) -> McpServer | None:
        """
        Get the active search MCP server for a session.
        Returns the most recently linked search MCP server.

        Args:
            session_id: The UUID of the session.

        Returns:
            The active McpServer for search, or None if no search MCP is linked.
        """
        logger.debug(f"Fetching active search MCP for session {session_id}")

        # Get all linked MCP servers for this session
        servers = await self.get_session_mcp_servers(session_id)

        # Return the first one if any exists
        if servers:
            logger.debug(f"Active search MCP for session {session_id}: {servers[0].name}")
            return servers[0]

        logger.debug(f"No search MCP linked to session {session_id}")
        return None

    async def set_active_search_mcp(self, session_id: UUID, mcp_server_id: UUID) -> McpServer:
        """
        Set the active search MCP server for a session.
        This unlinks any existing search MCPs and links the new one.

        Args:
            session_id: The UUID of the session.
            mcp_server_id: The UUID of the MCP server to set as active.

        Returns:
            The newly linked McpServer instance.

        Raises:
            ValueError: If the MCP server is not found.
        """
        logger.debug(f"Setting active search MCP for session {session_id} to {mcp_server_id}")

        # Verify the MCP server exists
        mcp_server = await self.db.get(McpServer, mcp_server_id)
        if not mcp_server:
            raise ValueError(f"MCP server {mcp_server_id} not found")

        # Unlink all existing MCPs for this session
        existing_servers = await self.get_session_mcp_servers(session_id)
        for server in existing_servers:
            await self.unlink_session_from_mcp(session_id, server.id)

        # Link the new search MCP
        await self.link_session_to_mcp(session_id, mcp_server_id)

        logger.info(f"Set active search MCP for session {session_id} to {mcp_server.name}")
        return mcp_server

    async def unlink_all_session_mcps(self, session_id: UUID) -> int:
        """
        Unlink all MCP servers from a session.

        Args:
            session_id: The UUID of the session.

        Returns:
            Number of links deleted.
        """
        logger.debug(f"Unlinking all MCP servers from session {session_id}")

        statement = select(SessionMcpServerLink).where(SessionMcpServerLink.session_id == session_id)
        result = await self.db.exec(statement)
        links = list(result.all())

        count = 0
        for link in links:
            await self.db.delete(link)
            count += 1

        await self.db.flush()

        logger.info(f"Unlinked {count} MCP servers from session {session_id}")
        return count
