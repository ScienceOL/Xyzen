"""
Base Graph Agent for Builtin Agents

This module provides the abstract base class that all builtin graph agents
must inherit from. It defines the interface and common functionality for
graph agents that are automatically discovered and loaded by the system.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, TypeVar

from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel

# TypeVar for state types in subclasses
StateT = TypeVar("StateT", bound=BaseModel)


class AgentMetadata:
    """Type-safe container for agent metadata."""

    __slots__ = ("name", "description", "version", "capabilities", "tags", "author", "license_")

    def __init__(
        self,
        name: str,
        description: str,
        version: str = "1.0.0",
        capabilities: list[str] | None = None,
        tags: list[str] | None = None,
        author: str | None = None,
        license_: str | None = None,
    ) -> None:
        self.name = name
        self.description = description
        self.version = version
        self.capabilities = capabilities or []
        self.tags = tags or []
        self.author = author
        self.license_ = license_

    def to_dict(self) -> dict[str, Any]:
        """Convert metadata to dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "capabilities": self.capabilities,
            "tags": self.tags,
            "author": self.author,
            "license": self.license_,
        }


class BaseBuiltinGraphAgent(ABC):
    """
    Abstract base class for all builtin graph agents.

    This class defines the interface that all builtin graph agents must implement
    to be automatically discovered and loaded by the registry system.

    Attributes:
        name: Human-readable name of the agent
        description: Detailed description of what the agent does
        version: Version string (semantic versioning recommended)
        capabilities: List of capabilities this agent provides
        tags: Tags for categorization and discovery
        author: Author of the agent
        license_: License under which the agent is provided
    """

    name: str
    description: str
    version: str
    capabilities: list[str]
    tags: list[str]
    author: str | None
    license_: str | None

    def __init__(
        self,
        name: str,
        description: str,
        version: str = "1.0.0",
        capabilities: list[str] | None = None,
        tags: list[str] | None = None,
        author: str | None = None,
        license_: str | None = None,
    ) -> None:
        """
        Initialize the builtin graph agent.

        Args:
            name: Human-readable name of the agent
            description: Detailed description of what the agent does
            version: Version string (semantic versioning recommended)
            capabilities: List of capabilities this agent provides
            tags: Tags for categorization and discovery
            author: Author of the agent
            license_: License under which the agent is provided
        """
        self.name = name
        self.description = description
        self.version = version
        self.capabilities = capabilities or []
        self.tags = tags or []
        self.author = author
        self.license_ = license_

    @abstractmethod
    def build_graph(self) -> CompiledStateGraph[Any, None, Any, Any]:
        """
        Build and return the LangGraph StateGraph for this agent.

        This method must construct the complete graph structure including:
        - All nodes and their functions
        - All edges connecting the nodes
        - Conditional edges where needed
        - Entry and exit points

        Returns:
            Compiled StateGraph ready for execution
        """
        ...

    @abstractmethod
    def get_state_schema(self) -> dict[str, Any]:
        """
        Return the state schema for this agent.

        This defines the structure of the state that will be passed between
        nodes in the graph. It should be a dictionary mapping field names
        to their types or descriptions.

        Returns:
            State schema definition
        """
        ...

    def get_metadata(self) -> dict[str, Any]:
        """
        Return comprehensive metadata about this agent.

        Returns:
            Agent metadata including name, description, version, capabilities, etc.
        """
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "capabilities": self.capabilities,
            "tags": self.tags,
            "author": self.author,
            "license": self.license_,
        }

    def get_display_name(self) -> str:
        """
        Get the display name for this agent.

        Returns:
            Display name (defaults to name if not overridden)
        """
        return self.name

    def get_icon(self) -> str | None:
        """
        Get the icon identifier for this agent.

        Returns:
            Icon identifier or None if no specific icon
        """
        return None

    def validate_state(self, state: dict[str, Any]) -> bool:
        """
        Validate that a state object conforms to this agent's schema.

        Args:
            state: State object to validate

        Returns:
            True if valid, False otherwise
        """
        try:
            # Basic validation - could be enhanced with schema validation
            _ = state  # Unused for now
            return True
        except Exception:
            return False

    def get_entry_point(self) -> str | None:
        """
        Get the entry point node name for this graph.

        Returns:
            Name of the entry node, or None to use default
        """
        return None

    def get_exit_points(self) -> list[str]:
        """
        Get the exit point node names for this graph.

        Returns:
            Names of exit nodes
        """
        return []

    def supports_streaming(self) -> bool:
        """
        Check if this agent supports streaming execution.

        Returns:
            True if streaming is supported, False otherwise
        """
        return True

    def get_required_tools(self) -> list[str]:
        """
        Get the list of required tools/MCP servers for this agent.

        Returns:
            List of required tool names
        """
        return []

    def get_estimated_execution_time(self) -> int | None:
        """
        Get estimated execution time in seconds.

        Returns:
            Estimated execution time or None if unknown
        """
        return None

    def __repr__(self) -> str:
        """String representation of the agent."""
        return f"<{self.__class__.__name__}(name='{self.name}', version='{self.version}')>"

    def __str__(self) -> str:
        """Human-readable string representation."""
        return f"{self.name} v{self.version}: {self.description}"
