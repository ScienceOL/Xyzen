"""
Configuration manager for LLM providers.
Loads and serves model capabilities and configurations from the central config file.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from schemas.provider import ProviderType

from .config import config as raw_config


class ModelConfig(BaseModel):
    """Configuration and capabilities for a specific model."""

    model_name: str
    litellm_provider: str

    # Token limits
    max_input_tokens: Optional[int] = None
    max_output_tokens: Optional[int] = None
    max_tokens: Optional[int] = None

    # Capabilities
    supports_function_calling: bool = False
    supports_parallel_function_calling: bool = False
    supports_tool_choice: bool = False
    supports_vision: bool = False
    supports_audio_input: bool = False
    supports_audio_output: bool = False
    supports_video_input: bool = False
    supports_pdf_input: bool = False
    supports_system_messages: bool = True
    supports_response_schema: bool = False
    supports_prompt_caching: bool = False
    supports_reasoning: bool = False
    supports_native_streaming: bool = False

    # Costs (optional, useful for logging/tracking)
    input_cost_per_token: Optional[float] = None
    output_cost_per_token: Optional[float] = None

    class Config:
        """Allow extra fields present in the raw config."""

        extra = "ignore"


class ModelConfigManager:
    """Manager for retrieving model configurations."""

    _config: Dict[str, List[Dict[str, Any]]] = raw_config

    # Mapping from internal ProviderType to config.py keys
    _provider_mapping: Dict[str, str] = {
        ProviderType.OPENAI.value: "openai",
        ProviderType.AZURE_OPENAI.value: "openai-azure",
        ProviderType.GOOGLE.value: "google",
        ProviderType.GOOGLE_VERTEX.value: "google-vertex",
        ProviderType.ANTHROPIC.value: "anthropic",
    }

    @classmethod
    def get_model_config(cls, provider_type: str, model_name: str) -> Optional[ModelConfig]:
        """
        Get configuration for a specific model.

        Args:
            provider_type: The provider type (e.g. 'openai', 'google')
            model_name: The name of the model

        Returns:
            ModelConfig object if found, None otherwise
        """
        config_key = cls._provider_mapping.get(provider_type)
        if not config_key:
            return None

        models_list = cls._config.get(config_key, [])

        for model_data in models_list:
            # Check for exact match
            config_model_name = model_data.get("model_name", "")
            if config_model_name == model_name:
                return ModelConfig(**model_data)

            # Handle cases where config has 'provider/model' but request is 'model'
            if "/" in config_model_name:
                _, short_name = config_model_name.split("/", 1)
                if short_name == model_name:
                    return ModelConfig(**model_data)

        return None

    @classmethod
    def get_supported_models(cls, provider_type: str) -> List[Any]:
        """
        Get list of supported model names for a provider.

        Args:
            provider_type: The provider type

        Returns:
            List of model names
        """
        config_key = cls._provider_mapping.get(provider_type)
        if not config_key:
            return []

        models_list = cls._config.get(config_key, [])
        result = [m.get("model_name") for m in models_list if "model_name" in m]
        return result
