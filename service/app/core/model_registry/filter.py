"""Model filtering utilities with config-based approach.

This module provides a scalable filtering system for model lists.
"""

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ProviderFilterConfig:
    """Configuration-based filter for a provider's models.

    This replaces the function-based filtering with a declarative config approach.
    """

    # Patterns that model name must contain (at least one)
    include_patterns: list[str] = field(default_factory=list)

    # Patterns that model name must NOT contain
    exclude_patterns: list[str] = field(default_factory=list)

    # Version constraints
    min_version: float | None = None
    max_version: float | None = None

    # Common filters
    no_date_suffix: bool = True
    no_tts: bool = True
    no_slash: bool = True

    # Azure-specific
    azure_path_check: bool = False
    no_expensive_azure: bool = False

    def matches(self, model_name: str) -> bool:
        """Check if a model name passes all filter rules."""
        lower_name = model_name.lower()

        # Check include patterns (at least one must match if specified)
        if self.include_patterns:
            if not any(p.lower() in lower_name for p in self.include_patterns):
                return False

        # Check exclude patterns (none must match)
        if self.exclude_patterns:
            if any(p.lower() in lower_name for p in self.exclude_patterns):
                return False

        # Version check
        if self.min_version is not None or self.max_version is not None:
            version = ModelFilter.extract_version(model_name)
            if version is None:
                return False
            ver_num = version[0]
            if self.min_version is not None and ver_num < self.min_version:
                return False
            if self.max_version is not None and ver_num > self.max_version:
                return False

        # Date suffix check
        if self.no_date_suffix:
            if re.search(r"[-]?\d{2}-?\d{2}$", model_name):
                return False

        # TTS check
        if self.no_tts and "tts" in lower_name:
            return False

        # Slash check
        if self.no_slash and "/" in model_name:
            # Azure path check is special - allow azure/model but not azure/x/model
            if self.azure_path_check and model_name.startswith("azure/"):
                if model_name.count("/") > 1:
                    return False
            elif "/" in model_name:
                return False

        # Expensive Azure check
        if self.no_expensive_azure:
            if "gpt-5.2-pro" in lower_name or "gpt-5-pro" in lower_name:
                return False

        return True


# Provider-specific filter configurations
PROVIDER_FILTERS: dict[str, ProviderFilterConfig] = {
    "openai": ProviderFilterConfig(
        include_patterns=["gpt"],
        min_version=5,
    ),
    "azure_openai": ProviderFilterConfig(
        include_patterns=["gpt"],
        exclude_patterns=["gpt-5-chat-latest", "gpt-5.1-chat"],
        min_version=5,
        max_version=6,
        no_slash=False,  # Azure uses azure/model format
        azure_path_check=True,
        no_expensive_azure=True,
    ),
    "google": ProviderFilterConfig(
        include_patterns=["gemini"],
        exclude_patterns=["live", "gemini-2.5-flash-image-preview"],
        min_version=2.5,
    ),
    "google_vertex": ProviderFilterConfig(
        include_patterns=["gemini"],
        exclude_patterns=["live", "gemini-2.5-flash-image-preview"],
        min_version=2.5,
    ),
    "qwen": ProviderFilterConfig(
        include_patterns=["qwen3"],
        exclude_patterns=["qwen3-coder", "asr", "live", "realtime"],
    ),
}


def get_provider_filter(provider_type: str) -> ProviderFilterConfig | None:
    """Get the filter config for a provider type."""
    return PROVIDER_FILTERS.get(provider_type)


class ModelFilter:
    """
    Utility class for model filtering operations.
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
    def filter_models(models: list[str], config: ProviderFilterConfig) -> list[str]:
        """Filter a list of model names using a config."""
        return [m for m in models if config.matches(m)]
