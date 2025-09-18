from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from common import ALEMBIC_INI_PATH
from internal import configs

SYNC_DATABASE_URL = ""
ASYNC_DATABASE_URL = ""
if configs.Database.Engine == "postgres":
    SYNC_DATABASE_URL = (
        f"postgresql+psycopg://{configs.Database.Postgres.User}:{configs.Database.Postgres.Password}@"
        f"{configs.Database.Postgres.Host}:{configs.Database.Postgres.Port}/{configs.Database.Postgres.DBName}"
    )
    ASYNC_DATABASE_URL = (
        f"postgresql+asyncpg://{configs.Database.Postgres.User}:{configs.Database.Postgres.Password}@"
        f"{configs.Database.Postgres.Host}:{configs.Database.Postgres.Port}/{configs.Database.Postgres.DBName}"
    )
elif configs.Database.Engine == "sqlite":
    # For SQLite, the path should be relative to the project root or an absolute path.
    # Example: f"sqlite+aiosqlite:///./sql_app.db"
    SYNC_DATABASE_URL = f"sqlite:///{configs.Database.SQLite.Path}"
    ASYNC_DATABASE_URL = f"sqlite+aiosqlite:///{configs.Database.SQLite.Path}"
else:
    raise ValueError(f"Unsupported database engine: {configs.Database.Engine}")


# The engine is the gateway to the database.
async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, future=True)
engine = create_engine(SYNC_DATABASE_URL, echo=False, future=True)


async def create_db_and_tables() -> None:
    """
    Initialize database by automatically applying Alembic migrations.
    This function creates a temporary synchronous engine to run migrations
    in a separate thread, ensuring no conflict with the main async event loop.
    """
    import asyncio
    import logging

    from alembic import command
    from alembic.config import Config
    from alembic.migration import MigrationContext
    from alembic.script import ScriptDirectory

    logger = logging.getLogger(__name__)

    def run_migrations_sync() -> None:
        """Run alembic migrations in a synchronous manner."""
        logger.info("Starting synchronous migration process...")
        migration_engine = create_engine(SYNC_DATABASE_URL)

        try:
            with migration_engine.connect() as connection:
                logger.info("Database connection for migration established.")

                alembic_cfg = Config(str(ALEMBIC_INI_PATH))

                # Prevent Alembic from configuring logging, to avoid conflicts with Uvicorn's logger.
                alembic_cfg.set_main_option("log_config_file", "")
                alembic_cfg.attributes["configure_logger"] = False

                alembic_cfg.set_main_option("sqlalchemy.url", SYNC_DATABASE_URL)
                alembic_cfg.attributes["connection"] = connection

                script = ScriptDirectory.from_config(alembic_cfg)
                migration_context = MigrationContext.configure(connection)
                current_rev = migration_context.get_current_revision()
                head_rev = script.get_current_head()

                logger.info(f"Current database revision: {current_rev or 'None (empty database)'}")
                logger.info(f"Target head revision: {head_rev}")

                if current_rev == head_rev:
                    logger.info("✅ Database is already up to date.")
                    return

                logger.info("Pending migrations detected, proceeding with upgrade...")
                command.upgrade(alembic_cfg, "head")
                logger.info("✅ Database migrations applied successfully!")

        finally:
            migration_engine.dispose()
            logger.info("Migration engine disposed.")

    try:
        await asyncio.to_thread(run_migrations_sync)
    except Exception as e:
        error_msg = f"Database migration failed: {e}"
        logger.error(error_msg, exc_info=True)
        raise RuntimeError(error_msg)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency that provides a database session for each request.
    """
    async with AsyncSession(async_engine) as session:
        yield session
