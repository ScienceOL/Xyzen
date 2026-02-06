"""
Component Module - Base class for reusable agent components.

Provides ExecutableComponent, the single base class for all agent components
that can be registered in the ComponentRegistry and referenced in GraphConfig
as "component" nodes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field, ValidationError

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool
    from langgraph.graph.state import CompiledStateGraph

    from app.agents.types import LLMFactory


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


class ExecutableComponent(ABC):
    """
    Base class for all reusable agent components.

    Components are subgraphs that can be:
    - Referenced in GraphConfig as "component" nodes
    - Composed into larger workflows
    - Filtered by tool capabilities
    - Versioned with SemVer constraints

    Subclasses must implement:
    - metadata (property): Return ComponentMetadata describing the component
    - build_graph(): Build and return a CompiledStateGraph

    Example:
        class MyComponent(ExecutableComponent):
            @property
            def metadata(self) -> ComponentMetadata:
                return ComponentMetadata(
                    key="my_component",
                    name="My Component",
                    component_type=ComponentType.SUBGRAPH,
                    ...
                )

            async def build_graph(self, llm_factory, tools, config):
                # Build and return a compiled StateGraph
                ...
    """

    @property
    @abstractmethod
    def metadata(self) -> ComponentMetadata:
        """Return component metadata."""
        ...

    @property
    def config_schema(self) -> type[BaseModel] | None:
        """
        Pydantic model for component configuration (optional).

        Override to define a schema for runtime configuration options.
        The schema is used for validation and documentation.

        Returns:
            Pydantic model class or None if no configuration is needed
        """
        return None

    @abstractmethod
    async def build_graph(
        self,
        llm_factory: "LLMFactory",
        tools: list["BaseTool"],
        config: dict[str, Any] | None = None,
    ) -> "CompiledStateGraph":
        """
        Build the component's executable graph.

        This method constructs a LangGraph workflow that can be invoked
        as part of a larger agent or standalone.

        Note: This is async to allow creating the LLM before graph compilation,
        which is required for LangGraph to properly intercept and stream tokens.

        Args:
            llm_factory: Factory to create LLM instances with optional overrides.
                        Usage: llm = await llm_factory(model="gpt-4", temperature=0.7)
            tools: Tools filtered by required_capabilities from metadata.
                   Only tools that match the component's declared capabilities
                   are passed in.
            config: Runtime configuration overrides. Values are validated
                   against config_schema if provided.

        Returns:
            Compiled StateGraph ready for execution
        """
        ...

    def export_config(self) -> dict[str, Any]:
        """
        Export component as JSON-serializable configuration.

        Returns a canonical component node config that can be used in
        GraphConfig to reference this component.
        """
        return {
            "kind": "component",
            "config": {
                "component_ref": {
                    "key": self.metadata.key,
                    "version": self.metadata.version,
                },
                "config_overrides": {},
            },
            "metadata": {
                "name": self.metadata.name,
                "description": self.metadata.description,
                "required_capabilities": self.metadata.required_capabilities,
            },
        }

    def validate_config_overrides(self, config_overrides: dict[str, Any] | None) -> dict[str, Any]:
        """
        Validate runtime config_overrides against the component contract.

        Contract order:
        1) If config_schema (Pydantic) is defined, use strict model validation.
        2) Else if metadata.config_schema_json exists, enforce required/allowed keys.
        3) Else accept raw overrides.
        """
        raw = config_overrides or {}
        if not isinstance(raw, dict):
            raise ValueError(
                f"Component '{self.metadata.key}' config_overrides must be an object, got {type(raw).__name__}."
            )

        schema_model = self.config_schema
        if schema_model is not None:
            try:
                validated = schema_model.model_validate(raw)
            except ValidationError as exc:
                raise ValueError(f"Invalid config_overrides for component '{self.metadata.key}': {exc}") from exc
            return validated.model_dump(exclude_none=True)

        schema_json = self.metadata.config_schema_json
        if not isinstance(schema_json, dict):
            return raw

        required_raw = schema_json.get("required", [])
        required_keys = [k for k in required_raw if isinstance(k, str)] if isinstance(required_raw, list) else []
        missing_required = [k for k in required_keys if k not in raw]
        if missing_required:
            raise ValueError(
                f"Invalid config_overrides for component '{self.metadata.key}': missing required keys "
                f"{sorted(missing_required)}."
            )

        properties = schema_json.get("properties", {})
        allow_additional = bool(schema_json.get("additionalProperties", False))
        if isinstance(properties, dict) and not allow_additional:
            allowed = {k for k in properties if isinstance(k, str)}
            unknown = sorted([k for k in raw if k not in allowed])
            if unknown:
                raise ValueError(
                    f"Invalid config_overrides for component '{self.metadata.key}': unknown keys {unknown}. "
                    f"Allowed keys: {sorted(allowed)}."
                )

        return raw

    def validate(self) -> list[str]:
        """Validate component configuration. Returns list of errors (empty if valid)."""
        errors: list[str] = []
        if not self.metadata.key:
            errors.append("Component key is required")
        if not isinstance(self.metadata.required_capabilities, list):
            errors.append("required_capabilities must be a list")
        return errors

    def get_example_usage(self) -> str | None:
        """Return an example of how to use this component."""
        return None


# Backward compatibility alias
BaseComponent = ExecutableComponent

__all__ = [
    "ComponentType",
    "ComponentMetadata",
    "ExecutableComponent",
    "BaseComponent",
]
