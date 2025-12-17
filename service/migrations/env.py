import importlib
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# Add the service directory to Python path
service_dir = Path(__file__).parent.parent
sys.path.insert(0, str(service_dir))


# Ensure all models are imported to register with SQLModel.metadata
importlib.import_module("models")

# Import project modules after adding to path
from core.configs import configs  # noqa: E402

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
# Check if the 'configure_logger' attribute is set to False.
# This is a custom flag to prevent Alembic from reconfiguring logging
# when called from within the application, which can cause deadlocks.
if config.attributes.get("configure_logger", True):
    if config.config_file_name is not None:
        fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = SQLModel.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def get_database_url() -> str:
    """Get database URL from project configuration."""
    # For migration generation, prefer SQLite if PostgreSQL is not available
    if configs.Database.Engine == "postgres":
        # Check if we can connect to PostgreSQL, fallback to SQLite for development
        import os

        if os.getenv("ALEMBIC_USE_SQLITE", "false").lower() == "true":
            return "sqlite:///./migrations_dev.db"
        return (
            f"postgresql+psycopg://{configs.Database.Postgres.User}:{configs.Database.Postgres.Password}@"
            f"{configs.Database.Postgres.Host}:{configs.Database.Postgres.Port}/{configs.Database.Postgres.DBName}"
        )
    elif configs.Database.Engine == "sqlite":
        return f"sqlite:///{configs.Database.SQLite.Path}"
    else:
        raise ValueError(f"Unsupported database engine: {configs.Database.Engine}")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Get database URL from project config instead of alembic.ini
    database_url = get_database_url()

    # Override the sqlalchemy.url in config
    alembic_config = config.get_section(config.config_ini_section, {})
    alembic_config["sqlalchemy.url"] = database_url

    connectable = engine_from_config(
        alembic_config,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
