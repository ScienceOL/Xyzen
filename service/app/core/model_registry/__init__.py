"""Model registry module.

Provides services for model information and capabilities:
- ModelsDevService: Fetches model data from models.dev API (primary service)
- ModelFilter: Utilities for filtering model lists
- ProviderFilterConfig: Config-based filter for provider models
- CustomModelConfig: Config for custom models not in models.dev
- ModelInfo: Custom model information type
"""

from .filter import ModelFilter, ProviderFilterConfig, PROVIDER_FILTERS
from .service import ModelsDevService, CustomModelConfig, CUSTOM_MODELS
from .types import (
    ModelInfo,
    ModelsDevInterleaved,
    ModelsDevModalities,
    ModelsDevModel,
    ModelsDevModelCost,
    ModelsDevModelLimit,
    ModelsDevProvider,
    ModelsDevResponse,
)

__all__ = [
    # Primary service
    "ModelsDevService",
    # Model info type
    "ModelInfo",
    # Filter utilities
    "ModelFilter",
    "ProviderFilterConfig",
    "PROVIDER_FILTERS",
    # Custom models
    "CustomModelConfig",
    "CUSTOM_MODELS",
    # models.dev types
    "ModelsDevModel",
    "ModelsDevModelCost",
    "ModelsDevModelLimit",
    "ModelsDevModalities",
    "ModelsDevProvider",
    "ModelsDevResponse",
    "ModelsDevInterleaved",
]
