from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel, UniqueConstraint

from app.schemas.provider import ProviderScope, ProviderType


class ProviderBase(SQLModel):
    scope: ProviderScope = Field(
        sa_column=sa.Column(
            sa.Enum(*(v.value for v in ProviderScope), name="providerscope", native_enum=True),
            nullable=False,
            index=True,
        )
    )
    user_id: str | None = Field(
        index=True,
        default=None,
        nullable=True,
        description="The user ID from authentication provider (e.g., Casdoor user ID)",
    )
    name: str = Field(
        index=True, min_length=1, max_length=100, description="Display name for this provider configuration"
    )
    provider_type: ProviderType = Field(
        sa_column=sa.Column(
            sa.Enum(*(v.value for v in ProviderType), name="providertype", native_enum=True),
            nullable=False,
            index=True,
        )
    )
    key: str = Field(description="API key or authentication token for the provider")
    api: str = Field(description="API endpoint URL for the provider (e.g., https://api.openai.com/v1)")
    model: str | None = Field(default=None, description="Default model name to use (e.g., 'gpt-4o')")
    max_tokens: int = Field(
        default=4096, ge=1, le=128000, description="Maximum number of tokens in the response (1-128000)"
    )
    temperature: float = Field(
        default=0.7, ge=0.0, le=2.0, description="Sampling temperature for response randomness (0.0-2.0)"
    )
    timeout: int = Field(default=120, ge=1, le=300, description="Request timeout in seconds (1-300)")

    provider_config: dict | None = Field(
        default=None, sa_column=Column(JSON), description="Provider-specific configuration as JSON"
    )

    @property
    def is_system(self) -> bool:
        return self.scope == ProviderScope.SYSTEM


class Provider(ProviderBase, table=True):
    __table_args__ = (UniqueConstraint("provider_type", "scope", "user_id", name="unique_provider_per_scope"),)
    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        index=True,
        description="Unique identifier for this provider configuration",
    )


class ProviderRead(ProviderBase):
    id: UUID = Field(
        description="Unique identifier for this provider configuration",
    )


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(SQLModel):
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="Display name for this provider configuration",
    )
    scope: ProviderScope = Field(
        default=ProviderScope.USER,
        description="Scope of this provider configuration",
    )
    provider_type: str | None = Field(
        default=None,
        description="Type of LLM provider: 'openai', 'azure_openai', 'anthropic', 'google'",
    )
    api: str | None = Field(
        default=None,
        description="API endpoint URL for the provider",
    )
    key: str | None = Field(
        default=None,
        description="API key or authentication token for the provider",
    )
    timeout: int | None = Field(
        default=None,
        ge=1,
        le=300,
        description="Request timeout in seconds (1-300)",
    )
    model: str | None = Field(
        default=None,
        description="Default model name to use",
    )
    max_tokens: int | None = Field(
        default=None,
        ge=1,
        le=128000,
        description="Maximum number of tokens in the response (1-128000)",
    )
    temperature: float | None = Field(
        default=None,
        ge=0.0,
        le=2.0,
        description="Sampling temperature for response randomness (0.0-2.0)",
    )
    provider_config: dict | None = Field(
        default=None,
        description="Provider-specific configuration as JSON",
    )
