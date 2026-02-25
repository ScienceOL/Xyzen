"""
Scheduled task tool factory.

Provides:
- create_scheduled_task_tools(): placeholder tools for registry
- create_scheduled_task_tools_for_session(): context-bound tools with DB access
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from datetime import timezone as dt_timezone
from typing import TYPE_CHECKING
from uuid import UUID
from zoneinfo import ZoneInfo

from langchain_core.tools import BaseTool, StructuredTool

from app.tools.builtin.scheduled_task.schemas import (
    CancelScheduledTaskInput,
    CreateScheduledTaskInput,
    ListScheduledTasksInput,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker

logger = logging.getLogger(__name__)


def create_scheduled_task_tools() -> dict[str, BaseTool]:
    """Create placeholder tools for registry (non-functional)."""
    from langchain_core.tools import Tool

    return {
        "create_scheduled_task": Tool(
            name="create_scheduled_task",
            description="Schedule a task to run at a specified time or recurring schedule",
            func=lambda _: None,
        ),
        "list_scheduled_tasks": Tool(
            name="list_scheduled_tasks",
            description="List the user's scheduled tasks",
            func=lambda _: None,
        ),
        "cancel_scheduled_task": Tool(
            name="cancel_scheduled_task",
            description="Cancel a scheduled task",
            func=lambda _: None,
        ),
    }


def create_scheduled_task_tools_for_session(
    user_id: str,
    agent_id: UUID,
    session_id: UUID,
    topic_id: UUID,
    session_factory: "async_sessionmaker",
) -> list[BaseTool]:
    """Create context-bound scheduled task tools.

    These tools capture the user/agent/session context and use a DB session
    factory to create their own sessions at execution time.
    """

    async def create_scheduled_task_fn(
        prompt: str,
        schedule_type: str,
        scheduled_at: str,
        cron_expression: str = "",
        timezone: str = "UTC",
        max_runs: int = 0,
    ) -> str:
        """Create a new scheduled task."""
        from app.models.scheduled_task import ScheduledTaskCreate
        from app.repos.scheduled_task import ScheduledTaskRepository
        from app.tasks.scheduled import execute_scheduled_chat

        # Map sentinel defaults to None
        cron_expr = cron_expression or None
        max_runs_val = max_runs if max_runs > 0 else None

        # Validate schedule_type
        if schedule_type not in ("once", "daily", "weekly", "cron"):
            return json.dumps({"error": f"Invalid schedule_type: {schedule_type}. Must be once/daily/weekly/cron."})

        if schedule_type == "cron" and not cron_expr:
            return json.dumps({"error": "cron_expression is required for schedule_type='cron'"})

        # Validate minimum interval
        from app.tasks.schedule_utils import validate_min_interval

        interval_error = validate_min_interval(schedule_type, cron_expr)
        if interval_error:
            return json.dumps({"error": interval_error})

        # Enforce per-user task count limit
        from fastapi import HTTPException

        from app.core.limits import LimitsEnforcer

        async with session_factory() as limit_db:
            enforcer = await LimitsEnforcer.create(limit_db, user_id)
            try:
                await enforcer.check_scheduled_task_creation(limit_db)
            except HTTPException as exc:
                return json.dumps({"error": exc.detail})

        # Parse scheduled_at
        try:
            tz = ZoneInfo(timezone)
        except (KeyError, ValueError):
            return json.dumps({"error": f"Invalid timezone: {timezone}"})

        try:
            dt = datetime.fromisoformat(scheduled_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=tz)
            dt_utc = dt.astimezone(dt_timezone.utc)
        except ValueError:
            return json.dumps({"error": f"Invalid datetime format: {scheduled_at}. Use ISO 8601."})

        async with session_factory() as db:
            repo = ScheduledTaskRepository(db)
            task = await repo.create(
                ScheduledTaskCreate(
                    agent_id=agent_id,
                    session_id=session_id,
                    topic_id=topic_id,
                    prompt=prompt,
                    schedule_type=schedule_type,
                    cron_expression=cron_expr,
                    scheduled_at=dt_utc,
                    timezone=timezone,
                    max_runs=max_runs_val,
                ),
                user_id=user_id,
            )
            await db.commit()

            # Queue the Celery task after commit so the row exists
            result = execute_scheduled_chat.apply_async(
                args=(str(task.id),),
                eta=dt_utc,
            )
            await repo.update_celery_task_id(task.id, result.id)
            await db.commit()

        return json.dumps(
            {
                "success": True,
                "task_id": str(task.id),
                "scheduled_at": dt_utc.isoformat(),
                "schedule_type": schedule_type,
                "message": f"Task scheduled successfully. Next run at {dt.strftime('%Y-%m-%d %H:%M')} ({timezone}).",
            }
        )

    async def list_scheduled_tasks_fn() -> str:
        """List user's scheduled tasks."""
        from app.repos.scheduled_task import ScheduledTaskRepository

        async with session_factory() as db:
            repo = ScheduledTaskRepository(db)
            tasks = await repo.get_by_user(user_id)

        if not tasks:
            return json.dumps({"tasks": [], "message": "No scheduled tasks found."})

        task_list = []
        for t in tasks:
            task_list.append(
                {
                    "id": str(t.id),
                    "prompt": t.prompt[:100] + ("..." if len(t.prompt) > 100 else ""),
                    "schedule_type": t.schedule_type,
                    "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
                    "timezone": t.timezone,
                    "status": t.status,
                    "run_count": t.run_count,
                    "max_runs": t.max_runs,
                    "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
                }
            )

        return json.dumps({"tasks": task_list, "count": len(task_list)})

    async def cancel_scheduled_task_fn(task_id: str) -> str:
        """Cancel a scheduled task."""
        from app.repos.scheduled_task import ScheduledTaskRepository

        try:
            task_uuid = UUID(task_id)
        except ValueError:
            return json.dumps({"error": f"Invalid task_id: {task_id}"})

        async with session_factory() as db:
            repo = ScheduledTaskRepository(db)
            task = await repo.get_by_id(task_uuid)

            if not task:
                return json.dumps({"error": "Task not found."})
            if task.user_id != user_id:
                return json.dumps({"error": "Permission denied."})

            # Revoke Celery task if queued
            if task.celery_task_id:
                from app.core.celery_app import celery_app

                celery_app.control.revoke(task.celery_task_id, terminate=False)

            await repo.mark_cancelled(task_uuid)
            await db.commit()

        return json.dumps({"success": True, "message": "Task cancelled successfully."})

    tools: list[BaseTool] = [
        StructuredTool(
            name="create_scheduled_task",
            description=(
                "Schedule a message to be sent to the AI agent at a specified time or on a recurring schedule. "
                "Useful for reminders, daily briefings, periodic research, etc."
            ),
            args_schema=CreateScheduledTaskInput,
            coroutine=create_scheduled_task_fn,
        ),
        StructuredTool(
            name="list_scheduled_tasks",
            description="List all scheduled tasks for the current user.",
            args_schema=ListScheduledTasksInput,
            coroutine=list_scheduled_tasks_fn,
        ),
        StructuredTool(
            name="cancel_scheduled_task",
            description="Cancel an existing scheduled task by its ID.",
            args_schema=CancelScheduledTaskInput,
            coroutine=cancel_scheduled_task_fn,
        ),
    ]

    return tools
