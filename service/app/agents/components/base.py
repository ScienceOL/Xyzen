"""
Base Component Module - Abstract base classes for reusable agent components.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ComponentType(StrEnum):
    """Types of reusable components."""

    SUBGRAPH = "subgraph"  # Complete subgraph that can be embedded


class ComponentMetadata(BaseModel):
    """Metadata describing a registered component."""

    key: str = Field(description="Unique identifier")
    name: str = Field(description="Human-readable name")
    description: str = Field(description="Detailed description")
    component_type: ComponentType = Field(description="Type of component")
    version: str = Field(default="1.0.0")
    author: str = Field(default="Xyzen")
    tags: list[str] = Field(default_factory=list)
    input_schema: dict[str, Any] | None = Field(default=None)
    output_schema: dict[str, Any] | None = Field(default=None)
    required_tools: list[str] = Field(default_factory=list)
    required_components: list[str] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    config_schema_json: dict[str, Any] | None = Field(default=None)


class BaseComponent(ABC):
    """Abstract base class for all reusable components."""

    @property
    @abstractmethod
    def metadata(self) -> ComponentMetadata:
        """Return component metadata."""
        ...

    @abstractmethod
    def export_config(self) -> dict[str, Any]:
        """Export component as JSON-serializable configuration."""
        ...

    def validate(self) -> list[str]:
        """Validate component configuration."""
        return []

    def get_example_usage(self) -> str | None:
        """Return an example of how to use this component."""
        return None


__all__ = [
    "ComponentType",
    "ComponentMetadata",
    "BaseComponent",
]
