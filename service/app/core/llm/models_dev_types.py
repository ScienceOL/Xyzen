"""Type definitions for the models.dev API response.

This module defines Pydantic models for parsing and validating the JSON response
from https://models.dev/api.json, which provides comprehensive AI model metadata.
"""

from pydantic import BaseModel, Field


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
