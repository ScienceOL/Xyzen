import logging
import re
from typing import Any, Callable, cast

import litellm
from litellm.constants import LITELLM_CHAT_PROVIDERS
from litellm.types.utils import ModelInfo

from app.common.code.error_code import ErrCode

logger = logging.getLogger(__name__)

# Manually configured model list for GPUGeek provider
# Add models in the format "Vendor/Model-Name" (e.g., "Vendor2/Gemini-2.5-Flash")
GPUGEEK_MODELS: list[str] = [
    # Add your GPUGeek models here
    # Example: "Vendor2/Gemini-2.5-Flash",
    # "Vendor2/Gemini-2.5-Pro",
    # "Vendor2/Gemini-2.5-Flash",
    # "Vendor2/Gemini-2.5-Flash-Image",
    # "Vendor2/Gemini-3-Pro",
    # "Vendor2/Gemini-3-Flash",
    # "Vendor2/Gemini-3-Pro-Image",
    "Vendor2/Claude-3.7-Sonnet",
    "Vendor2/Claude-4-Sonnet",
    "Vendor2/Claude-4.5-Opus",
    "Vendor2/Claude-4.5-Sonnet",
    # "Vendor2/GPT-5.2",
    # "Vendor2/GPT-5.1",
    # "Vendor2/GPT-5",
    # "OpenAI/Azure-GPT-5.1",
    # "OpenAI/Azure-GPT-5.2",
    # "OpenAI/Azure-GPT-5",
    "DeepSeek/DeepSeek-V3-0324",
    "DeepSeek/DeepSeek-V3.1-0821",
    "DeepSeek/DeepSeek-R1-671B",
]


def _map_gpugeek_to_base_model(gpugeek_model: str) -> str | None:
    """
    Map GPUGeek vendor-prefixed model names to their base model names for pricing lookup.

    Most model names can be used directly after normalization, except for DeepSeek models
    which require special mapping based on version patterns.

    Args:
        gpugeek_model: GPUGeek model name (e.g., "Vendor2/Gemini-2.5-Flash")

    Returns:
        Base model name for LiteLLM lookup, or None if no mapping exists

    Examples:
        "Vendor2/Gemini-2.5-Flash" -> "gemini-2.5-flash"
        "Vendor2/Claude-4.5-Sonnet" -> "claude-4.5-sonnet"
        "Vendor2/GPT-5.2" -> "gpt-5.2"
        "DeepSeek/DeepSeek-V3-0324" -> "deepseek-chat"
        "DeepSeek/DeepSeek-R1-671B" -> "deepseek-reasoner"
    """
    # Extract the model part after the vendor prefix
    if "/" not in gpugeek_model:
        return None

    _, model_part = gpugeek_model.split("/", 1)
    model_lower = model_part.lower()

    # Special handling for DeepSeek models
    if "deepseek" in model_lower:
        if "v" in model_lower and any(c.isdigit() for c in model_lower.split("v")[1][:3]):
            return "deepseek-chat"
        if "r" in model_lower and any(c.isdigit() for c in model_lower.split("r")[1][:3]):
            return "deepseek-reasoner"
        return "deepseek-chat"

    # Special handling for Azure models
    # if "azure-" in model_lower:
    #     model_lower = model_lower.replace("azure-", "")

    # Special handling for Anthropic models
    if "gemini-3-flash" in model_lower:
        return "gemini-3-flash-preview"
    if "gemini-3-pro" in model_lower:
        return "gemini-3-pro-preview"
    if "claude-3.7-sonnet" in model_lower:
        return "anthropic.claude-3-7-sonnet-20250219-v1:0"
    if "claude-4-sonnet" in model_lower:
        return "anthropic.claude-sonnet-4-20250514-v1:0"
    if "claude-4.5-sonnet" in model_lower:
        return "anthropic.claude-sonnet-4-5-20250929-v1:0"
    if "claude-4.5-opus" in model_lower:
        return "anthropic.claude-opus-4-5-20251101-v1:0"

    return model_lower


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
    def no_substring_filter(substring: str) -> Callable[[str], bool]:
        """
        Create a filter that excludes model names containing a specific substring.

        Args:
            substring: The substring to exclude

        Returns:
            Filter function that returns True if substring is NOT in model name
        """

        def filter_fn(model_name: str) -> bool:
            return substring not in model_name

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
    def no_date_suffix_filter() -> Callable[[str], bool]:
        """
        Create a filter that excludes model names ending with a date-like suffix.
        Example: "gpt-4-0325", "claude-3-03-25"

        Returns:
            Filter function that returns True if no date suffix is found
        """

        def filter_fn(model_name: str) -> bool:
            # Matches suffixes like -03-25, -0325, 03-25, 0325 at the end
            return not re.search(r"[-]?\d{2}-?\d{2}$", model_name)

        return filter_fn

    @staticmethod
    def no_tts_filter() -> Callable[[str], bool]:
        """
        Create a filter that excludes model names containing "tts".

        Returns:
            Filter function that returns True if "tts" is not in the name
        """

        def filter_fn(model_name: str) -> bool:
            return "tts" not in model_name.lower()

        return filter_fn

    @staticmethod
    def no_expensive_azure_filter() -> Callable[[str], bool]:
        """
        Create a filter that excludes expensive Azure models like "azure/gpt-5.2-pro" or "azure/gpt-5-pro".

        Returns:
            Filter function that returns True if not an expensive Azure model
        """

        def filter_fn(model_name: str) -> bool:
            lower = model_name.lower()
            return "gpt-5.2-pro" not in lower and "gpt-5-pro" not in lower

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
        if "qwen" in model_name:
            converted_model_name = "dashscope/" + model_name
        else:
            converted_model_name = _map_gpugeek_to_base_model(model_name)
        if converted_model_name:
            model_name = converted_model_name
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
                ModelFilter.no_date_suffix_filter(),
                ModelFilter.no_tts_filter(),
                ModelFilter.substring_filter("gpt"),
                ModelFilter.version_filter(min_version=5),
                ModelFilter.no_slash_filter(),
            ),
            "azure_openai": ModelFilter.combined_filter(
                ModelFilter.no_date_suffix_filter(),
                ModelFilter.no_tts_filter(),
                ModelFilter.substring_filter("gpt"),
                ModelFilter.no_substring_filter("gpt-5-chat-latest"),
                ModelFilter.no_substring_filter("gpt-5.1-chat"),
                ModelFilter.version_filter(min_version=5, max_version=6),
                ModelFilter.azure_path_filter(),
                ModelFilter.no_expensive_azure_filter(),
            ),
            "google": ModelFilter.combined_filter(
                ModelFilter.no_date_suffix_filter(),
                ModelFilter.no_tts_filter(),
                ModelFilter.substring_filter("gemini"),
                ModelFilter.version_filter(min_version=2.5),
                ModelFilter.no_slash_filter(),
            ),
            "google_vertex": ModelFilter.combined_filter(
                ModelFilter.no_date_suffix_filter(),
                ModelFilter.no_tts_filter(),
                ModelFilter.substring_filter("gemini"),
                ModelFilter.version_filter(min_version=2.5),
                ModelFilter.no_slash_filter(),
            ),
            "qwen": ModelFilter.combined_filter(
                ModelFilter.no_date_suffix_filter(),
                ModelFilter.substring_filter("qwen"),
                ModelFilter.no_substring_filter("qwen-coder"),
                # ModelFilter.no_slash_filter(),
            ),
        }

        # Return the filter or a default that accepts all
        return filter_rules.get(provider_type, lambda _: True)

    @staticmethod
    def get_models_by_provider(provider_type: str) -> list[ModelInfo]:
        """
        Get all models for a specific provider type with their metadata.

        Args:
            provider_type: The provider type (e.g., 'openai', 'azure_openai', 'google', 'gpugeek')

        Returns:
            List of ModelInfo objects with model metadata
        """
        models: list[ModelInfo] = []
        logger.debug(f"Provider type: {provider_type}")

        # Handle GPUGeek provider with manual model list
        if provider_type == "gpugeek":
            for model_name in GPUGEEK_MODELS:
                # Try to get pricing from base model
                base_model = _map_gpugeek_to_base_model(model_name)

                # Default model info
                model_data: dict[str, Any] = {
                    "key": model_name,
                    "max_tokens": 4096,
                    "max_input_tokens": 128000,
                    "max_output_tokens": 4096,
                    "input_cost_per_token": 0.0,
                    "output_cost_per_token": 0.0,
                    "litellm_provider": "openai",
                    "mode": "chat",
                    "supports_function_calling": True,
                    "supports_parallel_function_calling": True,
                    "supports_vision": "image" in model_name.lower(),
                    "supported_openai_params": None,
                }

                # Try to get real pricing from LiteLLM if we have a base model mapping
                if base_model:
                    try:
                        base_info = litellm.model_cost.get(base_model)
                        if base_info:
                            # Update with real pricing data
                            model_data["input_cost_per_token"] = base_info.get("input_cost_per_token", 0.0)
                            model_data["output_cost_per_token"] = base_info.get("output_cost_per_token", 0.0)
                            model_data["max_tokens"] = base_info.get("max_tokens", 4096)
                            model_data["max_input_tokens"] = base_info.get("max_input_tokens", 128000)
                            model_data["max_output_tokens"] = base_info.get("max_output_tokens", 4096)
                            logger.debug(f"Mapped {model_name} -> {base_model} for pricing")
                    except Exception as e:
                        logger.warning(f"Failed to get pricing for {model_name} (base: {base_model}): {e}")

                models.append(cast(ModelInfo, model_data))
            logger.debug(f"Returning {len(models)} manually configured models for GPUGeek")
            return models

        provider_type_mapping = {
            "openai": "openai",
            "azure_openai": "azure",
            "google": "google",
            "google_vertex": "vertex_ai",
            "qwen": "dashscope",
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

                # Handle tiered pricing - extract the first tier as default pricing
                if "tiered_pricing" in model_data and isinstance(model_data.get("tiered_pricing"), list):
                    tiered = model_data["tiered_pricing"]
                    if tiered and len(tiered) > 0:
                        first_tier = tiered[0]
                        # Add flat pricing fields from first tier if not present
                        if "input_cost_per_token" not in model_data:
                            model_data["input_cost_per_token"] = first_tier.get("input_cost_per_token", 0.0)
                        if "output_cost_per_token" not in model_data:
                            model_data["output_cost_per_token"] = first_tier.get("output_cost_per_token", 0.0)

                # Ensure required pricing fields exist (fallback to 0.0 if not present)
                if "input_cost_per_token" not in model_data:
                    model_data["input_cost_per_token"] = 0.0
                if "output_cost_per_token" not in model_data:
                    model_data["output_cost_per_token"] = 0.0

                # Add supports_web_search for models that support built-in web search
                if provider_type in ["google", "google_vertex"] and "gemini" in model_name.lower():
                    # Gemini 2.0 and later support built-in web search
                    version_info = ModelFilter.extract_version(model_name)
                    if version_info and version_info[0] >= 2.0:
                        model_data["supports_web_search"] = True
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
        provider_types = ["openai", "azure_openai", "google", "google_vertex", "gpugeek", "qwen"]
        result: dict[str, list[ModelInfo]] = {}

        for provider_type in provider_types:
            models = LiteLLMService.get_models_by_provider(provider_type)
            if models:
                result[provider_type] = models

        return result
