from typing import ClassVar, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class ProviderBase(SQLModel):
    """Base model for a provider with required fields for creation."""

    user_id: str = Field(index=True, description="The user ID from authentication provider")
    name: str = Field(index=True)
    provider_type: str = Field(index=True, description="Type of LLM provider (openai, google, anthropic, etc.)")
    api: str
    key: str
    timeout: int = 10
    model: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 0.7
    is_default: bool = Field(default=False, description="Whether this is the user's default provider")
    is_system: bool = Field(default=False, index=True, description="System-provided default (read-only for users)")


class Provider(ProviderBase, table=True):
    """Database model for a provider, inherits from ProviderBase."""

    __tablename__: ClassVar[str] = "provider"

    id: UUID = Field(default_factory=uuid4, index=True, primary_key=True)


class ProviderRead(ProviderBase):
    """Model for reading a provider, includes the ID."""

    id: UUID


class ProviderCreate(ProviderBase):
    """Model for creating a provider."""

    pass


class ProviderUpdate(SQLModel):
    """Model for updating a provider. All fields are optional."""

    name: Optional[str] = None
    provider_type: Optional[str] = None
    api: Optional[str] = None
    key: Optional[str] = None
    timeout: Optional[int] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    is_default: Optional[bool] = None
