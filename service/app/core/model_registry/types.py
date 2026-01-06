"""Type definitions for the models.dev API response and custom ModelInfo.

This module defines Pydantic models for parsing and validating the JSON response
from https://models.dev/api.json, which provides comprehensive AI model metadata.

It also defines our own ModelInfo schema to replace litellm's ModelInfo type.
"""

from pydantic import BaseModel, Field


class ModelInfo(BaseModel):
    """Custom ModelInfo schema based on models.dev structure.

    This replaces litellm.types.utils.ModelInfo with our own type
    that aligns with models.dev data structure.
    """

    key: str  # Model ID
    name: str | None = None
    max_tokens: int = 4096
    max_input_tokens: int = 4096
    max_output_tokens: int = 4096
    input_cost_per_token: float = 0.0
    output_cost_per_token: float = 0.0
    litellm_provider: str | None = None  # Keep for backward compat
    mode: str = "chat"
    supports_function_calling: bool = False
    supports_parallel_function_calling: bool = False
    supports_vision: bool = False
    supports_audio_input: bool = False
    supports_audio_output: bool = False
    supports_reasoning: bool = False
    supports_structured_output: bool = False
    supports_web_search: bool = False
    model_family: str | None = None
    knowledge_cutoff: str | None = None
    release_date: str | None = None
    open_weights: bool = False


class ModelsDevModelCost(BaseModel):
    """Pricing information for a model (costs per million tokens)."""

    input: float = 0.0
    output: float = 0.0
    cache_read: float | None = None


class ModelsDevModelLimit(BaseModel):
    """Token limits for a model."""

    context: int = 4096
    output: int = 4096


class ModelsDevModalities(BaseModel):
    """Input/output modalities supported by a model."""

    input: list[str] = Field(default_factory=lambda: ["text"])
    output: list[str] = Field(default_factory=lambda: ["text"])


class ModelsDevInterleaved(BaseModel):
    """Interleaved reasoning configuration."""

    field: str | None = None


class ModelsDevModel(BaseModel):
    """Individual model data from models.dev API."""

    id: str
    name: str
    family: str | None = None
    attachment: bool = False
    reasoning: bool = False
    tool_call: bool = False
    structured_output: bool = False
    temperature: bool = True
    knowledge: str | None = None
    release_date: str | None = None
    last_updated: str | None = None
    modalities: ModelsDevModalities | None = None
    open_weights: bool = False
    cost: ModelsDevModelCost | None = None
    limit: ModelsDevModelLimit | None = None
    # interleaved can be True or {"field": "reasoning_content"}
    interleaved: ModelsDevInterleaved | bool | None = None


class ModelsDevProvider(BaseModel):
    """Provider data from models.dev API."""

    id: str
    name: str
    env: list[str] = Field(default_factory=list)
    npm: str | None = None
    api: str | None = None
    doc: str | None = None
    models: dict[str, ModelsDevModel] = Field(default_factory=dict)


# Type alias for the full API response
ModelsDevResponse = dict[str, ModelsDevProvider]
