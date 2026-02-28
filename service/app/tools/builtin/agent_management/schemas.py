"""Input schemas for agent management tools."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CreateAgentInput(BaseModel):
    """Input schema for create_agent tool."""

    name: str = Field(description="Name for the new agent.")
    description: str = Field(
        default="",
        description="Short description of what the agent does. Leave empty for none.",
    )
    prompt: str = Field(
        default="",
        description="System prompt / instructions that define the agent's personality and behavior. Leave empty for default.",
    )
    model: str = Field(
        default="",
        description="Model name (e.g. 'gpt-4o', 'claude-sonnet-4-20250514'). Leave empty to use the user's default model.",
    )
    tags: str = Field(
        default="",
        description='Comma-separated tags for categorization (e.g. "research,writing"). Leave empty for none.',
    )
    graph_config: str = Field(
        default="",
        description=(
            "Advanced: full canonical GraphConfig v3 JSON string for custom graph agents. "
            "Leave empty to create a standard ReAct agent (recommended for most use cases). "
            "Call get_agent_schema first to see the full spec."
        ),
    )


class UpdateAgentInput(BaseModel):
    """Input schema for update_agent tool."""

    agent_id: str = Field(description="UUID of the agent to update.")
    name: str = Field(
        default="",
        description="New name for the agent. Leave empty to keep current.",
    )
    description: str = Field(
        default="",
        description="New description. Leave empty to keep current.",
    )
    prompt: str = Field(
        default="",
        description="New system prompt. Leave empty to keep current.",
    )
    model: str = Field(
        default="",
        description="New model name. Leave empty to keep current.",
    )
    tags: str = Field(
        default="",
        description="New comma-separated tags. Leave empty to keep current.",
    )
    graph_config: str = Field(
        default="",
        description="New GraphConfig v3 JSON string. Leave empty to keep current.",
    )


class DeleteAgentInput(BaseModel):
    """Input schema for delete_agent tool."""

    agent_id: str = Field(description="UUID of the agent to delete.")
