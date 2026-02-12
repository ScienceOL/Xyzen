from typing import AsyncGenerator, Callable, Generator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.infra.database import get_session
from app.main import app


@pytest.fixture
def test_client(
    override_get_session: Callable[[], AsyncGenerator[AsyncSession, None]],
) -> Generator[TestClient, None, None]:
    """Create a test client with mocked database session."""
    app.dependency_overrides[get_session] = override_get_session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def async_client(
    override_get_session: Callable[[], AsyncGenerator[AsyncSession, None]],
) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with mocked database session and user auth."""
    from app.middleware.auth import UserInfo, get_current_user, get_current_user_info

    async def mock_get_current_user() -> str:
        return "test-user-id"

    async def mock_get_current_user_info() -> UserInfo:
        return UserInfo(id="test-user-id", username="test-user")

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_user] = mock_get_current_user
    app.dependency_overrides[get_current_user_info] = mock_get_current_user_info

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
