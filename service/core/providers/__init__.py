"""
LLM Providers Module.
Provides abstract base classes and concrete implementations for different LLM providers.
"""

import logging
from typing import Any, Dict, Type

from langchain_core.language_models import BaseChatModel
from pydantic import SecretStr
from sqlmodel.ext.asyncio.session import AsyncSession

from internal import configs
from internal.configs.llm import LLMConfig
from middleware.database.connection import AsyncSessionLocal
from models.provider import Provider, ProviderCreate, ProviderUpdate
from repo.provider import ProviderRepository
from schemas.providers import ProviderType

from .anthropic import AnthropicProvider
from .azure_openai import AzureOpenAIProvider
from .base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    ModelCapabilities,
    ModelRegistry,
)
from .google import GoogleProvider
from .openai import OpenAIProvider

logger = logging.getLogger(__name__)

SYSTEM_USER_ID = "da2a8078-dd7c-4052-ad68-1209c3f647f1"


class SystemProviderManager:
    def __init__(self, db: AsyncSession):
        self.repo = ProviderRepository(db)

    async def ensure_system_provider(self, llm_config: LLMConfig) -> Provider | None:
        """
        Ensure system provider exists and is up-to-date.
        Uses upsert pattern for cleaner logic.

        Args:
            llm_config: LLMConfig instance

        Returns:
            The system provider if successful, None otherwise
        """
        if not llm_config.is_enabled:
            logger.info("LLM config not enabled, skipping system provider")
            return None

        try:
            provider_data = llm_config.to_provider_data(user_id=SYSTEM_USER_ID)
            existing = await self.repo.get_system_provider()

            if existing:
                return await self._update_system_provider(existing, provider_data)
            else:
                return await self._create_system_provider(provider_data)

        except Exception as e:
            logger.error(f"Failed to ensure system provider: {e}")
            return None

    async def _create_system_provider(self, provider_data: Dict[str, Any]) -> Provider:
        """Create new system provider."""
        logger.info("Creating new system provider")

        provider_create = ProviderCreate(**provider_data)
        created = await self.repo.create_provider(provider_create, SYSTEM_USER_ID)

        logger.info(f"System provider created: {created.name} (ID: {created.id})")
        return created

    async def _update_system_provider(self, existing: Provider, provider_data: Dict[str, Any]) -> Provider:
        """Update existing system provider."""
        logger.info(f"Updating system provider: {existing.id}")

        update_fields = {
            k: v
            for k, v in provider_data.items()
            if k not in ("user_id", "is_system") and getattr(existing, k, None) != v
        }

        if not update_fields:
            logger.info("System provider already up-to-date")
            return existing

        provider_update = ProviderUpdate(**update_fields)
        updated = await self.repo.update_provider(existing.id, provider_update)

        if not updated:
            raise RuntimeError("Failed to update system provider")

        logger.info(f"System provider updated: {updated.name}")
        return updated


async def initialize_providers_on_startup() -> None:
    """
    Initialize providers on startup with better error handling.
    """

    async with AsyncSessionLocal() as db:
        try:
            manager = SystemProviderManager(db)
            provider = await manager.ensure_system_provider(configs.LLM)
            if provider:
                await db.commit()  # Explicitly commit the transaction
                logger.info(f"System provider ready: {provider.name} ({provider.provider_type})")
            else:
                logger.warning("System provider not configured")
        except Exception as e:
            logger.error(f"Provider initialization failed: {e}")
            await db.rollback()  # Rollback on error


class LLMProviderFactory:
    """
    Factory class for creating LLM provider instances.
    """

    _provider_registry: Dict[ProviderType, Type[BaseLLMProvider]] = {
        ProviderType.OPENAI: OpenAIProvider,
        ProviderType.AZURE_OPENAI: AzureOpenAIProvider,
        ProviderType.ANTHROPIC: AnthropicProvider,
        ProviderType.GOOGLE: GoogleProvider,
    }

    @classmethod
    def create_provider(
        cls,
        provider_type: ProviderType | str,
        api_key: SecretStr,
        api_endpoint: str,
        model: str | None = None,
        max_tokens: int | None = None,  # Now optional
        temperature: float | None = None,  # Now optional
        timeout: int = 120,
        **kwargs: Any,
    ) -> BaseLLMProvider:
        """
        Create a provider instance based on the provider type.

        Args:
            provider_type: The type of provider to create
            api_key: The API key for authentication
            api_endpoint: The API endpoint URL
            model: The default model name
            max_tokens: Maximum tokens for responses
            temperature: Sampling temperature
            timeout: Request timeout in seconds
            **kwargs: Additional provider-specific configuration

        Returns:
            The created provider instance

        Raises:
            ValueError: If the provider type is not supported
        """
        # Convert string to enum if needed
        if isinstance(provider_type, str):
            try:
                provider_type = ProviderType(provider_type.lower())
            except ValueError:
                raise ValueError(f"Unsupported provider type: {provider_type}")

        if provider_type not in cls._provider_registry:
            raise ValueError(f"No provider registered for type: {provider_type}")

        provider_class = cls._provider_registry[provider_type]

        # Create provider with unified parameters
        return provider_class(
            api_key=api_key,
            api_endpoint=api_endpoint,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=timeout,
            **kwargs,
        )

    @classmethod
    def get_supported_providers(cls) -> list[str]:
        """
        Get a list of all supported provider types.

        Returns:
            List of supported provider type names
        """
        return [provider.value for provider in ProviderType]

    @classmethod
    def register_provider(cls, provider_type: ProviderType, provider_class: Type[BaseLLMProvider]) -> None:
        """
        Register a new provider class for a provider type.

        Args:
            provider_type: The provider type
            provider_class: The provider class to register
        """
        cls._provider_registry[provider_type] = provider_class


class LLMProviderManager:
    """
    Manager class for handling multiple LLM providers and switching between them.
    """

    def __init__(self) -> None:
        """Initialize the provider manager."""
        self._providers: dict[str, BaseLLMProvider] = {}
        self._active_provider: str | None = None

    def add_provider(
        self,
        name: str,
        provider_type: ProviderType | str,
        api_key: SecretStr,
        api_endpoint: str,
        model: str | None = None,
        max_tokens: int | None = None,  # Now optional
        temperature: float | None = None,  # Now optional
        timeout: int = 120,
        **kwargs: Any,
    ) -> None:
        """
        Add a provider to the manager.

        Args:
            name: A unique name for the provider instance
            provider_type: The type of provider to create
            api_key: The API key for authentication
            api_endpoint: The API endpoint URL
            model: The default model name
            max_tokens: Maximum tokens for responses
            temperature: Sampling temperature
            timeout: Request timeout in seconds
            **kwargs: Additional provider-specific configuration
        """
        try:
            provider = LLMProviderFactory.create_provider(
                provider_type=provider_type,
                api_key=api_key,
                api_endpoint=api_endpoint,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                timeout=timeout,
                **kwargs,
            )
            self._providers[name] = provider

            # Set as active if it's the first provider
            if self._active_provider is None:
                self._active_provider = name

            logger.info(f"Added {provider_type} provider as '{name}'")

        except Exception as e:
            logger.error(f"Failed to add provider '{name}': {e}")
            raise

    def set_active_provider(self, name: str) -> None:
        """
        Set the active provider by name.

        Args:
            name: The name of the provider to set as active

        Raises:
            ValueError: If the provider name is not found
        """
        if name not in self._providers:
            raise ValueError(f"Provider '{name}' not found")

        self._active_provider = name
        logger.info(f"Switched to provider '{name}'")

    def get_provider(self, name: str | None = None) -> BaseLLMProvider | None:
        """
        Get a provider by name, or the active provider if no name is specified.

        Args:
            name: Optional name of the provider to get. If None, returns active provider

        Returns:
            The requested provider, or None if not found
        """
        provider_name = name or self._active_provider
        if provider_name is None:
            return None
        return self._providers.get(provider_name)

    def get_active_provider(self) -> BaseLLMProvider | None:
        """
        Get the currently active provider.

        Returns:
            The active provider, or None if no provider is active
        """
        return self.get_provider()

    def list_providers(self) -> list[Dict[str, Any]]:
        """
        List all registered providers.

        Returns:
            A list of provider information dictionaries
        """
        providers = []
        for name, provider in self._providers.items():
            providers.append(
                {
                    "name": name,
                    "type": provider.provider_name,
                    "active": name == self._active_provider,
                    "available": provider.is_available(),
                }
            )
        return providers

    def remove_provider(self, name: str) -> None:
        """
        Remove a provider from the manager.

        Args:
            name: The name of the provider to remove

        Raises:
            ValueError: If the provider name is not found
        """
        if name not in self._providers:
            raise ValueError(f"Provider '{name}' not found")

        del self._providers[name]

        # Reset active provider if it was removed
        if self._active_provider == name:
            if self._providers:
                self._active_provider = next(iter(self._providers))
            else:
                self._active_provider = None

        logger.info(f"Removed provider '{name}'")

    def create_langchain_model(self, name: str | None = None) -> BaseChatModel:
        """
        Create a LangChain model from a provider.

        Args:
            name: Optional name of the provider to use. If None, uses active provider

        Returns:
            BaseChatModel instance ready for use with LangChain

        Raises:
            ValueError: If the provider is not found or not available
        """
        provider = self.get_provider(name)
        if not provider:
            raise ValueError(f"Provider '{name or 'active'}' not found")

        if not provider.is_available():
            raise ValueError(f"Provider '{name or 'active'}' is not available")

        return provider.to_langchain_model()


async def get_user_provider_manager(user_id: str, db: AsyncSession) -> LLMProviderManager:
    """
    Create a provider manager with all providers for a specific user.

    This function loads providers from the database (user's own + system provider)
    and creates a fresh LLMProviderManager instance.

    Args:
        user_id: The user ID to load providers for
        db: Database session

    Returns:
        LLMProviderManager configured with user's providers and system fallback

    Raises:
        ValueError: If no providers available (neither user's nor system)
    """
    from repo.provider import ProviderRepository

    provider_repo = ProviderRepository(db)

    # Get user's providers (include_system=True to get both user and system providers)
    all_providers = await provider_repo.get_providers_by_user(user_id, include_system=True)

    if not all_providers:
        raise ValueError(f"No providers available for user {user_id}")

    # Create a new provider manager for this user
    user_manager = LLMProviderManager()

    # Add all providers to the manager
    for db_provider in all_providers:
        try:
            # Use "system" as name for system provider, provider ID for user providers
            provider_name = "system" if db_provider.is_system else str(db_provider.id)

            # Add provider with unified parameters matching SQLModel schema
            # Pass provider_config as kwargs for provider-specific configuration
            user_manager.add_provider(
                name=provider_name,
                provider_type=db_provider.provider_type,
                api_key=SecretStr(db_provider.key),
                api_endpoint=db_provider.api,
                model=db_provider.model,
                max_tokens=db_provider.max_tokens,
                temperature=db_provider.temperature,
                timeout=db_provider.timeout,
                **(db_provider.provider_config or {}),  # Pass provider-specific config, default to empty dict
            )

            logger.debug(
                f"Loaded provider {db_provider.name} (ID: {db_provider.id}) "
                f"for user {user_id}, system: {db_provider.is_system}"
            )

        except Exception as e:
            logger.error(f"Failed to load provider {db_provider.name} for user {user_id}: {e}")
            continue

    # Set system provider as default fallback if available
    if "system" in [p["name"] for p in user_manager.list_providers()]:
        user_manager.set_active_provider("system")
        logger.info(f"Using system provider as fallback for user {user_id}")
    elif user_manager.list_providers():
        first_provider_name = user_manager.list_providers()[0]["name"]
        user_manager.set_active_provider(first_provider_name)
        logger.info(f"Using first available provider for user {user_id}")

    logger.info(f"Loaded {len(all_providers)} provider(s) for user {user_id}")
    return user_manager


__all__ = [
    "BaseLLMProvider",
    "ChatMessage",
    "ChatCompletionRequest",
    "ChatCompletionResponse",
    "ModelCapabilities",
    "ModelRegistry",
    "OpenAIProvider",
    "AzureOpenAIProvider",
    "AnthropicProvider",
    "GoogleProvider",
    "LLMProviderFactory",
    "LLMProviderManager",
    "SystemProviderManager",
    "ProviderType",
    "get_user_provider_manager",
    "initialize_providers_on_startup",
    "SYSTEM_USER_ID",
]
