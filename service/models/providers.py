from typing import ClassVar, Optional

from sqlmodel import Field, SQLModel


class ProviderBase(SQLModel):
    """Base model for a provider with required fields for creation."""

    Name: str = Field(index=True, unique=True)
    Api: str
    Key: str
    Timeout: int = 10
    Model: Optional[str] = None
    MaxTokens: int = 4096
    Temperature: float = 0.7


class Provider(ProviderBase, table=True):
    """Database model for a provider, inherits from ProviderBase."""

    __tablename__: ClassVar[str] = "providers"

    id: Optional[int] = Field(default=None, primary_key=True)


class ProviderCreate(ProviderBase):
    """Model for creating a provider."""

    pass


class ProviderRead(ProviderBase):
    """Model for reading a provider."""

    id: int


class ProviderUpdate(SQLModel):
    """Model for updating a provider. All fields are optional."""

    Name: Optional[str] = None
    Api: Optional[str] = None
    Key: Optional[str] = None
    Timeout: Optional[int] = None
    Model: Optional[str] = None
    MaxTokens: Optional[int] = None
    Temperature: Optional[float] = None
