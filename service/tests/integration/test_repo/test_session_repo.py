import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.repos.session import SessionRepository
from tests.factories.session import SessionCreateFactory


@pytest.mark.integration
class TestSessionRepository:
    """Integration tests for SessionRepository."""

    @pytest.fixture
    def session_repo(self, db_session: AsyncSession) -> SessionRepository:
        return SessionRepository(db_session)

    async def test_create_and_get_session(self, session_repo: SessionRepository):
        """Test creating a session and retrieving it."""
        user_id = "test-user-session-create"
        session_create = SessionCreateFactory.build()

        # Create
        created_session = await session_repo.create_session(session_create, user_id)
        assert created_session.id is not None
        assert created_session.name == session_create.name
        assert created_session.user_id == user_id

        # Get by ID
        fetched_session = await session_repo.get_session_by_id(created_session.id)
        assert fetched_session is not None
        assert fetched_session.id == created_session.id
        assert fetched_session.name == created_session.name

    async def test_get_sessions_by_user(self, session_repo: SessionRepository):
        """Test listing sessions for a user."""
        user_id = "test-user-session-list"

        # Create 2 sessions for the user
        await session_repo.create_session(SessionCreateFactory.build(), user_id)
        await session_repo.create_session(SessionCreateFactory.build(), user_id)

        # Create session for another user
        await session_repo.create_session(SessionCreateFactory.build(), "other-user")

        sessions = await session_repo.get_sessions_by_user(user_id)
        assert len(sessions) == 2
        for session in sessions:
            assert session.user_id == user_id

    async def test_get_session_by_user_and_agent(self, session_repo: SessionRepository):
        """Test fetching session by user and agent combination."""
        user_id = "test-user-session-agent"
        session_create = SessionCreateFactory.build(agent_id=None)

        await session_repo.create_session(session_create, user_id)

        # Find session with no agent
        found = await session_repo.get_session_by_user_and_agent(user_id, None)
        assert found is not None
        assert found.user_id == user_id
        assert found.agent_id is None

    async def test_update_session(self, session_repo: SessionRepository):
        """Test updating a session."""
        user_id = "test-user-session-update"
        created = await session_repo.create_session(SessionCreateFactory.build(), user_id)

        from app.models.sessions import SessionUpdate

        update_data = SessionUpdate(name="Updated Session Name", is_active=False)
        updated = await session_repo.update_session(created.id, update_data)

        assert updated is not None
        assert updated.name == "Updated Session Name"
        assert updated.is_active is False

        # Verify persistence
        fetched = await session_repo.get_session_by_id(created.id)
        assert fetched is not None
        assert fetched.name == "Updated Session Name"

    async def test_delete_session(self, session_repo: SessionRepository):
        """Test deleting a session."""
        user_id = "test-user-session-delete"
        created = await session_repo.create_session(SessionCreateFactory.build(), user_id)

        success = await session_repo.delete_session(created.id)
        assert success is True

        fetched = await session_repo.get_session_by_id(created.id)
        assert fetched is None

    async def test_delete_session_not_found(self, session_repo: SessionRepository):
        """Test deleting a non-existent session."""
        from uuid import uuid4

        success = await session_repo.delete_session(uuid4())
        assert success is False

    async def test_get_sessions_ordered_by_activity(self, session_repo: SessionRepository):
        """Test fetching sessions ordered by recent topic activity."""
        user_id = "test-user-session-ordered"

        # Create sessions
        session1 = await session_repo.create_session(SessionCreateFactory.build(name="Session 1"), user_id)
        session2 = await session_repo.create_session(SessionCreateFactory.build(name="Session 2"), user_id)

        sessions = await session_repo.get_sessions_by_user_ordered_by_activity(user_id)
        assert len(sessions) == 2
        # Both sessions exist (order depends on topic activity which we haven't created)
        session_ids = [s.id for s in sessions]
        assert session1.id in session_ids
        assert session2.id in session_ids
