"""Service for fetching model information from models.dev API.

models.dev (https://models.dev) is a comprehensive open-source database
of AI model specifications, pricing, and capabilities.

This service replaces LiteLLM-based model information with models.dev data.
"""

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from .filter import PROVIDER_FILTERS, ModelFilter, ProviderFilterConfig
from .types import ModelInfo, ModelsDevModel, ModelsDevProvider, ModelsDevResponse

logger = logging.getLogger(__name__)

# Provider ID mapping from internal ProviderType to models.dev provider IDs
INTERNAL_TO_MODELSDEV: dict[str, str] = {
    "openai": "openai",
    "azure_openai": "azure",
    "google": "google",
    "google_vertex": "google",  # Use google instead of google-vertex (models.dev has outdated vertex data)
    "qwen": "alibaba",
    "anthropic": "anthropic",
    "deepseek": "deepseek",
}

# Reverse mapping from models.dev to internal ProviderType
MODELSDEV_TO_INTERNAL: dict[str, str] = {
    "openai": "openai",
    "azure": "azure_openai",
    "google": "google",
    "google-vertex": "google_vertex",
    "alibaba": "qwen",
    "anthropic": "anthropic",
    "deepseek": "deepseek",
}


# =============================================================================
# Custom Models Configuration
# =============================================================================
# For models that don't exist in models.dev or need to be added manually.
# Each custom model specifies a base model to inherit properties from.
# =============================================================================


@dataclass
class CustomModelConfig:
    """Configuration for a custom model not in models.dev."""

    model_id: str  # The custom model ID to expose
    base_model_id: str  # The models.dev model ID to inherit from
    base_provider: str  # The models.dev provider of the base model
    provider_type: str  # Which internal provider type this belongs to
    # Optional overrides for specific properties
    overrides: dict = field(default_factory=dict)


# Custom models that don't exist in models.dev
CUSTOM_MODELS: list[CustomModelConfig] = [
    # Example: GEMINI-3-PRO-IMAGE based on GEMINI-2.5-FLASH (models.dev might not have it yet)
    CustomModelConfig(
        model_id="gemini-3-pro-image-preview",
        base_model_id="gemini-2.5-flash-image",
        base_provider="google",
        provider_type="google",
        overrides={
            "name": "Gemini 3 Pro Image",
            "supports_vision": True,
        },
    ),
    CustomModelConfig(
        model_id="gemini-3-pro-image-preview",
        base_model_id="gemini-2.5-flash-image",
        base_provider="google",
        provider_type="google_vertex",
        overrides={
            "name": "Gemini 3 Pro Image",
            "supports_vision": True,
        },
    ),
]


# Manually configured model list for GPUGeek provider
GPUGEEK_MODELS: list[str] = [
    "Vendor2/Claude-3.7-Sonnet",
    "Vendor2/Claude-4-Sonnet",
    "Vendor2/Claude-4.5-Opus",
    "Vendor2/Claude-4.5-Sonnet",
    "DeepSeek/DeepSeek-V3-0324",
    "DeepSeek/DeepSeek-V3.1-0821",
    "DeepSeek/DeepSeek-R1-671B",
]

# Mapping from GPUGeek model names to models.dev (provider_id, model_id)
GPUGEEK_TO_MODELSDEV: dict[str, tuple[str, str]] = {
    "Vendor2/Claude-3.7-Sonnet": ("anthropic", "claude-3-7-sonnet-latest"),
    "Vendor2/Claude-4-Sonnet": ("anthropic", "claude-sonnet-4-20250514"),
    "Vendor2/Claude-4.5-Opus": ("anthropic", "claude-opus-4-5-20251101"),
    "Vendor2/Claude-4.5-Sonnet": ("anthropic", "claude-sonnet-4-5-20250929"),
    "DeepSeek/DeepSeek-V3-0324": ("deepseek", "deepseek-chat"),
    "DeepSeek/DeepSeek-V3.1-0821": ("deepseek", "deepseek-chat"),
    "DeepSeek/DeepSeek-R1-671B": ("deepseek", "deepseek-reasoner"),
}


class ModelsDevService:
    """
    Service for fetching and managing model information from models.dev API.

    Features:
    - Async HTTP fetching from https://models.dev/api.json
    - Redis caching for multi-pod deployments (with in-memory fallback)
    - Model lookup by ID and provider
    - Conversion to LiteLLM-compatible ModelInfo format
    """

    API_URL = "https://models.dev/api.json"
    CACHE_TTL = 3600  # 1 hour in seconds
    CACHE_KEY = "models:dev:api"

    # In-memory fallback cache (used when Redis is unavailable or disabled)
    _local_cache: ModelsDevResponse | None = None
    _local_cache_time: float = 0

    @classmethod
    async def _get_redis(cls) -> Any | None:
        """Get Redis client if available."""
        try:
            from app.configs import configs

            if configs.Redis.CacheBackend != "redis":
                return None

            from app.infra.redis import get_redis_client

            return await get_redis_client()
        except Exception as e:
            logger.debug(f"Redis not available for models cache: {e}")
            return None

    @classmethod
    def _is_local_cache_valid(cls) -> bool:
        """Check if the local cache is still valid based on TTL."""
        if cls._local_cache is None:
            return False
        return (time.time() - cls._local_cache_time) < cls.CACHE_TTL

    @classmethod
    async def fetch_data(cls) -> ModelsDevResponse:
        """
        Fetch model data from models.dev API with caching.

        Uses Redis cache for multi-pod deployments, falls back to local cache.

        Returns:
            Dictionary mapping provider ID to ModelsDevProvider
        """
        # Try Redis cache first
        redis_client = await cls._get_redis()
        if redis_client:
            try:
                cached_data = await redis_client.get(cls.CACHE_KEY)
                if cached_data:
                    logger.debug("Using Redis cached models.dev data")
                    raw_data = json.loads(cached_data)
                    return cls._parse_raw_data(raw_data)
            except Exception as e:
                logger.warning(f"Redis cache read failed: {e}")

        # Try local cache
        if cls._is_local_cache_valid() and cls._local_cache is not None:
            logger.debug("Using local cached models.dev data")
            return cls._local_cache

        # Fetch fresh data
        logger.info("Fetching fresh data from models.dev API")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(cls.API_URL)
                response.raise_for_status()
                raw_data = response.json()

            parsed = cls._parse_raw_data(raw_data)

            # Update Redis cache
            if redis_client:
                try:
                    await redis_client.setex(cls.CACHE_KEY, cls.CACHE_TTL, json.dumps(raw_data))
                    logger.info(f"Cached {len(parsed)} providers in Redis")
                except Exception as e:
                    logger.warning(f"Redis cache write failed: {e}")

            # Update local cache as fallback
            cls._local_cache = parsed
            cls._local_cache_time = time.time()
            logger.info(f"Cached {len(parsed)} providers from models.dev")

            return parsed

        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch from models.dev API: {e}")
            # Return any cached data if available, even if expired
            if cls._local_cache is not None:
                logger.warning("Returning stale local cached data due to fetch error")
                return cls._local_cache
            raise

    @classmethod
    def _parse_raw_data(cls, raw_data: dict) -> ModelsDevResponse:
        """Parse raw API response into typed models."""
        parsed: ModelsDevResponse = {}
        for provider_id, provider_data in raw_data.items():
            try:
                parsed[provider_id] = ModelsDevProvider.model_validate(provider_data)
            except Exception as e:
                logger.warning(f"Failed to parse provider {provider_id}: {e}")
                continue
        return parsed

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
        Convert a ModelsDevModel to our custom ModelInfo format.

        Args:
            model: The ModelsDevModel to convert
            provider_id: The provider ID for this model

        Returns:
            ModelInfo instance with model metadata
        """
        # Get cost data with defaults
        cost = model.cost
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
        internal_provider = MODELSDEV_TO_INTERNAL.get(provider_id, provider_id)

        # Check if web search is supported (Gemini 2.0+ supports built-in search)
        supports_web_search = False
        if provider_id in ["google", "google-vertex"]:
            version_match = re.search(r"(\d+\.?\d*)", model.id)
            if version_match:
                try:
                    version = float(version_match.group(1))
                    supports_web_search = version >= 2.0
                except ValueError:
                    pass

        return ModelInfo(
            key=model.id,
            name=model.name,
            max_tokens=max_output,
            max_input_tokens=max_input,
            max_output_tokens=max_output,
            # Convert from per-million to per-token
            input_cost_per_token=input_cost / 1_000_000,
            output_cost_per_token=output_cost / 1_000_000,
            litellm_provider=internal_provider,
            mode="chat",
            supports_function_calling=model.tool_call,
            supports_parallel_function_calling=model.tool_call,
            supports_vision="image" in input_modalities,
            supports_audio_input="audio" in input_modalities,
            supports_audio_output="audio" in output_modalities,
            supports_reasoning=model.reasoning,
            supports_structured_output=model.structured_output,
            supports_web_search=supports_web_search,
            model_family=model.family,
            knowledge_cutoff=model.knowledge,
            release_date=model.release_date,
            open_weights=model.open_weights,
        )

    @classmethod
    async def get_model_info_for_key(
        cls,
        model_id: str,
        provider_id: str | None = None,
    ) -> ModelInfo | None:
        """
        Get model info directly in our ModelInfo format.

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
    async def get_models_by_provider_as_model_info(cls, provider_id: str) -> list[ModelInfo]:
        """
        Get all models for a provider in our ModelInfo format.

        Args:
            provider_id: The provider identifier (models.dev ID)

        Returns:
            List of ModelInfo instances
        """
        models = await cls.get_models_by_provider(provider_id)
        return [cls.to_model_info(model, provider_id) for model in models]

    @classmethod
    async def get_gpugeek_models(cls) -> list[ModelInfo]:
        """
        Get GPUGeek models with pricing looked up from models.dev.

        Returns:
            List of ModelInfo for GPUGeek models
        """
        models: list[ModelInfo] = []

        for gpugeek_model in GPUGEEK_MODELS:
            # Try to get pricing from mapped models.dev model
            mapping = GPUGEEK_TO_MODELSDEV.get(gpugeek_model)

            # Default model info
            model_info = ModelInfo(
                key=gpugeek_model,
                name=gpugeek_model.split("/")[-1] if "/" in gpugeek_model else gpugeek_model,
                max_tokens=4096,
                max_input_tokens=128000,
                max_output_tokens=4096,
                input_cost_per_token=0.0,
                output_cost_per_token=0.0,
                litellm_provider="openai",  # GPUGeek uses OpenAI-compatible API
                mode="chat",
                supports_function_calling=True,
                supports_parallel_function_calling=True,
                supports_vision="image" in gpugeek_model.lower(),
                supports_reasoning="r1" in gpugeek_model.lower(),
            )

            # Try to get real pricing from models.dev
            if mapping:
                provider_id, model_id = mapping
                try:
                    source_info = await cls.get_model_info_for_key(model_id, provider_id)
                    if source_info:
                        # Update with real data from models.dev
                        model_info = ModelInfo(
                            key=gpugeek_model,
                            name=gpugeek_model.split("/")[-1] if "/" in gpugeek_model else gpugeek_model,
                            max_tokens=source_info.max_tokens,
                            max_input_tokens=source_info.max_input_tokens,
                            max_output_tokens=source_info.max_output_tokens,
                            input_cost_per_token=source_info.input_cost_per_token,
                            output_cost_per_token=source_info.output_cost_per_token,
                            litellm_provider="openai",
                            mode="chat",
                            supports_function_calling=source_info.supports_function_calling,
                            supports_parallel_function_calling=source_info.supports_parallel_function_calling,
                            supports_vision=source_info.supports_vision,
                            supports_audio_input=source_info.supports_audio_input,
                            supports_audio_output=source_info.supports_audio_output,
                            supports_reasoning=source_info.supports_reasoning,
                            supports_structured_output=source_info.supports_structured_output,
                            supports_web_search=source_info.supports_web_search,
                            model_family=source_info.model_family,
                            knowledge_cutoff=source_info.knowledge_cutoff,
                            release_date=source_info.release_date,
                            open_weights=source_info.open_weights,
                        )
                        logger.debug(f"Mapped GPUGeek {gpugeek_model} -> {provider_id}/{model_id}")
                except Exception as e:
                    logger.warning(f"Failed to get pricing for {gpugeek_model}: {e}")

            models.append(model_info)

        return models

    @classmethod
    async def get_models_by_provider_type(
        cls,
        provider_type: str,
        filter_config: ProviderFilterConfig | None = None,
        use_default_filter: bool = True,
    ) -> list[ModelInfo]:
        """
        Get models for an internal provider type (e.g., 'openai', 'azure_openai').

        Args:
            provider_type: Internal provider type (matches ProviderType enum values)
            filter_config: Optional custom filter config to apply
            use_default_filter: Whether to use default provider filter rules (default: True)

        Returns:
            List of ModelInfo for the provider, sorted by version (descending) then name
        """
        # Handle GPUGeek specially
        if provider_type == "gpugeek":
            return await cls.get_gpugeek_models()

        # Map internal provider type to models.dev provider ID
        modelsdev_id = INTERNAL_TO_MODELSDEV.get(provider_type)
        if not modelsdev_id:
            logger.warning(f"Unknown provider type: {provider_type}")
            return []

        models = await cls.get_models_by_provider_as_model_info(modelsdev_id)

        # Apply filter
        effective_filter = filter_config
        if effective_filter is None and use_default_filter:
            effective_filter = PROVIDER_FILTERS.get(provider_type)

        if effective_filter:
            models = [m for m in models if effective_filter.matches(m.key)]

        # Add custom models for this provider type
        custom_models = await cls._get_custom_models_for_provider(provider_type)
        models.extend(custom_models)

        # Sort models: by version descending, then by name
        models = cls._sort_models(models)

        logger.debug(f"Filtered {len(models)} models for provider {provider_type}")
        return models

    @classmethod
    async def _get_custom_models_for_provider(cls, provider_type: str) -> list[ModelInfo]:
        """
        Get custom models configured for a specific provider type.

        Custom models inherit properties from a base model in models.dev,
        with optional overrides.
        """
        custom_models: list[ModelInfo] = []

        for config in CUSTOM_MODELS:
            if config.provider_type != provider_type:
                continue

            # Get base model info from models.dev
            base_info = await cls.get_model_info_for_key(config.base_model_id, config.base_provider)

            if base_info:
                # Create custom model by copying base and applying overrides
                model_data = base_info.model_dump()
                model_data["key"] = config.model_id
                model_data["name"] = config.overrides.get("name", config.model_id)

                # Apply any additional overrides
                for key, value in config.overrides.items():
                    if key in model_data:
                        model_data[key] = value

                custom_models.append(ModelInfo(**model_data))
                logger.debug(f"Added custom model {config.model_id} based on {config.base_model_id}")
            else:
                # Create a minimal model if base not found
                logger.warning(f"Base model {config.base_model_id} not found for custom model {config.model_id}")
                custom_models.append(
                    ModelInfo(
                        key=config.model_id,
                        name=config.overrides.get("name", config.model_id),
                        **{k: v for k, v in config.overrides.items() if k != "name"},
                    )
                )

        return custom_models

    @classmethod
    def _sort_models(cls, models: list[ModelInfo]) -> list[ModelInfo]:
        """
        Sort models by version (descending) then by name (ascending).

        Models with higher versions appear first. Within the same version,
        models are sorted alphabetically by key.
        """

        def sort_key(model: ModelInfo) -> tuple[float, str]:
            # Extract version number for sorting (higher versions first)
            version_info = ModelFilter.extract_version(model.key)
            version = -version_info[0] if version_info else 0  # Negative for descending
            return (version, model.key.lower())

        return sorted(models, key=sort_key)

    @classmethod
    async def get_all_providers_with_models(
        cls,
        provider_types: list[str] | None = None,
    ) -> dict[str, list[ModelInfo]]:
        """
        Get all providers with their available models.

        Uses the default filter config for each provider type.

        Args:
            provider_types: Optional list of provider types to include.
                           Defaults to all supported providers.

        Returns:
            Dictionary mapping internal provider type to list of ModelInfo
        """
        if provider_types is None:
            provider_types = ["openai", "azure_openai", "google", "google_vertex", "gpugeek", "qwen"]

        result: dict[str, list[ModelInfo]] = {}

        for provider_type in provider_types:
            try:
                models = await cls.get_models_by_provider_type(provider_type)
                if models:
                    result[provider_type] = models
            except Exception as e:
                logger.warning(f"Failed to get models for {provider_type}: {e}")

        return result

    @classmethod
    async def list_all_models(cls) -> list[str]:
        """
        Get a list of all model IDs from all providers.

        Returns:
            List of model ID strings
        """
        data = await cls.fetch_data()
        model_ids: list[str] = []

        for provider in data.values():
            model_ids.extend(provider.models.keys())

        return model_ids

    @classmethod
    async def clear_cache(cls) -> None:
        """Clear both Redis and local caches."""
        # Clear Redis cache
        redis_client = await cls._get_redis()
        if redis_client:
            try:
                await redis_client.delete(cls.CACHE_KEY)
                logger.info("Redis models.dev cache cleared")
            except Exception as e:
                logger.warning(f"Failed to clear Redis cache: {e}")

        # Clear local cache
        cls._local_cache = None
        cls._local_cache_time = 0
        logger.info("Local models.dev cache cleared")
