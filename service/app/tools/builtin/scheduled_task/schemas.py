"""
Input schemas for scheduled task tools.

NOTE: Avoid `X | None` (Optional) fields here. Google Gemini's tool schema
converter (`langchain_google_genai`) cannot handle the `anyOf` JSON Schema
pattern that Pydantic generates for union types. Use sentinel defaults instead
(empty string / 0) and map them to None in the tool function.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class CreateScheduledTaskInput(BaseModel):
    """Input schema for create_scheduled_task tool."""

    prompt: str = Field(
        description="The message/prompt to send at the scheduled time. Be specific and complete.",
    )
    schedule_type: str = Field(
        description=(
            'Type of schedule: "once" for a single execution, '
            '"daily" for daily recurrence, "weekly" for weekly recurrence, '
            'or "cron" for custom cron expression.'
        ),
    )
    scheduled_at: str = Field(
        description=(
            "When to execute, in ISO 8601 format (e.g., '2025-01-15T21:00:00'). Interpreted in the user's timezone."
        ),
    )
    cron_expression: str = Field(
        default="",
        description='Cron expression for "cron" schedule_type (e.g., "0 21 * * *" for daily at 9 PM). Leave empty if not using cron.',
    )
    timezone: str = Field(
        default="UTC",
        description='IANA timezone name (e.g., "Asia/Shanghai", "America/New_York"). Defaults to UTC.',
    )
    max_runs: int = Field(
        default=0,
        description="Maximum number of runs. 0 means unlimited (for recurring schedules).",
    )


class ListScheduledTasksInput(BaseModel):
    """Input schema for list_scheduled_tasks tool."""

    pass


class CancelScheduledTaskInput(BaseModel):
    """Input schema for cancel_scheduled_task tool."""

    task_id: str = Field(
        description="The UUID of the scheduled task to cancel.",
    )
