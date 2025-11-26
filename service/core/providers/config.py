from dataclasses import dataclass
from enum import StrEnum
from typing import NotRequired, TypedDict, cast

from langchain.chat_models import BaseChatModel

from schemas.provider import ProviderType


class ModelMode(StrEnum):
    """Enumeration of available model modes."""

    CHAT = "chat"
    EMBEDDING = "embedding"
    COMPLETION = "completion"


class Modality(StrEnum):
    """Enumeration of available modality types."""

    TEXT = "text"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"


class LiteLLMProvider(StrEnum):
    # Keep this since the config is copied from LiteLLM
    OPENAI = "openai"
    AZURE = "azure"
    GEMINI = "gemini"
    VERTEX_AI = "vertex_ai-language-models"


class RawModelConfig(TypedDict):
    # --- Core required fields ---
    model_name: str
    litellm_provider: LiteLLMProvider
    mode: ModelMode

    # --- Basic token limits (most have these, but some may be missing) ---
    max_tokens: NotRequired[int]
    max_input_tokens: NotRequired[int]
    max_output_tokens: NotRequired[int]

    # --- Basic cost fields ---
    input_cost_per_token: NotRequired[float]
    output_cost_per_token: NotRequired[float]
    cache_read_input_token_cost: NotRequired[float]

    # --- OpenAI/Azure specific cost fields ---
    cache_read_input_token_cost_flex: NotRequired[float]
    cache_read_input_token_cost_priority: NotRequired[float]
    input_cost_per_token_flex: NotRequired[float]
    input_cost_per_token_priority: NotRequired[float]
    input_cost_per_token_batches: NotRequired[float]
    output_cost_per_token_flex: NotRequired[float]
    output_cost_per_token_priority: NotRequired[float]
    output_cost_per_token_batches: NotRequired[float]

    # --- Google/Gemini specific fields ---
    input_cost_per_audio_token: NotRequired[float]
    input_cost_per_token_above_200k_tokens: NotRequired[float]
    output_cost_per_reasoning_token: NotRequired[float]
    output_cost_per_token_above_200k_tokens: NotRequired[float]
    cache_creation_input_token_cost_above_200k_tokens: NotRequired[float]
    cache_read_input_token_cost_above_200k_tokens: NotRequired[float]

    max_audio_length_hours: NotRequired[float]
    max_audio_per_prompt: NotRequired[int]
    max_images_per_prompt: NotRequired[int]
    max_videos_per_prompt: NotRequired[int]
    max_video_length: NotRequired[int]
    max_pdf_size_mb: NotRequired[int]

    # --- Rate limits and metadata ---
    rpm: NotRequired[int]  # Requests per minute
    tpm: NotRequired[int]  # Tokens per minute
    source: NotRequired[str]

    # --- Supported lists ---
    supported_endpoints: NotRequired[list[str]]
    supported_modalities: NotRequired[list[Modality]]
    supported_output_modalities: NotRequired[list[Modality]]

    # --- Feature flags (Booleans) ---
    supports_function_calling: NotRequired[bool]
    supports_parallel_function_calling: NotRequired[bool]
    supports_vision: NotRequired[bool]
    supports_audio_input: NotRequired[bool]
    supports_audio_output: NotRequired[bool]
    supports_video_input: NotRequired[bool]
    supports_pdf_input: NotRequired[bool]
    supports_prompt_caching: NotRequired[bool]
    supports_response_schema: NotRequired[bool]
    supports_system_messages: NotRequired[bool]
    supports_tool_choice: NotRequired[bool]
    supports_reasoning: NotRequired[bool]
    supports_native_streaming: NotRequired[bool]
    supports_service_tier: NotRequired[bool]
    supports_url_context: NotRequired[bool]
    supports_web_search: NotRequired[bool]


class ModelConfig(RawModelConfig):
    provider_type: ProviderType


@dataclass
class ModelInstance:
    llm: BaseChatModel
    config: ModelConfig


ModelRegistry = dict[ProviderType, list[RawModelConfig]]

config: ModelRegistry = {
    ProviderType.OPENAI: [
        {
            "model_name": "gpt-5-nano",
            "litellm_provider": LiteLLMProvider.OPENAI,
            "cache_read_input_token_cost": 5e-09,
            "cache_read_input_token_cost_flex": 2.5e-09,
            "input_cost_per_token": 5e-08,
            "input_cost_per_token_flex": 2.5e-08,
            "input_cost_per_token_priority": 2.0 / 5e-06,
            "max_input_tokens": 272000,
            "max_output_tokens": 128000,
            "max_tokens": 128000,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 4e-07,
            "output_cost_per_token_flex": 2e-07,
            "supported_endpoints": ["/v1/chat/completions", "/v1/batch", "/v1/responses"],
            "supported_modalities": [Modality.TEXT, Modality.IMAGE],
            "supported_output_modalities": [Modality.TEXT],
            "supports_function_calling": True,
            "supports_native_streaming": True,
            "supports_parallel_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_vision": True,
        },
        {
            "model_name": "gpt-4o-mini",
            "litellm_provider": LiteLLMProvider.OPENAI,
            "cache_read_input_token_cost": 7.5e-08,
            "cache_read_input_token_cost_priority": 1.25e-07,
            "input_cost_per_token": 1.5e-07,
            "input_cost_per_token_batches": 7.5e-08,
            "input_cost_per_token_priority": 2.5e-07,
            "max_input_tokens": 128000,
            "max_output_tokens": 16384,
            "max_tokens": 16384,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 6e-07,
            "output_cost_per_token_batches": 3e-07,
            "output_cost_per_token_priority": 1e-06,
            "supports_function_calling": True,
            "supports_parallel_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_service_tier": True,
            "supports_vision": True,
        },
        {
            "model_name": "o1-mini",
            "litellm_provider": LiteLLMProvider.OPENAI,
            "cache_read_input_token_cost": 5.5e-07,
            "input_cost_per_token": 1.1e-06,
            "max_input_tokens": 128000,
            "max_output_tokens": 65536,
            "max_tokens": 65536,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 4.4e-06,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_vision": True,
        },
        {
            "model_name": "gpt-5",
            "litellm_provider": LiteLLMProvider.OPENAI,
            "cache_read_input_token_cost": 1.25e-07,
            "cache_read_input_token_cost_flex": 6.25e-08,
            "cache_read_input_token_cost_priority": 2.5e-07,
            "input_cost_per_token": 1.25e-06,
            "input_cost_per_token_flex": 6.25e-07,
            "input_cost_per_token_priority": 2.5e-06,
            "max_input_tokens": 272000,
            "max_output_tokens": 128000,
            "max_tokens": 128000,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 1e-05,
            "output_cost_per_token_flex": 5e-06,
            "output_cost_per_token_priority": 2e-05,
            "supported_endpoints": ["/v1/chat/completions", "/v1/batch", "/v1/responses"],
            "supported_modalities": [Modality.TEXT, Modality.IMAGE],
            "supported_output_modalities": [Modality.TEXT],
            "supports_function_calling": True,
            "supports_native_streaming": True,
            "supports_parallel_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_service_tier": True,
            "supports_vision": True,
        },
        {
            "model_name": "gpt-4o",
            "litellm_provider": LiteLLMProvider.OPENAI,
            "cache_read_input_token_cost": 1.25e-06,
            "cache_read_input_token_cost_priority": 2.125e-06,
            "input_cost_per_token": 2.5e-06,
            "input_cost_per_token_batches": 1.25e-06,
            "input_cost_per_token_priority": 4.25e-06,
            "max_input_tokens": 128000,
            "max_output_tokens": 16384,
            "max_tokens": 16384,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 1e-05,
            "output_cost_per_token_batches": 5e-06,
            "output_cost_per_token_priority": 1.7e-05,
            "supports_function_calling": True,
            "supports_parallel_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_service_tier": True,
            "supports_vision": True,
        },
        {
            "model_name": "o1-preview",
            "litellm_provider": LiteLLMProvider.OPENAI,
            "cache_read_input_token_cost": 7.5e-06,
            "input_cost_per_token": 1.5e-05,
            "max_input_tokens": 128000,
            "max_output_tokens": 32768,
            "max_tokens": 32768,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 6e-05,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_vision": True,
        },
    ],
    ProviderType.AZURE_OPENAI: [
        {
            "model_name": "azure/gpt-4o-mini",
            "litellm_provider": LiteLLMProvider.AZURE,
            "cache_read_input_token_cost": 7.5e-08,
            "input_cost_per_token": 1.65e-07,
            "max_input_tokens": 128000,
            "max_output_tokens": 16384,
            "max_tokens": 16384,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 6.6e-07,
            "supports_function_calling": True,
            "supports_parallel_function_calling": True,
            "supports_prompt_caching": True,
            "supports_response_schema": True,
            "supports_tool_choice": True,
            "supports_vision": True,
        },
        {
            "model_name": "azure/gpt-5",
            "litellm_provider": LiteLLMProvider.AZURE,
            "cache_read_input_token_cost": 1.25e-07,
            "input_cost_per_token": 1.25e-06,
            "max_input_tokens": 272000,
            "max_output_tokens": 128000,
            "max_tokens": 128000,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 1e-05,
            "supported_endpoints": ["/v1/chat/completions", "/v1/batch", "/v1/responses"],
            "supported_modalities": [Modality.TEXT, Modality.IMAGE],
            "supported_output_modalities": [Modality.TEXT],
            "supports_function_calling": True,
            "supports_native_streaming": True,
            "supports_parallel_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_vision": True,
        },
        {
            "model_name": "azure/gpt-4o",
            "litellm_provider": LiteLLMProvider.AZURE,
            "cache_read_input_token_cost": 1.25e-06,
            "input_cost_per_token": 2.5e-06,
            "max_input_tokens": 128000,
            "max_output_tokens": 16384,
            "max_tokens": 16384,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 1e-05,
            "supports_function_calling": True,
            "supports_parallel_function_calling": True,
            "supports_prompt_caching": True,
            "supports_response_schema": True,
            "supports_tool_choice": True,
            "supports_vision": True,
        },
    ],
    ProviderType.GOOGLE: [
        {
            "model_name": "gemini/gemini-2.5-flash",
            "litellm_provider": LiteLLMProvider.GEMINI,
            "cache_read_input_token_cost": 3e-08,
            "input_cost_per_audio_token": 1e-06,
            "input_cost_per_token": 3e-07,
            "max_audio_length_hours": 8.4,
            "max_audio_per_prompt": 1,
            "max_images_per_prompt": 3000,
            "max_input_tokens": 1048576,
            "max_output_tokens": 65535,
            "max_pdf_size_mb": 30,
            "max_tokens": 65535,
            "max_video_length": 1,
            "max_videos_per_prompt": 10,
            "mode": ModelMode.CHAT,
            "output_cost_per_reasoning_token": 2.5e-06,
            "output_cost_per_token": 2.5e-06,
            "rpm": 100000,
            "source": "https://ai.google.dev/gemini-api/docs/models#gemini-2.5-flash-preview",
            "supported_endpoints": ["/v1/chat/completions", "/v1/completions", "/v1/batch"],
            "supported_modalities": [Modality.TEXT, Modality.IMAGE, Modality.VIDEO, Modality.AUDIO],
            "supported_output_modalities": [Modality.TEXT],
            "supports_audio_output": False,
            "supports_function_calling": True,
            "supports_parallel_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_url_context": True,
            "supports_vision": True,
            "supports_web_search": True,
            "tpm": 8000000,
        },
        {
            "model_name": "gemini/gemini-2.5-pro",
            "litellm_provider": LiteLLMProvider.GEMINI,
            "cache_read_input_token_cost": 3.125e-07,
            "input_cost_per_token": 1.25e-06,
            "input_cost_per_token_above_200k_tokens": 2.5e-06,
            "max_audio_length_hours": 8.4,
            "max_audio_per_prompt": 1,
            "max_images_per_prompt": 3000,
            "max_input_tokens": 1048576,
            "max_output_tokens": 65535,
            "max_pdf_size_mb": 30,
            "max_tokens": 65535,
            "max_video_length": 1,
            "max_videos_per_prompt": 10,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 1e-05,
            "output_cost_per_token_above_200k_tokens": 1.5e-05,
            "rpm": 2000,
            "source": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
            "supported_endpoints": ["/v1/chat/completions", "/v1/completions"],
            "supported_modalities": [Modality.TEXT, Modality.IMAGE, Modality.VIDEO, Modality.AUDIO],
            "supported_output_modalities": [Modality.TEXT],
            "supports_audio_input": True,
            "supports_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_video_input": True,
            "supports_vision": True,
            "supports_web_search": True,
            "tpm": 800000,
        },
        {
            "model_name": "gemini/gemini-3-pro-preview",
            "litellm_provider": LiteLLMProvider.GEMINI,
            "cache_read_input_token_cost": 2e-07,
            "cache_read_input_token_cost_above_200k_tokens": 4e-07,
            "input_cost_per_token": 2e-06,
            "input_cost_per_token_above_200k_tokens": 4e-06,
            "input_cost_per_token_batches": 1e-06,
            "max_audio_length_hours": 8.4,
            "max_audio_per_prompt": 1,
            "max_images_per_prompt": 3000,
            "max_input_tokens": 1048576,
            "max_output_tokens": 65535,
            "max_pdf_size_mb": 30,
            "max_tokens": 65535,
            "max_video_length": 1,
            "max_videos_per_prompt": 10,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 1.2e-05,
            "output_cost_per_token_above_200k_tokens": 1.8e-05,
            "output_cost_per_token_batches": 6e-06,
            "rpm": 2000,
            "source": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
            "supported_endpoints": ["/v1/chat/completions", "/v1/completions", "/v1/batch"],
            "supported_modalities": [Modality.TEXT, Modality.IMAGE, Modality.VIDEO, Modality.AUDIO],
            "supported_output_modalities": [Modality.TEXT],
            "supports_audio_input": True,
            "supports_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_video_input": True,
            "supports_vision": True,
            "supports_web_search": True,
            "tpm": 800000,
        },
    ],
    ProviderType.GOOGLE_VERTEX: [
        {
            "model_name": "gemini-2.5-flash",
            "litellm_provider": LiteLLMProvider.VERTEX_AI,
            "cache_read_input_token_cost": 3e-08,
            "input_cost_per_audio_token": 1e-06,
            "input_cost_per_token": 3e-07,
            "max_audio_length_hours": 8.4,
            "max_audio_per_prompt": 1,
            "max_images_per_prompt": 3000,
            "max_input_tokens": 1048576,
            "max_output_tokens": 65535,
            "max_pdf_size_mb": 30,
            "max_tokens": 65535,
            "max_video_length": 1,
            "max_videos_per_prompt": 10,
            "mode": ModelMode.CHAT,
            "output_cost_per_reasoning_token": 2.5e-06,
            "output_cost_per_token": 2.5e-06,
            "source": "https://ai.google.dev/gemini-api/docs/models#gemini-2.5-flash-preview",
            "supported_endpoints": ["/v1/chat/completions", "/v1/completions", "/v1/batch"],
            "supported_modalities": [Modality.TEXT, Modality.IMAGE, Modality.VIDEO, Modality.AUDIO],
            "supported_output_modalities": [Modality.TEXT],
            "supports_audio_output": False,
            "supports_function_calling": True,
            "supports_parallel_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_url_context": True,
            "supports_vision": True,
            "supports_web_search": True,
        },
        {
            "model_name": "gemini-2.5-pro",
            "litellm_provider": LiteLLMProvider.VERTEX_AI,
            "cache_read_input_token_cost": 1.25e-07,
            "cache_creation_input_token_cost_above_200k_tokens": 2.5e-07,
            "input_cost_per_token": 1.25e-06,
            "input_cost_per_token_above_200k_tokens": 2.5e-06,
            "max_audio_length_hours": 8.4,
            "max_audio_per_prompt": 1,
            "max_images_per_prompt": 3000,
            "max_input_tokens": 1048576,
            "max_output_tokens": 65535,
            "max_pdf_size_mb": 30,
            "max_tokens": 65535,
            "max_video_length": 1,
            "max_videos_per_prompt": 10,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 1e-05,
            "output_cost_per_token_above_200k_tokens": 1.5e-05,
            "source": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
            "supported_endpoints": ["/v1/chat/completions", "/v1/completions"],
            "supported_modalities": [Modality.TEXT, Modality.IMAGE, Modality.VIDEO, Modality.AUDIO],
            "supported_output_modalities": [Modality.TEXT],
            "supports_audio_input": True,
            "supports_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_video_input": True,
            "supports_vision": True,
            "supports_web_search": True,
        },
        {
            "model_name": "gemini-3-pro-preview",
            "litellm_provider": LiteLLMProvider.VERTEX_AI,
            "cache_read_input_token_cost": 2e-07,
            "cache_read_input_token_cost_above_200k_tokens": 4e-07,
            "cache_creation_input_token_cost_above_200k_tokens": 2.5e-07,
            "input_cost_per_token": 2e-06,
            "input_cost_per_token_above_200k_tokens": 4e-06,
            "input_cost_per_token_batches": 1e-06,
            "max_audio_length_hours": 8.4,
            "max_audio_per_prompt": 1,
            "max_images_per_prompt": 3000,
            "max_input_tokens": 1048576,
            "max_output_tokens": 65535,
            "max_pdf_size_mb": 30,
            "max_tokens": 65535,
            "max_video_length": 1,
            "max_videos_per_prompt": 10,
            "mode": ModelMode.CHAT,
            "output_cost_per_token": 1.2e-05,
            "output_cost_per_token_above_200k_tokens": 1.8e-05,
            "output_cost_per_token_batches": 6e-06,
            "source": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
            "supported_endpoints": ["/v1/chat/completions", "/v1/completions", "/v1/batch"],
            "supported_modalities": [Modality.TEXT, Modality.IMAGE, Modality.VIDEO, Modality.AUDIO],
            "supported_output_modalities": [Modality.TEXT],
            "supports_audio_input": True,
            "supports_function_calling": True,
            "supports_pdf_input": True,
            "supports_prompt_caching": True,
            "supports_reasoning": True,
            "supports_response_schema": True,
            "supports_system_messages": True,
            "supports_tool_choice": True,
            "supports_video_input": True,
            "supports_vision": True,
            "supports_web_search": True,
        },
    ],
}


class ModelConfigManager:
    def __init__(self, registry: ModelRegistry):
        self._raw_data = registry
        self._model_index: dict[str, ModelConfig] = {}
        self._build_indices()

    def _build_indices(self):
        """Build indices for faster query"""
        for provider_type, model_config_list in self._raw_data.items():
            for model_config in model_config_list:
                model_name = model_config["model_name"]
                enriched_model_config = cast(ModelConfig, model_config.copy())
                enriched_model_config["provider_type"] = provider_type
                self._model_index[model_name] = enriched_model_config

    def get_model_config(self, model_name: str) -> ModelConfig | None:
        return self._model_index.get(model_name)

    def list_models_by_provider(self, provider: str) -> list[RawModelConfig]:
        try:
            provider = ProviderType(provider)
        except ValueError:
            return []
        return self._raw_data.get(provider, [])

    def supports_feature(self, model_name: str, feature: str) -> bool:
        model = self.get_model_config(model_name)
        if not model:
            return False
        return model.get(feature, False)

    @property
    def all_model_names(self) -> list[str]:
        return list(self._model_index.keys())


config_manager = ModelConfigManager(config)
