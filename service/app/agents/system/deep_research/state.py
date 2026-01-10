"""Structured outputs and state models for the Deep Research agent.

These models are used for:
- Tool definitions (ResearchComplete)
- LLM structured outputs (ClarifyWithUser, ResearchQuestion)
"""

from __future__ import annotations

from pydantic import BaseModel, Field


###################
# Structured Outputs
###################


class ConductResearch(BaseModel):
    """Tool call to conduct research on a specific topic.

    Used by the supervisor to delegate research tasks to sub-researchers.
    """

    research_topic: str = Field(
        description=(
            "The topic to research. Should be a single topic, described in high detail (at least a paragraph)."
        ),
    )


class ResearchComplete(BaseModel):
    """Tool call to indicate that the research is complete.

    Used by researchers to signal completion.
    """

    pass


class ClarifyWithUser(BaseModel):
    """Model for user clarification responses from LLM.

    Supports three request types:
    - follow_up: User is asking about existing content (translate, summarize, etc.)
    - new_research: User wants to research a new topic
    - needs_clarification: User's request is unclear
    """

    request_type: str = Field(
        default="new_research",
        description="Type of request: 'follow_up' (no research needed), 'new_research', or 'needs_clarification'",
    )
    need_clarification: bool = Field(
        description="Whether the user needs to be asked a clarifying question.",
    )
    skip_research: bool = Field(
        default=False,
        description="Whether to skip research (true for follow-up requests like translation)",
    )
    question: str = Field(
        default="",
        description="A question to ask the user to clarify the report scope",
    )
    verification: str = Field(
        default="",
        description="Verification message OR complete response for follow-up requests",
    )


class ResearchQuestion(BaseModel):
    """Research question and brief for guiding research."""

    research_brief: str = Field(
        description="A research question that will be used to guide the research.",
    )


__all__ = [
    "ConductResearch",
    "ResearchComplete",
    "ClarifyWithUser",
    "ResearchQuestion",
]
