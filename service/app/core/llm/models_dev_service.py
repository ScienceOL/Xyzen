"""Service for fetching model information from models.dev API.

models.dev (https://models.dev) is a comprehensive open-source database
of AI model specifications, pricing, and capabilities.
"""

import logging
import time
from typing import Any, cast

import httpx
from litellm.types.utils import ModelInfo

from .models_dev_types import ModelsDevModel, ModelsDevProvider, ModelsDevResponse

logger = logging.getLogger(__name__)

# Provider ID mapping from models.dev to internal ProviderType values
PROVIDER_TYPE_MAPPING: dict[str, str] = {
    "openai": "openai",
    "azure": "azure_openai",
    "google": "google",
    "google-vertex": "google_vertex",
    "alibaba": "qwen",
    "anthropic": "anthropic",
    "deepseek": "deepseek",
}


class ModelsDevService:
    """
    Service for fetching and managing model information from models.dev API.

    Features:
    - Async HTTP fetching from https://models.dev/api.json
    - In-memory caching with configurable TTL
    - Model lookup by ID and provider
    - Conversion to LiteLLM-compatible ModelInfo format
    """

    API_URL = "https://models.dev/api.json"
    CACHE_TTL = 3600  # 1 hour in seconds

    _cache: ModelsDevResponse | None = None
    _cache_time: float = 0

    @classmethod
    def _is_cache_valid(cls) -> bool:
        """Check if the cache is still valid based on TTL."""
        if cls._cache is None:
            return False
        return (time.time() - cls._cache_time) < cls.CACHE_TTL

    @classmethod
    async def fetch_data(cls) -> ModelsDevResponse:
        """
        Fetch model data from models.dev API with caching.

        Returns:
            Dictionary mapping provider ID to ModelsDevProvider
        """
        if cls._is_cache_valid() and cls._cache is not None:
            logger.debug("Using cached models.dev data")
            return cls._cache

        logger.info("Fetching fresh data from models.dev API")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(cls.API_URL)
                response.raise_for_status()
                raw_data = response.json()

            # Parse the response into typed models
            parsed: ModelsDevResponse = {}
            for provider_id, provider_data in raw_data.items():
                try:
                    parsed[provider_id] = ModelsDevProvider.model_validate(provider_data)
                except Exception as e:
                    logger.warning(f"Failed to parse provider {provider_id}: {e}")
                    continue

            # Update cache
            cls._cache = parsed
            cls._cache_time = time.time()
            logger.info(f"Cached {len(parsed)} providers from models.dev")
            return parsed

        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch from models.dev API: {e}")
            # Return cached data if available, even if expired
            if cls._cache is not None:
                logger.warning("Returning stale cached data due to fetch error")
                return cls._cache
            raise

    @classmethod
    async def get_model_info(
        cls,
        model_id: str,
        provider_id: str | None = None,
    ) -> ModelsDevModel | None:
        """
        Get model information by model ID.

        Args:
            model_id: The model identifier (e.g., "gpt-4o", "claude-opus-4-5")
            provider_id: Optional provider ID to narrow search

        Returns:
            ModelsDevModel if found, None otherwise
        """
        data = await cls.fetch_data()

        if provider_id:
            # Search in specific provider
            provider = data.get(provider_id)
            if provider and model_id in provider.models:
                return provider.models[model_id]
            return None

        # Search across all providers
        for provider in data.values():
            if model_id in provider.models:
                return provider.models[model_id]

        return None

    @classmethod
    async def get_models_by_provider(cls, provider_id: str) -> list[ModelsDevModel]:
        """
        Get all models for a specific provider.

        Args:
            provider_id: The provider identifier (e.g., "openai", "anthropic")

        Returns:
            List of ModelsDevModel for the provider
        """
        data = await cls.fetch_data()
        provider = data.get(provider_id)

        if not provider:
            logger.debug(f"Provider {provider_id} not found in models.dev")
            return []

        return list(provider.models.values())

    @classmethod
    async def get_provider(cls, provider_id: str) -> ModelsDevProvider | None:
        """
        Get provider information by ID.

        Args:
            provider_id: The provider identifier

        Returns:
            ModelsDevProvider if found, None otherwise
        """
        data = await cls.fetch_data()
        return data.get(provider_id)

    @classmethod
    async def list_providers(cls) -> list[str]:
        """
        List all available provider IDs.

        Returns:
            List of provider ID strings
        """
        data = await cls.fetch_data()
        return list(data.keys())

    @classmethod
    async def search_models(
        cls,
        query: str,
        provider_id: str | None = None,
        family: str | None = None,
    ) -> list[tuple[str, ModelsDevModel]]:
        """
        Search for models by name or ID.

        Args:
            query: Search string (case-insensitive)
            provider_id: Optional provider to filter by
            family: Optional model family to filter by

        Returns:
            List of (provider_id, model) tuples matching the search
        """
        data = await cls.fetch_data()
        query_lower = query.lower()
        results: list[tuple[str, ModelsDevModel]] = []

        providers_to_search = [data[provider_id]] if provider_id and provider_id in data else data.values()

        for provider in providers_to_search:
            for model in provider.models.values():
                # Filter by family if specified
                if family and model.family != family:
                    continue

                # Check if query matches ID or name
                if query_lower in model.id.lower() or query_lower in model.name.lower():
                    results.append((provider.id, model))

        return results

    @classmethod
    def to_model_info(cls, model: ModelsDevModel, provider_id: str) -> ModelInfo:
        """
        Convert a ModelsDevModel to LiteLLM-compatible ModelInfo format.

        Args:
            model: The ModelsDevModel to convert
            provider_id: The provider ID for this model

        Returns:
            ModelInfo dictionary compatible with existing LiteLLM usage
        """
        # Get cost data with defaults
        cost = model.cost or ModelsDevModel(id="", name="").cost
        input_cost = cost.input if cost else 0.0
        output_cost = cost.output if cost else 0.0

        # Get limit data with defaults
        limit = model.limit
        max_input = limit.context if limit else 4096
        max_output = limit.output if limit else 4096

        # Get modalities with defaults
        modalities = model.modalities
        input_modalities = modalities.input if modalities else ["text"]
        output_modalities = modalities.output if modalities else ["text"]

        # Map to internal provider type if available
        litellm_provider = PROVIDER_TYPE_MAPPING.get(provider_id, provider_id)

        model_data: dict[str, Any] = {
            "key": model.id,
            "max_tokens": max_output,
            "max_input_tokens": max_input,
            "max_output_tokens": max_output,
            # Convert from per-million to per-token
            "input_cost_per_token": input_cost / 1_000_000,
            "output_cost_per_token": output_cost / 1_000_000,
            "litellm_provider": litellm_provider,
            "mode": "chat",
            "supports_function_calling": model.tool_call,
            "supports_parallel_function_calling": model.tool_call,
            "supports_vision": "image" in input_modalities,
            "supports_audio_input": "audio" in input_modalities,
            "supports_audio_output": "audio" in output_modalities,
            "supported_openai_params": None,
            # Additional models.dev specific fields
            "supports_reasoning": model.reasoning,
            "supports_structured_output": model.structured_output,
            "supports_attachment": model.attachment,
            "open_weights": model.open_weights,
            "model_family": model.family,
            "knowledge_cutoff": model.knowledge,
            "release_date": model.release_date,
        }

        return cast(ModelInfo, model_data)

    @classmethod
    async def get_model_info_as_litellm(
        cls,
        model_id: str,
        provider_id: str | None = None,
    ) -> ModelInfo | None:
        """
        Get model info directly in LiteLLM-compatible format.

        Args:
            model_id: The model identifier
            provider_id: Optional provider ID to narrow search

        Returns:
            ModelInfo if found, None otherwise
        """
        data = await cls.fetch_data()

        if provider_id:
            provider = data.get(provider_id)
            if provider and model_id in provider.models:
                return cls.to_model_info(provider.models[model_id], provider_id)
            return None

        # Search across all providers
        for pid, provider in data.items():
            if model_id in provider.models:
                return cls.to_model_info(provider.models[model_id], pid)

        return None

    @classmethod
    async def get_models_by_provider_as_litellm(cls, provider_id: str) -> list[ModelInfo]:
        """
        Get all models for a provider in LiteLLM-compatible format.

        Args:
            provider_id: The provider identifier

        Returns:
            List of ModelInfo dictionaries
        """
        models = await cls.get_models_by_provider(provider_id)
        return [cls.to_model_info(model, provider_id) for model in models]

    @classmethod
    def clear_cache(cls) -> None:
        """Clear the in-memory cache."""
        cls._cache = None
        cls._cache_time = 0
        logger.info("models.dev cache cleared")
