"""
LLM Providers Module.
Provides abstract base classes and concrete implementations for different LLM providers.
"""

import logging
from typing import Any, Dict, List, Optional, Type, Union

from internal import configs
from schemas.providers import ProviderType

from .anthropic import AnthropicProvider
from .base import BaseLLMProvider, ChatCompletionRequest, ChatCompletionResponse, ChatMessage
from .google import GoogleProvider
from .openai import OpenAIProvider

logger = logging.getLogger(__name__)


async def initialize_providers() -> None:
    """
    Initialize LLM providers from database and default configuration.
    This should be called once during application startup.
    """
    # First, initialize default Azure OpenAI provider from config
    llm_config = configs.LLM
    if llm_config.is_enabled:
        try:
            provider_manager.add_provider(
                name="default",
                provider_type=llm_config.provider,
                api_key=llm_config.key,
                base_url=llm_config.endpoint,
                azure_endpoint=llm_config.endpoint,
                api_version=llm_config.version,
                default_model=llm_config.deployment,
            )
            logger.info(f"Initialized default {llm_config.provider} provider from config")
        except Exception as e:
            logger.error(f"Failed to initialize default {llm_config.provider} provider: {e}")

    # Set a default active provider if none exists
    if not provider_manager.get_active_provider() and provider_manager.list_providers():
        first_provider = provider_manager.list_providers()[0]["name"]
        provider_manager.set_active_provider(first_provider)


class LLMProviderFactory:
    """
    Factory class for creating LLM provider instances.
    """

    _provider_registry: Dict[ProviderType, Type[BaseLLMProvider]] = {
        ProviderType.OPENAI: OpenAIProvider,
        ProviderType.AZURE_OPENAI: OpenAIProvider,
        ProviderType.ANTHROPIC: AnthropicProvider,
        ProviderType.GOOGLE: GoogleProvider,
    }

    @classmethod
    def create_provider(
        cls, provider_type: Union[ProviderType, str], api_key: str, base_url: Optional[str] = None, **kwargs: Any
    ) -> BaseLLMProvider:
        """
        Create a provider instance based on the provider type.

        Args:
            provider_type: The type of provider to create
            api_key: The API key for authentication
            base_url: Optional base URL for the API
            **kwargs: Additional provider-specific configuration

        Returns:
            The created provider instance

        Raises:
            ValueError: If the provider type is not supported
        """
        if isinstance(provider_type, str):
            try:
                provider_type = ProviderType(provider_type.lower())
            except ValueError:
                raise ValueError(f"Unsupported provider type: {provider_type}")

        if provider_type not in cls._provider_registry:
            raise ValueError(f"No provider registered for type: {provider_type}")

        provider_class = cls._provider_registry[provider_type]

        # Handle provider-specific configuration
        if provider_type == ProviderType.AZURE_OPENAI:
            # Extract azure-specific parameters to avoid duplicate keyword arguments
            azure_endpoint = kwargs.pop("azure_endpoint", base_url)
            api_version = kwargs.pop("api_version", "2024-10-21")
            return provider_class(
                api_key=api_key,
                base_url=base_url,
                is_azure=True,
                azure_endpoint=azure_endpoint,
                api_version=api_version,
                **kwargs,
            )
        elif provider_type == ProviderType.OPENAI:
            logger.info("Creating OpenAI provider")
            return provider_class(api_key=api_key, base_url=base_url, is_azure=False, **kwargs)
        else:
            return provider_class(api_key=api_key, base_url=base_url, **kwargs)

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
        base_url: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        """
        Add a provider to the manager.

        Args:
            name: A unique name for the provider instance
            provider_type: The type of provider to create
            api_key: The API key for authentication
            base_url: Optional base URL for the API
            **kwargs: Additional provider-specific configuration
        """
        try:
            provider = LLMProviderFactory.create_provider(
                provider_type=provider_type, api_key=api_key, base_url=base_url, **kwargs
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


# Global provider manager instance
provider_manager = LLMProviderManager()

__all__ = [
    "BaseLLMProvider",
    "ChatMessage",
    "ChatCompletionRequest",
    "ChatCompletionResponse",
    "OpenAIProvider",
    "AnthropicProvider",
    "GoogleProvider",
    "LLMProviderFactory",
    "LLMProviderManager",
    "ProviderType",
    "provider_manager",
]
