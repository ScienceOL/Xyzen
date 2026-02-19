"""Input schemas for delegation tools."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GetAgentDetailsInput(BaseModel):
    """Input schema for get_agent_details tool."""

    agent_id: str = Field(description="The ID of the agent to get details for.")


class DelegateToAgentInput(BaseModel):
    """Input schema for delegate_to_agent tool."""

    agent_id: str = Field(description="The ID of the agent to delegate to.")
    task: str = Field(
        description=(
            "The task to delegate. Be specific and complete — the agent has no prior context from your conversation."
        ),
    )
