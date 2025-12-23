from polyfactory import Use
from polyfactory.factories.pydantic_factory import ModelFactory

from app.models.provider import Provider, ProviderCreate
from app.schemas.provider import ProviderScope, ProviderType


class ProviderFactory(ModelFactory[Provider]):
    """Factory for Provider model."""

    __model__ = Provider


class ProviderCreateFactory(ModelFactory[ProviderCreate]):
    """Factory for ProviderCreate schema."""

    __model__ = ProviderCreate

    scope = Use(lambda: ProviderScope.SYSTEM)
    provider_type = Use(lambda: ProviderType.OPENAI)
