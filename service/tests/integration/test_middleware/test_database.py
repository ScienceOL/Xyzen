"""Tests for database middleware."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.infra.database import get_session


class TestDatabaseMiddleware:
    """Test database middleware functionality."""

    async def test_get_session_dependency(self):
        """Test get_session dependency function."""
        # This is a generator function that yields a session
        # In actual usage, it would be called by FastAPI's dependency injection

        # We can't easily test the actual session creation without a real database,
        # but we can verify the function exists and is callable
        assert callable(get_session)

    @patch("app.infra.database.connection.AsyncSessionLocal")
    async def test_get_session_mock(self, mock_session_local: MagicMock) -> None:
        """Test get_session with mocked session."""
        # Mock the session and its context manager
        mock_session = AsyncMock(spec=AsyncSession)
        mock_context_manager = AsyncMock()
        mock_context_manager.__aenter__.return_value = mock_session
        mock_context_manager.__aexit__.return_value = None
        mock_session_local.return_value = mock_context_manager

        # Test the session generator
        session_generator = get_session()

        # The generator should yield a session
        session = await session_generator.__anext__()
        assert session == mock_session

        # Verify the context manager was properly called
        mock_context_manager.__aenter__.assert_called_once()

        # Clean up the generator
        try:
            await session_generator.__anext__()
        except StopAsyncIteration:
            # This is expected after the session is closed
            pass

    def test_session_type_annotation(self):
        """Test that get_session has proper type annotations."""
        import inspect
        from typing import get_type_hints

        # Get the function signature
        sig = inspect.signature(get_session)
        hints = get_type_hints(get_session)

        # The function should have proper return type annotation
        assert "return" in hints or sig.return_annotation != inspect.Signature.empty

    async def test_database_connection_context(self):
        """Test database connection context management."""
        # This tests that the database connection is properly managed
        # In a real scenario, this would test transaction rollback, connection pooling, etc.

        # For now, we just verify the function can be imported and called
        session_gen = get_session()
        assert hasattr(session_gen, "__anext__")

    @pytest.mark.integration
    async def test_actual_database_session(self, db_session: AsyncSession):
        """Integration test with actual database session."""
        # This uses our test database session fixture
        assert db_session is not None
        assert isinstance(db_session, AsyncSession)

        # Test basic session operations
        # The session should be connected and ready for use
        assert db_session.bind is not None
