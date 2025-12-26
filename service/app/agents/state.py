"""
Graph State - Base state schema for graph agents.

This module provides the GraphState class used by graph-based agents
to track state during execution.
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import BaseMessage
from pydantic import BaseModel, ConfigDict, Field


class GraphState(BaseModel):
    """
    Base state schema for graph execution.

    This state is passed between nodes in a LangGraph and tracks:
    - Conversation messages
    - Current execution step
    - Execution context (arbitrary key-value pairs)
    - User input and final output
    - Any errors that occur

    Attributes:
        messages: List of conversation messages
        current_step: Name of the current execution step
        execution_context: Arbitrary key-value context data
        user_input: The user's input text
        final_output: The final output text
        error: Error message if execution failed
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    messages: list[BaseMessage] = Field(default_factory=list)
    current_step: str = ""
    execution_context: dict[str, Any] = Field(default_factory=dict)
    user_input: str = ""
    final_output: str = ""
    error: str | None = None
