import asyncio
from typing import AsyncGenerator, Callable, Generator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlmodel import SQLModel, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.pool import StaticPool

# Use shared memory database for async tests to maintain state across connections in a session
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:?cache=shared"
TEST_SYNC_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def async_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Create an async database engine for testing."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    yield engine
    await engine.dispose()


@pytest.fixture
def sync_engine():
    """Create a sync database engine for testing."""
    engine = create_engine(
        TEST_SYNC_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest_asyncio.fixture
async def db_session(async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a database session for testing."""
    connection = await async_engine.connect()
    transaction = await connection.begin()

    session = AsyncSession(bind=connection, expire_on_commit=False)

    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()


@pytest.fixture
def override_get_session(db_session: AsyncSession) -> Callable[[], AsyncGenerator[AsyncSession, None]]:
    """Override the database session dependency."""

    async def _override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    return _override_get_session
