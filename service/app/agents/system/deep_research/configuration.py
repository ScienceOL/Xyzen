"""Configuration for the Deep Research agent."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class DeepResearchConfig(BaseModel):
    """Configuration for the Deep Research agent.

    This configuration controls the research workflow behavior.
    LLM and tools are injected via the agent's configure() method,
    so no model-specific configuration is needed here.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    # Research flow controls
    max_concurrent_research_units: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of research units to run concurrently",
    )
    max_researcher_iterations: int = Field(
        default=6,
        ge=1,
        le=10,
        description="Maximum research iterations for the supervisor",
    )
    max_react_tool_calls: int = Field(
        default=10,
        ge=1,
        le=30,
        description="Maximum tool calls per researcher",
    )
    allow_clarification: bool = Field(
        default=True,
        description="Whether to ask clarifying questions before research",
    )
    max_structured_output_retries: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Maximum retries for structured output failures",
    )


# Default configuration instance
DEFAULT_CONFIG = DeepResearchConfig()


__all__ = ["DeepResearchConfig", "DEFAULT_CONFIG"]
