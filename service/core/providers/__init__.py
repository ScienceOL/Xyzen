"""
LLM Providers Module.
Provides abstract base classes and concrete implementations for different LLM providers.
"""

from .config import ModelRegistry, ProviderType, config
from .factory import ChatModelFactory
from .manager import ProviderManager, get_user_provider_manager
from .startup import initialize_providers_on_startup

# TODO: Remove while refactoring agent
#
SYSTEM_USER_ID = "da2a8078-dd7c-4052-ad68-1209c3f647f1"
__all__ = [
    "ProviderManager",
    "ProviderType",
    "ChatModelFactory",
    "get_user_provider_manager",
    "initialize_providers_on_startup",
    "config",
    "ModelRegistry",
]
