"""Authentication-related test fixtures."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import Request


@pytest.fixture
def mock_user_context() -> dict[str, Any]:
    """Create a mock user context for testing authentication."""
    return {
        "user_id": "test-user-123",
        "username": "testuser",
        "email": "test@example.com",
        "roles": ["user"],
        "organization": "test-org",
    }


@pytest.fixture
def mock_auth_header() -> dict[str, str]:
    """Create a mock authorization header."""
    return {"Authorization": "Bearer test-jwt-token-123"}


@pytest.fixture
def mock_jwt_token() -> str:
    """Create a mock JWT token for testing."""
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwibmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIn0.test-signature"


@pytest.fixture
def mock_request(mock_user_context: dict[str, Any], mock_auth_header: dict[str, str]) -> Request:
    """Create a mock FastAPI request with authentication context."""
    request = MagicMock(spec=Request)
    request.state.user_context = mock_user_context
    request.headers = mock_auth_header
    request.client.host = "127.0.0.1"
    return request


@pytest.fixture
def mock_casdoor_verifier():
    """Mock Casdoor token verifier."""
    verifier = AsyncMock()
    verifier.verify_token.return_value = {
        "user_id": "test-user-123",
        "username": "testuser",
        "email": "test@example.com",
        "organization": "test-org",
    }
    return verifier


@pytest.fixture
def mock_bohrium_verifier():
    """Mock Bohrium token verifier."""
    verifier = AsyncMock()
    verifier.verify_token.return_value = {
        "user_id": "bohrium-user-456",
        "username": "bohriumuser",
        "email": "bohrium@example.com",
        "roles": ["researcher"],
    }
    return verifier


@pytest.fixture
def mock_bohr_app_verifier():
    """Mock BohrApp token verifier."""
    verifier = AsyncMock()
    verifier.verify_token.return_value = {
        "user_id": "bohrapp-user-789",
        "username": "bohrappuser",
        "email": "bohrapp@example.com",
        "app_id": "test-app-123",
    }
    return verifier
