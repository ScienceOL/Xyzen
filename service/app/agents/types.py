"""
Agent Type Definitions - Type aliases and protocols for the agent system.

This module provides type definitions for:
- StateGraph and CompiledStateGraph with proper type parameters
- Node function signatures
- LLM factory callables
- System agent metadata structures
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Awaitable, Callable, TypedDict, TypeVar

from langchain_core.messages import BaseMessage
from langgraph.graph.state import CompiledStateGraph, StateGraph
from pydantic import BaseModel
from typing_extensions import NotRequired

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel


# =============================================================================
# State Types
# =============================================================================


class BaseGraphState(TypedDict, total=False):
    """
    Minimum fields present in all graph states.

    All dynamic graph states will have at least these fields,
    though additional fields may be added at runtime.
    """

    messages: list[BaseMessage]
    execution_context: dict[str, Any]


# Type alias for dynamic state dictionaries
# Used when the state schema is determined at runtime
StateDict = dict[str, Any]


# =============================================================================
# StateGraph Type Aliases
# =============================================================================

# TypeVar for state schema types
S = TypeVar("S", bound=BaseModel)

# For agents with known state types (e.g., DeepResearchState)
# Usage: TypedStateGraph[MyState] or TypedCompiledGraph[MyState]
TypedStateGraph = StateGraph[S, None, S, S]
TypedCompiledGraph = CompiledStateGraph[S, None, S, S]

# For dynamic/runtime-determined state types (graph builder)
# These use BaseModel as a placeholder since the actual type is created dynamically
DynamicStateGraph = StateGraph[BaseModel, None, BaseModel, BaseModel]
DynamicCompiledGraph = CompiledStateGraph[BaseModel, None, BaseModel, BaseModel]


# =============================================================================
# Node Function Types
# =============================================================================

# Async node function: takes state dict, returns partial state update
NodeFunction = Callable[[StateDict], Awaitable[StateDict]]

# Sync routing function: takes state dict, returns next node name
RouterFunction = Callable[[StateDict], str]

# Generic callable for node actions (used by LangGraph's add_node)
NodeAction = Callable[[StateDict], Awaitable[StateDict]] | Callable[[StateDict], StateDict]


# =============================================================================
# LLM Factory Type
# =============================================================================

# Factory function that creates LLM instances with optional overrides
# Signature: async def factory(model=None, temperature=None, ...) -> BaseChatModel
LLMFactory = Callable[..., Awaitable["BaseChatModel"]]


# =============================================================================
# System Agent Metadata Types
# =============================================================================


class AgentMetadata(TypedDict):
    """Metadata returned by BaseBuiltinGraphAgent.get_metadata()."""

    name: str
    description: str
    version: str
    capabilities: list[str]
    tags: list[str]
    author: NotRequired[str | None]
    license: NotRequired[str | None]


class ComponentMetadataDict(TypedDict):
    """Serialized component metadata."""

    key: str
    name: str
    description: str
    component_type: str
    version: str
    author: NotRequired[str | None]
    tags: NotRequired[list[str]]


class SystemAgentInfo(TypedDict):
    """
    Info returned by list_available_system_agents().

    Contains metadata about a system agent including its key,
    metadata, whether it can be forked, and exported components.
    """

    key: str
    metadata: AgentMetadata
    forkable: bool
    components: list[ComponentMetadataDict]
    error: NotRequired[str]


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    # State types
    "BaseGraphState",
    "StateDict",
    # StateGraph aliases
    "S",
    "TypedStateGraph",
    "TypedCompiledGraph",
    "DynamicStateGraph",
    "DynamicCompiledGraph",
    # Function types
    "NodeFunction",
    "RouterFunction",
    "NodeAction",
    "LLMFactory",
    # Metadata types
    "AgentMetadata",
    "ComponentMetadataDict",
    "SystemAgentInfo",
]
