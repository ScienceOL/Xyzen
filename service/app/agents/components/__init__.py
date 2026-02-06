"""
Component Registry - Central registry for reusable agent components.

This module provides the ComponentRegistry class that manages registration,
discovery, and retrieval of reusable components.
"""

from __future__ import annotations

import logging

from .component import (
    BaseComponent,
    ComponentMetadata,
    ComponentType,
    ExecutableComponent,
)

logger = logging.getLogger(__name__)


class ComponentRegistry:
    """
    Registry for reusable agent components.

    Manages registration and resolution of ExecutableComponents
    that can be referenced in GraphConfig as "component" nodes.
    """

    def __init__(self) -> None:
        self._components: dict[str, ExecutableComponent] = {}

    def register(self, component: ExecutableComponent, override: bool = False) -> None:
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

        self._components[key] = component
        logger.info(f"Registered component: {key} ({component.metadata.component_type})")

    def get(self, key: str) -> ExecutableComponent | None:
        """Get a component by its key."""
        return self._components.get(key)

    def resolve(self, key: str, version_constraint: str = "*") -> ExecutableComponent | None:
        """
        Resolve a component by key with version matching.

        Args:
            key: Component key (e.g., 'deep_research:supervisor')
            version_constraint: SemVer constraint (e.g., '^2.0', '>=1.0.0', '*')

        Returns:
            Matching component or None if not found or version doesn't match
        """
        component = self._components.get(key)
        if not component:
            logger.debug(f"Component not found: {key}")
            return None

        if version_constraint == "*":
            return component

        # Check version compatibility using packaging library
        try:
            from packaging.specifiers import SpecifierSet
            from packaging.version import Version

            comp_version = Version(component.metadata.version)

            # Handle caret constraint (^X.Y.Z) - allow compatible versions
            if version_constraint.startswith("^"):
                base_version = version_constraint[1:]
                base = Version(base_version)
                # ^2.0 means >=2.0.0, <3.0.0
                next_major = f"{base.major + 1}.0.0"
                specifier = SpecifierSet(f">={base_version},<{next_major}")
            # Handle tilde constraint (~X.Y.Z) - allow patch updates
            elif version_constraint.startswith("~"):
                base_version = version_constraint[1:]
                base = Version(base_version)
                # ~2.0.1 means >=2.0.1, <2.1.0
                next_minor = f"{base.major}.{base.minor + 1}.0"
                specifier = SpecifierSet(f">={base_version},<{next_minor}")
            else:
                # Standard specifier (>=, <=, ==, etc.)
                specifier = SpecifierSet(version_constraint)

            if comp_version in specifier:
                return component
            else:
                logger.debug(f"Component {key} version {comp_version} doesn't match constraint {version_constraint}")
                return None

        except ImportError:
            # If packaging library is not available, return component anyway
            logger.warning("packaging library not installed, skipping version check")
            return component
        except Exception as e:
            # If version parsing fails, log warning and return component anyway
            logger.warning(f"Version parsing failed for {key}: {e}, returning component")
            return component

    def list_all(self) -> list[str]:
        """List all registered component keys."""
        return list(self._components.keys())

    def list_metadata(self) -> list[ComponentMetadata]:
        """Get metadata for all registered components."""
        return [comp.metadata for comp in self._components.values()]


# Global registry instance
component_registry = ComponentRegistry()

# Track if components have been registered
_components_registered = False


def ensure_components_registered() -> None:
    """
    Ensure all builtin components are registered.

    This should be called before building any graph that uses components.
    Safe to call multiple times - only registers once.
    """
    global _components_registered

    if _components_registered:
        return

    logger.info("Registering builtin components...")

    # React component
    from app.agents.components.react import ReActComponent

    component_registry.register(ReActComponent())

    # Deep research components
    from app.agents.components.deep_research.components import (
        ClarifyWithUserComponent,
        FinalReportComponent,
        ResearchBriefComponent,
        ResearchSupervisorComponent,
    )

    component_registry.register(ClarifyWithUserComponent())
    component_registry.register(ResearchBriefComponent())
    component_registry.register(ResearchSupervisorComponent())
    component_registry.register(FinalReportComponent())

    _components_registered = True
    logger.info(f"Registered {len(component_registry.list_all())} components")


# Export
__all__ = [
    # Registry
    "ComponentRegistry",
    "component_registry",
    # Registration
    "ensure_components_registered",
    # Component base classes (re-exported from component.py)
    "BaseComponent",
    "ComponentType",
    "ComponentMetadata",
    "ExecutableComponent",
]
