"""
LLM Providers Module.
Provides abstract base classes and concrete implementations for different LLM providers.
"""

import logging
from typing import Any, Dict, List, Optional, Type, Union

from sqlmodel.ext.asyncio.session import AsyncSession

from internal import configs
from schemas.providers import ProviderType

from .anthropic import AnthropicProvider
from .azure_openai import AzureOpenAIProvider
from .base import BaseLLMProvider, ChatCompletionRequest, ChatCompletionResponse, ChatMessage
from .google import GoogleProvider
from .openai import OpenAIProvider

logger = logging.getLogger(__name__)

# System user ID for system-wide provider
SYSTEM_USER_ID = "system"


async def initialize_system_provider(db: AsyncSession) -> Optional[Any]:
    """
    Ensure system default provider exists in database.
    Creates or updates from environment configuration on startup.

    The system provider:
    - Is available to all users as a fallback
    - Cannot be edited or deleted by users
    - Is configured via environment variables

    Args:
        db: Database session

    Returns:
        The system provider if configs.LLM is enabled, None otherwise
    """
    from models.provider import Provider
    from repo.provider import ProviderRepository

    llm_config = configs.LLM

    if not llm_config.is_enabled:
        logger.info("LLM config not enabled, skipping system provider initialization")
        return None

    repo = ProviderRepository(db)
    system_provider: Provider | None = await repo.get_system_provider()

    # Prepare system provider data with explicit type conversion
    provider_type_value = (
        llm_config.provider.value if hasattr(llm_config.provider, "value") else str(llm_config.provider)
    )

    # Ensure all values match the Provider model's expected types
    system_data = {
        "user_id": str(SYSTEM_USER_ID),
        "name": str("System Default"),
        "provider_type": str(provider_type_value),
        "api": str(llm_config.endpoint),
        "key": str(llm_config.key),
        "model": str(llm_config.deployment) if llm_config.deployment else None,
        "timeout": int(60),
        "max_tokens": int(4096),
        "temperature": float(0.7),
        "is_system": bool(True),
        "is_default": bool(False),  # System provider is not a user default
    }

    if system_provider:
        # Update existing system provider
        logger.info(f"Updating existing system provider: {system_provider.id}")
        for key, value in system_data.items():
            if key != "user_id" and key != "is_system":  # Don't change these
                setattr(system_provider, key, value)
        updated_provider = await repo.update_provider(system_provider)
        logger.info(f"System provider updated: {updated_provider.name}")
        return updated_provider
    else:
        # Create new system provider
        logger.info("Creating new system provider from config")
        new_provider = Provider(**system_data)
        created_provider = await repo.create_provider(new_provider)
        logger.info(f"System provider created: {created_provider.name} (ID: {created_provider.id})")
        return created_provider


async def initialize_providers_on_startup() -> None:
    """
    Initialize LLM providers on application startup.
    This function ensures the system provider is created/updated in the database.

    Should be called once during FastAPI lifespan startup.
    All user requests should use get_user_provider_manager() to load providers dynamically.
    """
    from middleware.database.connection import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            await initialize_system_provider(db)
            logger.info("System provider initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize system provider: {e}")
            # Don't raise - allow app to start even if provider init fails


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
        provider_type: Union[ProviderType, str],
        api_key: str,
        api_endpoint: str,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        timeout: int = 60,
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
    def get_supported_providers(cls) -> List[str]:
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
        self._providers: Dict[str, BaseLLMProvider] = {}
        self._active_provider: Optional[str] = None

    def add_provider(
        self,
        name: str,
        provider_type: Union[ProviderType, str],
        api_key: str,
        api_endpoint: str,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        timeout: int = 60,
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

    def get_provider(self, name: Optional[str] = None) -> Optional[BaseLLMProvider]:
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

    def get_active_provider(self) -> Optional[BaseLLMProvider]:
        """
        Get the currently active provider.

        Returns:
            The active provider, or None if no provider is active
        """
        return self.get_provider()

    def list_providers(self) -> List[Dict[str, Any]]:
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

    has_user_default = False

    # Add all providers to the manager
    for db_provider in all_providers:
        try:
            # Use "system" as name for system provider, provider ID for user providers
            provider_name = "system" if db_provider.is_system else str(db_provider.id)

            # Add provider with unified parameters matching SQLModel schema
            user_manager.add_provider(
                name=provider_name,
                provider_type=db_provider.provider_type,
                api_key=db_provider.key,
                api_endpoint=db_provider.api,
                model=db_provider.model,
                max_tokens=db_provider.max_tokens,
                temperature=db_provider.temperature,
                timeout=db_provider.timeout,
            )

            # Set as active if it's the user's default provider
            if db_provider.is_default and not db_provider.is_system:
                user_manager.set_active_provider(provider_name)
                has_user_default = True

            logger.debug(
                f"Loaded provider {db_provider.name} (ID: {db_provider.id}) "
                f"for user {user_id}, system: {db_provider.is_system}, default: {db_provider.is_default}"
            )

        except Exception as e:
            logger.error(f"Failed to load provider {db_provider.name} for user {user_id}: {e}")
            continue

    # If user has no default set, use system provider or first available
    if not user_manager.get_active_provider():
        if "system" in [p["name"] for p in user_manager.list_providers()]:
            user_manager.set_active_provider("system")
            logger.info(f"Using system provider as default for user {user_id}")
        elif user_manager.list_providers():
            first_provider_name = user_manager.list_providers()[0]["name"]
            user_manager.set_active_provider(first_provider_name)
            logger.info(f"No default provider set for user {user_id}, using first available")

    logger.info(f"Loaded {len(all_providers)} provider(s) for user {user_id}")
    return user_manager


__all__ = [
    "BaseLLMProvider",
    "ChatMessage",
    "ChatCompletionRequest",
    "ChatCompletionResponse",
    "OpenAIProvider",
    "AzureOpenAIProvider",
    "AnthropicProvider",
    "GoogleProvider",
    "LLMProviderFactory",
    "LLMProviderManager",
    "ProviderType",
    "get_user_provider_manager",
    "initialize_system_provider",
    "initialize_providers_on_startup",
    "SYSTEM_USER_ID",
]
