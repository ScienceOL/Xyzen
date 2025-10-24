from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class ProviderBase(SQLModel):
    """Base model for a provider with required fields for creation."""

    user_id: str = Field(
        index=True,
        description="The user ID from authentication provider (e.g., Casdoor user ID)",
    )
    name: str = Field(
        index=True,
        min_length=1,
        max_length=100,
        description="Display name for this provider configuration",
    )
    provider_type: str = Field(
        index=True,
        description="Type of LLM provider: 'openai', 'azure_openai', 'anthropic', 'google'",
    )
    api: str = Field(
        description="API endpoint URL for the provider (e.g., https://api.openai.com/v1)",
    )
    key: str = Field(
        description="API key or authentication token for the provider",
    )
    timeout: int = Field(
        default=60,
        ge=1,
        le=300,
        description="Request timeout in seconds (1-300)",
    )
    model: Optional[str] = Field(
        default=None,
        description="Default model name to use (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022')",
    )
    max_tokens: int = Field(
        default=4096,
        ge=1,
        le=128000,
        description="Maximum number of tokens in the response (1-128000)",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="Sampling temperature for response randomness (0.0-2.0)",
    )
    is_default: bool = Field(
        default=False,
        description="Whether this is the user's default provider for new sessions",
    )
    is_system: bool = Field(
        default=False,
        index=True,
        description="System-provided default provider (read-only for regular users)",
    )


class Provider(ProviderBase, table=True):
    """Database model for a provider, inherits from ProviderBase."""

    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        index=True,
        description="Unique identifier for this provider configuration",
    )


class ProviderRead(ProviderBase):
    """Model for reading a provider, includes the ID."""

    id: UUID = Field(
        description="Unique identifier for this provider configuration",
    )


class ProviderCreate(ProviderBase):
    """Model for creating a provider."""

    pass


class ProviderUpdate(SQLModel):
    """Model for updating a provider. All fields are optional."""

    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="Display name for this provider configuration",
    )
    provider_type: Optional[str] = Field(
        default=None,
        description="Type of LLM provider: 'openai', 'azure_openai', 'anthropic', 'google'",
    )
    api: Optional[str] = Field(
        default=None,
        description="API endpoint URL for the provider",
    )
    key: Optional[str] = Field(
        default=None,
        description="API key or authentication token for the provider",
    )
    timeout: Optional[int] = Field(
        default=None,
        ge=1,
        le=300,
        description="Request timeout in seconds (1-300)",
    )
    model: Optional[str] = Field(
        default=None,
        description="Default model name to use",
    )
    max_tokens: Optional[int] = Field(
        default=None,
        ge=1,
        le=128000,
        description="Maximum number of tokens in the response (1-128000)",
    )
    temperature: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=2.0,
        description="Sampling temperature for response randomness (0.0-2.0)",
    )
    is_default: Optional[bool] = Field(
        default=None,
        description="Whether this is the user's default provider",
    )
