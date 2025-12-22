from typing import AsyncGenerator, Callable, Generator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.main import app
from infra.database import get_session


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
    """Create an async test client with mocked database session."""
    app.dependency_overrides[get_session] = override_get_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
