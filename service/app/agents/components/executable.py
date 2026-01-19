"""
Executable Component Module - Components that can be instantiated as runnable graphs.

This module provides the ExecutableComponent base class that extends BaseComponent
to add execution capability. Components can declare tool capabilities they require,
and the graph builder will inject only the relevant tools.
"""

from __future__ import annotations

from abc import abstractmethod
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

from app.agents.components.base import BaseComponent

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool
    from langgraph.graph.state import CompiledStateGraph

    from app.agents.types import LLMFactory


class ExecutableComponent(BaseComponent):
    """
    Component that can be instantiated as a runnable graph.

    This extends BaseComponent to add execution capability:
    - build_graph() returns a CompiledStateGraph
    - config_schema defines runtime configuration options
    - required_capabilities declares tool dependencies (via metadata)

    ExecutableComponents can be referenced in GraphConfig as "component" nodes,
    allowing reuse of complex workflows across different agents.

    Example:
        class MyComponent(ExecutableComponent):
            @property
            def metadata(self) -> ComponentMetadata:
                return ComponentMetadata(
                    key="system:my_agent:processor",
                    name="Processor",
                    component_type=ComponentType.SUBGRAPH,
                    required_capabilities=["web_search"],
                    ...
                )

            def build_graph(self, llm_factory, tools, config):
                # Build and return a compiled StateGraph
                ...
    """

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

        For ExecutableComponents, this returns a component node config
        that can be used in GraphConfig to reference this component.

        Returns:
            Dictionary containing the component reference configuration
        """
        return {
            "type": "component",
            "component_config": {
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

    def validate(self) -> list[str]:
        """
        Validate component configuration.

        Checks that required metadata fields are set and validates
        any additional component-specific requirements.

        Returns:
            List of validation errors (empty if valid)
        """
        errors = super().validate()

        # Validate metadata has key
        if not self.metadata.key:
            errors.append("Component key is required")

        # Validate required_capabilities is a list
        if not isinstance(self.metadata.required_capabilities, list):
            errors.append("required_capabilities must be a list")

        return errors


# Export
__all__ = ["ExecutableComponent"]
