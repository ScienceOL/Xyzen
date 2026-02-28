"""
Ask User Question tool — pauses agent execution via LangGraph interrupt()
and presents an inline question to the user with optional choices.

The tool calls interrupt() which pauses the graph execution. The Celery
task detects the interrupt, publishes an ASK_USER_QUESTION event to the
frontend, and returns. When the user responds, a resume task is dispatched
that feeds the response back via Command(resume=...).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from langchain_core.tools import StructuredTool
from langgraph.types import interrupt
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class QuestionOption(BaseModel):
    """A single selectable option presented to the user."""

    id: str = Field(description="Unique identifier for this option")
    label: str = Field(description="Short display label")
    description: str | None = Field(default=None, description="Optional longer description")
    markdown: str | None = Field(
        default=None,
        description=(
            "Optional markdown content to preview when this option is focused"
            " (e.g., code snippet, formatted text)"
        ),
    )


class AskUserQuestionInput(BaseModel):
    """Input schema for the ask_user_question tool."""

    question: str = Field(description="The question to ask the user")
    options: list[QuestionOption] | None = Field(
        default=None,
        description="Optional list of selectable options. If omitted, only free-text input is shown.",
    )
    multi_select: bool = Field(
        default=False,
        description="Whether the user can select multiple options (default: single-select)",
    )
    allow_text_input: bool = Field(
        default=True,
        description="Whether to show a free-text input field in addition to options",
    )
    timeout_seconds: int = Field(
        default=300,
        ge=10,
        le=3600,
        description="Seconds to wait for user response before auto-timeout (default 5 minutes, max 1 hour)",
    )


def _ask_user_question(
    question: str,
    options: list[QuestionOption] | None = None,
    multi_select: bool = False,
    allow_text_input: bool = True,
    timeout_seconds: int = 300,
) -> dict[str, Any]:
    """Pause execution and ask the user a question.

    This function calls LangGraph's interrupt() which suspends the graph.
    The return value of interrupt() is the user's response dict, injected
    by Command(resume=...) when the user answers.
    """
    question_id = uuid4().hex

    payload = {
        "question_id": question_id,
        "question": question,
        "options": [opt.model_dump() for opt in options] if options else None,
        "multi_select": multi_select,
        "allow_text_input": allow_text_input,
        "timeout_seconds": timeout_seconds,
    }

    logger.info("ask_user_question: interrupting graph with question_id=%s", question_id)

    # interrupt() suspends the graph and returns the resume value when
    # the graph is continued with Command(resume=value).
    user_response = interrupt(payload)

    logger.info("ask_user_question: resumed with response for question_id=%s", question_id)

    # user_response is the dict sent by the frontend:
    # {"question_id": ..., "selected_options": [...], "text": ..., "timed_out": bool}
    return user_response


def create_ask_user_question_tool() -> StructuredTool:
    """Create the ask_user_question tool."""
    return StructuredTool.from_function(
        func=_ask_user_question,
        name="ask_user_question",
        description=(
            "Pause execution and ask the user a clarifying question. "
            "Use this when you need more information, want the user to choose "
            "between options, or need confirmation before proceeding. "
            "The user will see the question inline in the chat with optional "
            "clickable option chips and/or a free-text input field."
        ),
        args_schema=AskUserQuestionInput,
    )
