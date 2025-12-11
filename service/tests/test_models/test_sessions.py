"""Tests for Session model."""

from uuid import uuid4

from models.sessions import SessionCreate, SessionUpdate


class TestSessionModel:
    """Test Session SQLModel."""

    def test_session_create_defaults(self) -> None:
        """Test default values are set correctly."""
        session = SessionCreate(name="Test Session")
        assert session.is_active is True
        assert session.description is None
        assert session.agent_id is None
        assert session.provider_id is None
        assert session.model is None

    def test_session_create_full(self) -> None:
        """Test creating session with all options."""
        agent_id = uuid4()
        provider_id = uuid4()
        session = SessionCreate(
            name="Full Session",
            description="Detailed session",
            is_active=False,
            agent_id=agent_id,
            provider_id=provider_id,
            model="gpt-4",
        )
        assert session.is_active is False
        assert session.agent_id == agent_id
        assert session.provider_id == provider_id
        assert session.model == "gpt-4"

    def test_session_update_logic(self) -> None:
        """Test partial update."""
        update = SessionUpdate(name="New Name", is_active=False)
        assert update.name == "New Name"
        assert update.is_active is False
        assert update.description is None
