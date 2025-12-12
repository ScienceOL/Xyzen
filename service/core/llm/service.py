import logging
import re
from typing import Any, Callable, cast

import litellm
from litellm.constants import LITELLM_CHAT_PROVIDERS
from litellm.types.utils import ModelInfo

from common.code.error_code import ErrCode

logger = logging.getLogger(__name__)


class ModelFilter:
    """
    Flexible model filtering with support for version comparison and custom rules.
    """

    @staticmethod
    def extract_version(model_name: str) -> tuple[float, str] | None:
        """
        Extract version number from model name.

        Examples:
            - "gemini-1.5-pro" -> (1.5, "gemini-1.5-pro")
            - "gemini-2.0-flash" -> (2.0, "gemini-2.0-flash")
            - "gpt-4o" -> None

        Args:
            model_name: The model identifier

        Returns:
            Tuple of (version, original_name) or None if no version found
        """
        # Pattern to match version numbers like 1.5, 2.0, 2.5, etc.
        version_pattern = r"(\d+\.?\d*)"
        match = re.search(version_pattern, model_name)

        if match:
            try:
                version = float(match.group(1))
                return (version, model_name)
            except ValueError:
                return None
        return None

    @staticmethod
    def version_filter(min_version: float | None = None, max_version: float | None = None) -> Callable[[str], bool]:
        """
        Create a version-based filter function.

        Args:
            min_version: Minimum version (inclusive)
            max_version: Maximum version (inclusive)

        Returns:
            Filter function that returns True if model meets version requirements
        """

        def filter_fn(model_name: str) -> bool:
            version_info = ModelFilter.extract_version(model_name)
            if version_info is None:
                return False

            version, _ = version_info

            if min_version is not None and version < min_version:
                return False
            if max_version is not None and version > max_version:
                return False

            return True

        return filter_fn

    @staticmethod
    def substring_filter(substring: str) -> Callable[[str], bool]:
        """
        Create a simple substring filter function.

        Args:
            substring: The substring to search for

        Returns:
            Filter function that returns True if substring is in model name
        """

        def filter_fn(model_name: str) -> bool:
            return substring in model_name

        return filter_fn

    @staticmethod
    def no_slash_filter() -> Callable[[str], bool]:
        """
        Create a filter that excludes model names containing "/".

        Returns:
            Filter function that returns True if model name has no "/"
        """

        def filter_fn(model_name: str) -> bool:
            return "/" not in model_name

        return filter_fn

    @staticmethod
    def azure_path_filter() -> Callable[[str], bool]:
        """
        Create a filter for Azure models that excludes models with extra path segments.
        Excludes models like "azure/low/gpt-4" but allows "azure/gpt-4".

        Returns:
            Filter function that returns True if model doesn't have extra path segments
        """

        def filter_fn(model_name: str) -> bool:
            # If model starts with "azure/", check if there's another "/" after it
            if model_name.startswith("azure/"):
                # Count slashes - should only have one (the "azure/" prefix)
                return model_name.count("/") == 1
            # For non-azure models, allow them through
            return True

        return filter_fn

    @staticmethod
    def no_image_filter() -> Callable[[str], bool]:
        """
        Create a filter that excludes model names containing "image".

        Returns:
            Filter function that returns True if model name doesn't contain "image"
        """

        def filter_fn(model_name: str) -> bool:
            return "image" not in model_name.lower()

        return filter_fn

    @staticmethod
    def combined_filter(*filters: Callable[[str], bool]) -> Callable[[str], bool]:
        """
        Combine multiple filter functions with AND logic.

        Args:
            *filters: Variable number of filter functions

        Returns:
            Filter function that returns True if all filters pass
        """

        def filter_fn(model_name: str) -> bool:
            return all(f(model_name) for f in filters)

        return filter_fn


class LiteLLMService:
    """
    Service wrapper for LiteLLM to handle model validation, cost calculation,
    and metadata retrieval.
    """

    @staticmethod
    def validate_model(model_name: str) -> bool:
        """
        Check if a model is supported by LiteLLM.

        Args:
            model_name: The model identifier (e.g., "gpt-4o", "claude-3-opus-20240229")

        Returns:
            True if the model is known/supported, False otherwise.
        """
        try:
            litellm.get_model_info(model_name)
            return True
        except Exception:
            return False

    @staticmethod
    def get_model_info(model_name: str) -> ModelInfo:
        """
        Get metadata for a specific model (context window, max tokens, etc).

        Args:
            model_name: The model identifier

        Returns:
            Dictionary containing model metadata (max_tokens, input_cost_per_token, etc.)
        """
        try:
            info = litellm.get_model_info(model_name)
            return info
        except Exception as e:
            logger.warning(f"Failed to get info for model {model_name}: {e}")
            raise ErrCode.MODEL_NOT_AVAILABLE.with_messages(str(e))

    @staticmethod
    def get_context_window(model_name: str) -> int | None:
        """
        Get the context window size (max input tokens) for a model.
        Returns a default of 4096 if unknown.
        """
        info = LiteLLMService.get_model_info(model_name)
        return info.get("max_tokens")

    @staticmethod
    def list_supported_models() -> list[str]:
        """
        Get a list of all models supported by LiteLLM (based on cost map).
        """
        model_cost = litellm.model_cost.keys()
        return list(cast(str, model_cost))

    @staticmethod
    def _get_provider_filter(provider_type: str) -> Callable[[str], bool]:
        """
        Get the appropriate filter function for a provider type.

        Args:
            provider_type: The provider type (e.g., 'openai', 'azure_openai', 'google')

        Returns:
            Filter function for the provider
        """
        filter_rules = {
            "openai": ModelFilter.combined_filter(
                ModelFilter.substring_filter("gpt"),
                ModelFilter.version_filter(min_version=5),
                ModelFilter.no_slash_filter(),
                ModelFilter.no_image_filter(),
            ),
            "azure_openai": ModelFilter.combined_filter(
                ModelFilter.substring_filter("gpt"),
                ModelFilter.version_filter(min_version=5, max_version=6),
                ModelFilter.azure_path_filter(),
                ModelFilter.no_image_filter(),
            ),
            "google": ModelFilter.combined_filter(
                ModelFilter.substring_filter("gemini"),
                ModelFilter.version_filter(min_version=2.5),
                ModelFilter.no_slash_filter(),
                ModelFilter.no_image_filter(),
            ),
            "google_vertex": ModelFilter.combined_filter(
                ModelFilter.substring_filter("gemini"),
                ModelFilter.version_filter(min_version=2.5),
                ModelFilter.no_slash_filter(),
                ModelFilter.no_image_filter(),
            ),
        }

        # Return the filter or a default that accepts all
        return filter_rules.get(provider_type, lambda _: True)

    @staticmethod
    def get_models_by_provider(provider_type: str) -> list[ModelInfo]:
        """
        Get all models for a specific provider type with their metadata.

        Args:
            provider_type: The provider type (e.g., 'openai', 'azure_openai', 'google')

        Returns:
            List of ModelInfo objects with model metadata
        """
        models: list[ModelInfo] = []
        logger.debug(f"Provider type: {provider_type}")

        provider_type_mapping = {
            "openai": "openai",
            "azure_openai": "azure",
            "google": "google",
            "google_vertex": "vertex_ai",
        }

        litellm_provider_type = provider_type_mapping.get(provider_type)

        if litellm_provider_type and litellm_provider_type in LITELLM_CHAT_PROVIDERS:
            # Get the filter function for this provider
            filter_fn = LiteLLMService._get_provider_filter(provider_type)

            # The models_by_provider is partially typed
            model_names: list[str] = list(litellm.models_by_provider[litellm_provider_type])  # type: ignore

            # Apply the filter function
            filtered_model_names = [model_name for model_name in model_names if filter_fn(model_name)]

            for model_name in filtered_model_names:
                model_data: dict[str, Any] = dict(litellm.model_cost[model_name])  # type: ignore
                model_data["key"] = model_name  # Add the key field
                # Add supported_openai_params if missing (required by ModelInfo)
                if "supported_openai_params" not in model_data:
                    model_data["supported_openai_params"] = None
                models.append(cast(ModelInfo, model_data))

        logger.debug(f"Filtered {len(models)} models for provider {provider_type}")

        return models

    @staticmethod
    def get_all_providers_with_models() -> dict[str, list[ModelInfo]]:
        """
        Get all provider types with their available models.

        Returns:
            Dictionary mapping provider type to list of ModelInfo
        """
        provider_types = ["openai", "azure_openai", "google", "google_vertex"]
        result: dict[str, list[ModelInfo]] = {}

        for provider_type in provider_types:
            models = LiteLLMService.get_models_by_provider(provider_type)
            if models:
                result[provider_type] = models

        return result
