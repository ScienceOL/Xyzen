"""
Base System Agent - Abstract base class for Python-coded system agents.

System agents are complex, Python-implemented agents that:
- Provide sophisticated workflows (e.g., DeepResearch, CodeAnalysis)
- Export their graph config as JSON for user forking
- Register reusable components to the component registry
- Are available to all users as built-in capabilities
"""

from __future__ import annotations

from abc import abstractmethod
from typing import TYPE_CHECKING, Any, ClassVar

from app.agents.base_graph_agent import BaseBuiltinGraphAgent
from app.agents.components import BaseComponent

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

    from app.schemas.graph_config import GraphConfig as GraphConfigV1
    from app.schemas.graph_config_v2 import GraphConfig as GraphConfigV2

    # Union type for both v1 and v2 configs
    GraphConfigType = GraphConfigV1 | GraphConfigV2


class BaseSystemAgent(BaseBuiltinGraphAgent):
    """
    Abstract base class for Python-coded system agents.

    System agents are sophisticated, pre-built agents that provide complex
    workflows beyond what simple JSON configuration can achieve. They:

    1. Are implemented in Python for maximum flexibility
    2. Export their workflow as JSON for users to fork and customize
    3. Register reusable components (nodes, prompts, schemas) to the registry
    4. Are available as built-in capabilities to all users

    Subclasses must:
    - Define SYSTEM_KEY class variable (e.g., "deep_research")
    - Implement build_graph() to construct the workflow
    - Implement export_graph_config() to export JSON representation
    - Implement get_exported_components() to list reusable components

    Example:
        class DeepResearchAgent(BaseSystemAgent):
            SYSTEM_KEY = "deep_research"

            def build_graph(self):
                # Build LangGraph workflow
                ...

            def export_graph_config(self):
                # Export as GraphConfig
                ...
    """

    # Class-level system agent key (must be unique)
    SYSTEM_KEY: ClassVar[str] = ""

    # Runtime dependencies (injected when instantiated)
    llm: "BaseChatModel | None" = None
    tools: list["BaseTool"] | None = None

    def __init_subclass__(cls, **kwargs: Any) -> None:
        """Auto-register system agents when subclass is defined."""
        super().__init_subclass__(**kwargs)

        # Only register if SYSTEM_KEY is defined and non-empty
        if hasattr(cls, "SYSTEM_KEY") and cls.SYSTEM_KEY:
            # Defer registration to avoid circular imports
            # Registration happens in __init__.py
            pass

    def __init__(
        self,
        name: str = "",
        description: str = "",
        version: str = "1.0.0",
        capabilities: list[str] | None = None,
        tags: list[str] | None = None,
        author: str | None = "Xyzen",
        license_: str | None = "MIT",
    ) -> None:
        """
        Initialize the system agent.

        Args:
            name: Human-readable name
            description: Description of agent capabilities
            version: Semantic version string
            capabilities: List of capability strings
            tags: Tags for categorization
            author: Agent author
            license_: License identifier
        """
        super().__init__(
            name=name,
            description=description,
            version=version,
            capabilities=capabilities,
            tags=tags,
            author=author,
            license_=license_,
        )

    def configure(
        self,
        llm: "BaseChatModel | None" = None,
        tools: list["BaseTool"] | None = None,
    ) -> "BaseSystemAgent":
        """
        Configure runtime dependencies.

        This method allows injecting LLM and tools at runtime,
        enabling the same agent class to work with different providers.

        Args:
            llm: LangChain LLM to use
            tools: List of tools available to the agent

        Returns:
            Self for method chaining
        """
        self.llm = llm
        self.tools = tools or []
        return self

    @abstractmethod
    def export_graph_config(self) -> "GraphConfigType":
        """
        Export the agent's workflow as a JSON GraphConfig.

        This allows users to:
        1. View the agent's workflow structure
        2. Fork and customize the agent
        3. Learn from the implementation

        Returns:
            GraphConfig (v1 or v2) representing this agent's workflow
        """
        ...

    @abstractmethod
    def get_exported_components(self) -> list[BaseComponent]:
        """
        Return list of reusable components this agent provides.

        Components are automatically registered to the global registry
        and can be used in user-defined agents.

        Returns:
            List of components to export
        """
        ...

    def get_forkable_config(self) -> dict[str, Any]:
        """
        Get configuration for creating a user-customized fork.

        Returns a complete Agent creation payload that can be customized
        by users and saved as their own agent.

        Returns:
            Dictionary suitable for AgentCreate
        """
        graph_config = self.export_graph_config()
        graph_config_dict = graph_config.model_dump()

        # Add system_agent_key to metadata for fallback behavior
        if "metadata" not in graph_config_dict:
            graph_config_dict["metadata"] = {}
        graph_config_dict["metadata"]["system_agent_key"] = self.SYSTEM_KEY

        return {
            "name": f"{self.name} (Custom)",
            "description": self.description,
            "graph_config": graph_config_dict,
            "tags": list(self.tags) + ["forked", f"from:{self.SYSTEM_KEY}"],
            "model": None,  # Inherit from user settings
            "prompt": None,  # Uses graph_config prompts
        }

    def register_components(self) -> None:
        """
        Register this agent's components to the global registry.

        Called automatically during system initialization.
        """
        from app.agents.components import component_registry

        for component in self.get_exported_components():
            try:
                component_registry.register(component, override=True)
            except Exception as e:
                import logging

                logging.getLogger(__name__).warning(f"Failed to register component {component.metadata.key}: {e}")

    def get_system_key(self) -> str:
        """Get the system key for this agent."""
        return self.SYSTEM_KEY

    def is_configured(self) -> bool:
        """Check if runtime dependencies are configured."""
        return self.llm is not None


# Export
__all__ = ["BaseSystemAgent"]
