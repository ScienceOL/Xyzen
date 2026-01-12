"""
System Agent Registry - Central registry for Python-coded system agents.

This module provides automatic discovery and registration of system agents.
System agents are pre-built, Python-implemented agents that provide
complex workflows like deep research, code analysis, etc.
"""

from __future__ import annotations

import importlib
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .base import BaseSystemAgent

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)


class SystemAgentRegistry:
    """
    Registry for system agents.

    This registry:
    - Automatically discovers system agents in subdirectories
    - Provides access to system agent classes and instances
    - Manages component registration from system agents
    """

    def __init__(self) -> None:
        self._agent_classes: dict[str, type[BaseSystemAgent]] = {}
        self._instances: dict[str, BaseSystemAgent] = {}
        self._initialized: bool = False

    def register_class(self, key: str, agent_class: type[BaseSystemAgent], override: bool = False) -> None:
        """
        Register a system agent class.

        Args:
            key: Unique system key (e.g., "deep_research")
            agent_class: The agent class to register
            override: If True, allow overwriting existing registration
        """
        if key in self._agent_classes and not override:
            raise ValueError(f"System agent '{key}' already registered")

        self._agent_classes[key] = agent_class
        logger.info(f"Registered system agent class: {key}")

    def get_class(self, key: str) -> type[BaseSystemAgent] | None:
        """Get a system agent class by key."""
        return self._agent_classes.get(key)

    def get_instance(
        self,
        key: str,
        llm: "BaseChatModel | None" = None,
        tools: list["BaseTool"] | None = None,
    ) -> BaseSystemAgent | None:
        """
        Get or create a system agent instance.

        If the instance doesn't exist, it will be created and configured
        with the provided LLM and tools.

        Args:
            key: System agent key
            llm: LLM to configure the agent with
            tools: Tools to make available to the agent

        Returns:
            Configured agent instance or None if not found
        """
        # Check if we have a cached, configured instance
        cache_key = f"{key}:{id(llm)}:{id(tools)}"
        if cache_key in self._instances:
            return self._instances[cache_key]

        # Get agent class
        agent_class = self._agent_classes.get(key)
        if not agent_class:
            logger.warning(f"System agent not found: {key}")
            return None

        # Create and configure instance
        try:
            instance = agent_class()
            instance.configure(llm=llm, tools=tools)
            self._instances[cache_key] = instance
            logger.debug(f"Created system agent instance: {key}")
            return instance
        except Exception as e:
            logger.error(f"Failed to create system agent '{key}': {e}")
            return None

    def list_keys(self) -> list[str]:
        """List all registered system agent keys."""
        return list(self._agent_classes.keys())

    def get_all_metadata(self) -> list[dict[str, Any]]:
        """
        Get metadata for all registered system agents.

        Returns:
            List of metadata dictionaries
        """
        result = []
        for key, agent_class in self._agent_classes.items():
            try:
                # Create temporary instance for metadata
                instance = agent_class()
                result.append(
                    {
                        "key": key,
                        "metadata": instance.get_metadata(),
                        "forkable": True,
                        "components": [c.metadata.model_dump() for c in instance.get_exported_components()],
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to get metadata for '{key}': {e}")
                result.append(
                    {
                        "key": key,
                        "metadata": {"name": key, "description": "Metadata unavailable"},
                        "forkable": False,
                        "error": str(e),
                    }
                )
        return result

    def initialize_components(self) -> None:
        """
        Initialize and register components from all system agents.

        This should be called during application startup to ensure
        all components are available in the component registry.
        """
        if self._initialized:
            return

        logger.info("Initializing system agent components...")

        for key, agent_class in self._agent_classes.items():
            try:
                instance = agent_class()
                instance.register_components()
                logger.debug(f"Registered components for: {key}")
            except Exception as e:
                logger.error(f"Failed to register components for '{key}': {e}")

        self._initialized = True
        logger.info(f"System agent components initialized ({len(self._agent_classes)} agents)")

    def discover_agents(self) -> None:
        """
        Discover and register system agents from subdirectories.

        Scans the system directory for Python packages containing
        agent implementations.
        """
        current_dir = Path(__file__).parent

        # Look for subdirectories with __init__.py
        for path in current_dir.iterdir():
            if path.is_dir() and not path.name.startswith("_"):
                init_file = path / "__init__.py"
                if init_file.exists():
                    self._try_import_agent(path.name)

    def _try_import_agent(self, module_name: str) -> None:
        """Attempt to import and register an agent from a module."""
        try:
            # Import the module
            module = importlib.import_module(f".{module_name}", package=__package__)

            # Look for BaseSystemAgent subclasses
            for attr_name in dir(module):
                attr = getattr(module, attr_name)

                # Check if it's a class that inherits from BaseSystemAgent
                if (
                    isinstance(attr, type)
                    and issubclass(attr, BaseSystemAgent)
                    and attr is not BaseSystemAgent
                    and hasattr(attr, "SYSTEM_KEY")
                    and attr.SYSTEM_KEY
                ):
                    self.register_class(attr.SYSTEM_KEY, attr, override=True)
                    logger.info(f"Discovered system agent: {attr.SYSTEM_KEY} from {module_name}")

        except Exception as e:
            logger.warning(f"Failed to import system agent from {module_name}: {e}")


# Global registry instance
system_agent_registry = SystemAgentRegistry()


def _initialize_registry() -> None:
    """Initialize the registry on module import."""
    system_agent_registry.discover_agents()


# Run discovery on import
_initialize_registry()


# Export
__all__ = [
    "BaseSystemAgent",
    "SystemAgentRegistry",
    "system_agent_registry",
]
