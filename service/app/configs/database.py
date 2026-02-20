from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class PostgresConfig(BaseModel):
    Host: str = Field(default="postgresql", description="PostgreSQL host")
    Port: int = Field(default=5432, description="PostgreSQL port")
    User: str = Field(default="postgres", description="PostgreSQL user")
    Password: str = Field(default="postgres", description="PostgreSQL password")
    DBName: str = Field(default="postgres", description="PostgreSQL database name")
    PoolSize: int = Field(default=10, description="Number of persistent connections in the pool")
    MaxOverflow: int = Field(default=20, description="Max temporary connections beyond pool_size")


class SQLiteConfig(BaseModel):
    Path: str = Field(default="bak.db", description="SQLite database file path")


class DatabaseConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        case_sensitive=False,
        extra="ignore",
    )

    Engine: str = Field(default="postgres", description="Database engine (postgres, sqlite)")

    Postgres: PostgresConfig = Field(
        default_factory=lambda: PostgresConfig(),
        description="PostgreSQL configuration",
    )

    SQLite: SQLiteConfig = Field(
        default_factory=lambda: SQLiteConfig(),
        description="SQLite configuration",
    )
