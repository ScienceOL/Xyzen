"""
Component Registry - Central registry for reusable agent components.

This module provides the ComponentRegistry class that manages registration,
discovery, and retrieval of reusable components from system agents.
"""

from __future__ import annotations

import logging
from typing import Any

from .base import (
    BaseComponent,
    ComponentMetadata,
    ComponentType,
    NodeComponent,
    PromptTemplateComponent,
    StateSchemaComponent,
    SubgraphComponent,
)

logger = logging.getLogger(__name__)


class ComponentRegistry:
    """
    Registry for reusable agent components.

    This registry allows:
    - Registration of components from system agents
    - Discovery of components by type, tag, or key
    - Export of component configurations for use in user agents
    """

    def __init__(self) -> None:
        self._components: dict[str, BaseComponent] = {}
        self._by_type: dict[ComponentType, list[str]] = {t: [] for t in ComponentType}
        self._by_tag: dict[str, list[str]] = {}

    def register(self, component: BaseComponent, override: bool = False) -> None:
        """
        Register a component in the registry.

        Args:
            component: The component to register
            override: If True, allow overwriting existing components

        Raises:
            ValueError: If component key already exists and override is False
        """
        key = component.metadata.key

        if key in self._components and not override:
            raise ValueError(f"Component '{key}' already registered. Use override=True to replace.")

        # Validate component
        errors = component.validate()
        if errors:
            logger.warning(f"Component '{key}' has validation warnings: {errors}")

        # Register component
        self._components[key] = component

        # Index by type
        comp_type = component.metadata.component_type
        if key not in self._by_type[comp_type]:
            self._by_type[comp_type].append(key)

        # Index by tags
        for tag in component.metadata.tags:
            if tag not in self._by_tag:
                self._by_tag[tag] = []
            if key not in self._by_tag[tag]:
                self._by_tag[tag].append(key)

        logger.info(f"Registered component: {key} ({comp_type})")

    def unregister(self, key: str) -> bool:
        """
        Remove a component from the registry.

        Args:
            key: Component key to remove

        Returns:
            True if component was removed, False if not found
        """
        if key not in self._components:
            return False

        component = self._components[key]
        comp_type = component.metadata.component_type

        # Remove from indexes
        if key in self._by_type[comp_type]:
            self._by_type[comp_type].remove(key)

        for tag in component.metadata.tags:
            if tag in self._by_tag and key in self._by_tag[tag]:
                self._by_tag[tag].remove(key)

        # Remove from main registry
        del self._components[key]
        logger.info(f"Unregistered component: {key}")
        return True

    def get(self, key: str) -> BaseComponent | None:
        """
        Get a component by its key.

        Args:
            key: Component key (e.g., 'system:deep_research:query_analyzer')

        Returns:
            The component or None if not found
        """
        return self._components.get(key)

    def get_metadata(self, key: str) -> ComponentMetadata | None:
        """
        Get metadata for a component.

        Args:
            key: Component key

        Returns:
            Component metadata or None if not found
        """
        component = self._components.get(key)
        return component.metadata if component else None

    def get_config(self, key: str) -> dict[str, Any] | None:
        """
        Get the exported configuration for a component.

        Args:
            key: Component key

        Returns:
            Exported configuration dict or None if not found
        """
        component = self._components.get(key)
        return component.export_config() if component else None

    def list_all(self) -> list[str]:
        """List all registered component keys."""
        return list(self._components.keys())

    def list_metadata(self) -> list[ComponentMetadata]:
        """Get metadata for all registered components."""
        return [comp.metadata for comp in self._components.values()]

    def list_by_type(self, component_type: ComponentType) -> list[ComponentMetadata]:
        """
        List all components of a specific type.

        Args:
            component_type: Type to filter by

        Returns:
            List of component metadata
        """
        keys = self._by_type.get(component_type, [])
        return [self._components[k].metadata for k in keys if k in self._components]

    def list_by_tag(self, tag: str) -> list[ComponentMetadata]:
        """
        List all components with a specific tag.

        Args:
            tag: Tag to filter by

        Returns:
            List of component metadata
        """
        keys = self._by_tag.get(tag, [])
        return [self._components[k].metadata for k in keys if k in self._components]

    def search(
        self,
        query: str | None = None,
        component_type: ComponentType | None = None,
        tags: list[str] | None = None,
    ) -> list[ComponentMetadata]:
        """
        Search for components matching criteria.

        Args:
            query: Text to search in name/description
            component_type: Filter by type
            tags: Filter by tags (any match)

        Returns:
            List of matching component metadata
        """
        results: list[ComponentMetadata] = []

        for component in self._components.values():
            metadata = component.metadata

            # Filter by type
            if component_type and metadata.component_type != component_type:
                continue

            # Filter by tags
            if tags and not any(t in metadata.tags for t in tags):
                continue

            # Filter by query
            if query:
                query_lower = query.lower()
                if (
                    query_lower not in metadata.name.lower()
                    and query_lower not in metadata.description.lower()
                    and query_lower not in metadata.key.lower()
                ):
                    continue

            results.append(metadata)

        return results

    def export_all(self) -> dict[str, dict[str, Any]]:
        """
        Export all components as JSON-serializable configs.

        Returns:
            Dictionary mapping keys to exported configs
        """
        return {key: comp.export_config() for key, comp in self._components.items()}

    def get_stats(self) -> dict[str, Any]:
        """
        Get statistics about the registry.

        Returns:
            Dictionary with registry statistics
        """
        return {
            "total_components": len(self._components),
            "by_type": {t.value: len(keys) for t, keys in self._by_type.items()},
            "unique_tags": list(self._by_tag.keys()),
            "tag_counts": {tag: len(keys) for tag, keys in self._by_tag.items()},
        }


# Global registry instance
component_registry = ComponentRegistry()


# Convenience functions
def register_component(component: BaseComponent, override: bool = False) -> None:
    """Register a component in the global registry."""
    component_registry.register(component, override)


def get_component(key: str) -> BaseComponent | None:
    """Get a component from the global registry."""
    return component_registry.get(key)


def get_component_config(key: str) -> dict[str, Any] | None:
    """Get a component's exported config from the global registry."""
    return component_registry.get_config(key)


# Export
__all__ = [
    # Registry
    "ComponentRegistry",
    "component_registry",
    # Convenience functions
    "register_component",
    "get_component",
    "get_component_config",
    # Base classes (re-exported from base.py)
    "BaseComponent",
    "NodeComponent",
    "SubgraphComponent",
    "StateSchemaComponent",
    "PromptTemplateComponent",
    "ComponentType",
    "ComponentMetadata",
]
