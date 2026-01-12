"""
Base Component Module - Abstract base classes for reusable agent components.

This module defines the component abstraction that allows system agents
to export reusable pieces (nodes, subgraphs, state schemas, prompts)
that can be composed into user-defined agents.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ComponentType(StrEnum):
    """Types of reusable components."""

    NODE = "node"  # Reusable graph node
    SUBGRAPH = "subgraph"  # Complete subgraph that can be embedded
    STATE_SCHEMA = "state_schema"  # Reusable state field definitions
    PROMPT_TEMPLATE = "prompt_template"  # Reusable prompt template
    REDUCER = "reducer"  # Custom state reducer function


class ComponentMetadata(BaseModel):
    """Metadata describing a registered component."""

    key: str = Field(
        description="Unique identifier: 'namespace:agent:component' (e.g., 'system:deep_research:query_analyzer')"
    )
    name: str = Field(description="Human-readable name")
    description: str = Field(description="Detailed description of what this component does")
    component_type: ComponentType = Field(description="Type of component")
    version: str = Field(default="1.0.0", description="Semantic version")
    author: str = Field(default="Xyzen", description="Component author")
    tags: list[str] = Field(default_factory=list, description="Tags for discovery")

    # Schema information
    input_schema: dict[str, Any] | None = Field(default=None, description="JSON Schema for component inputs")
    output_schema: dict[str, Any] | None = Field(default=None, description="JSON Schema for component outputs")

    # Dependencies
    required_tools: list[str] = Field(default_factory=list, description="Tools required by this component")
    required_components: list[str] = Field(default_factory=list, description="Other components this depends on")


class BaseComponent(ABC):
    """
    Abstract base class for all reusable components.

    Components are building blocks that can be shared across agents.
    Each component provides:
    - Metadata for discovery and documentation
    - Export functionality for JSON serialization
    - Validation to ensure correct configuration
    """

    @property
    @abstractmethod
    def metadata(self) -> ComponentMetadata:
        """Return component metadata."""
        ...

    @abstractmethod
    def export_config(self) -> dict[str, Any]:
        """
        Export component as JSON-serializable configuration.

        The exported config can be used in GraphConfig to instantiate
        this component in a user-defined agent.

        Returns:
            Dictionary containing the component's configuration
        """
        ...

    def validate(self) -> list[str]:
        """
        Validate component configuration.

        Override this method to add custom validation logic.

        Returns:
            List of validation errors (empty if valid)
        """
        return []

    def get_example_usage(self) -> str | None:
        """
        Return an example of how to use this component.

        Override to provide usage examples for documentation.

        Returns:
            Example usage string or None
        """
        return None


class NodeComponent(BaseComponent):
    """Base class for reusable node components."""

    @property
    def component_type(self) -> ComponentType:
        return ComponentType.NODE


class SubgraphComponent(BaseComponent):
    """Base class for reusable subgraph components."""

    @property
    def component_type(self) -> ComponentType:
        return ComponentType.SUBGRAPH

    @abstractmethod
    def get_nodes(self) -> list[dict[str, Any]]:
        """Return the list of node configurations for this subgraph."""
        ...

    @abstractmethod
    def get_edges(self) -> list[dict[str, Any]]:
        """Return the list of edge configurations for this subgraph."""
        ...

    @abstractmethod
    def get_entry_point(self) -> str:
        """Return the entry point node ID for this subgraph."""
        ...

    @abstractmethod
    def get_exit_points(self) -> list[str]:
        """Return the exit point node IDs for this subgraph."""
        ...


class StateSchemaComponent(BaseComponent):
    """Base class for reusable state schema components."""

    @property
    def component_type(self) -> ComponentType:
        return ComponentType.STATE_SCHEMA

    @abstractmethod
    def get_fields(self) -> dict[str, dict[str, Any]]:
        """
        Return state field definitions.

        Returns:
            Dictionary mapping field names to StateFieldSchema configs
        """
        ...


class PromptTemplateComponent(BaseComponent):
    """Base class for reusable prompt template components."""

    @property
    def component_type(self) -> ComponentType:
        return ComponentType.PROMPT_TEMPLATE

    @abstractmethod
    def get_template(self) -> str:
        """Return the Jinja2 template string."""
        ...

    @abstractmethod
    def get_variables(self) -> list[str]:
        """Return list of variables expected by the template."""
        ...


# Export
__all__ = [
    "ComponentType",
    "ComponentMetadata",
    "BaseComponent",
    "NodeComponent",
    "SubgraphComponent",
    "StateSchemaComponent",
    "PromptTemplateComponent",
]
