import logging
from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.scheduled_task import ScheduledTaskCreate, ScheduledTaskRead, ScheduledTaskUpdate
from app.repos.scheduled_task import ScheduledTaskRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["scheduled-tasks"])


class CreateScheduledTaskRequest(BaseModel):
    agent_id: UUID
    session_id: UUID | None = None
    topic_id: UUID | None = None
    prompt: str = Field(max_length=10000)
    schedule_type: str = Field(description="once | daily | weekly | cron")
    cron_expression: str | None = None
    scheduled_at: str = Field(description="ISO 8601 datetime string")
    timezone: str = "UTC"
    max_runs: int | None = None


class UpdateScheduledTaskRequest(BaseModel):
    prompt: str | None = None
    schedule_type: str | None = None
    cron_expression: str | None = None
    scheduled_at: str | None = None
    timezone: str | None = None
    status: str | None = None
    max_runs: int | None = None


@router.get("/", response_model=list[ScheduledTaskRead])
async def list_scheduled_tasks(
    status: str | None = None,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ScheduledTaskRead]:
    """List user's scheduled tasks, optionally filtered by status."""
    repo = ScheduledTaskRepository(db)
    tasks = await repo.get_by_user(user, status=status)
    return [ScheduledTaskRead.model_validate(t) for t in tasks]


@router.get("/{task_id}", response_model=ScheduledTaskRead)
async def get_scheduled_task(
    task_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ScheduledTaskRead:
    """Get a single scheduled task by ID."""
    repo = ScheduledTaskRepository(db)
    task = await repo.get_by_id(task_id)
    if not task or task.user_id != user:
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    return ScheduledTaskRead.model_validate(task)


@router.post("/", response_model=ScheduledTaskRead, status_code=201)
async def create_scheduled_task(
    req: CreateScheduledTaskRequest,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ScheduledTaskRead:
    """Create a new scheduled task and queue it for execution."""
    if req.schedule_type not in ("once", "daily", "weekly", "cron"):
        raise HTTPException(status_code=400, detail="Invalid schedule_type")
    if req.schedule_type == "cron" and not req.cron_expression:
        raise HTTPException(status_code=400, detail="cron_expression required for cron schedule")

    # Parse scheduled_at
    try:
        tz = ZoneInfo(req.timezone)
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {req.timezone}")

    try:
        dt = datetime.fromisoformat(req.scheduled_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        dt_utc = dt.astimezone(timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {req.scheduled_at}")

    repo = ScheduledTaskRepository(db)
    task = await repo.create(
        ScheduledTaskCreate(
            agent_id=req.agent_id,
            session_id=req.session_id,
            topic_id=req.topic_id,
            prompt=req.prompt,
            schedule_type=req.schedule_type,
            cron_expression=req.cron_expression,
            scheduled_at=dt_utc,
            timezone=req.timezone,
            max_runs=req.max_runs,
        ),
        user_id=user,
    )
    await db.commit()

    # Queue the Celery task after commit so the row exists
    from app.tasks.scheduled import execute_scheduled_chat

    result = execute_scheduled_chat.apply_async(args=(str(task.id),), eta=dt_utc)
    await repo.update_celery_task_id(task.id, result.id)
    await db.commit()

    return ScheduledTaskRead.model_validate(task)


@router.patch("/{task_id}", response_model=ScheduledTaskRead)
async def update_scheduled_task(
    task_id: UUID,
    req: UpdateScheduledTaskRequest,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ScheduledTaskRead:
    """Update a scheduled task (pause/resume/modify)."""
    repo = ScheduledTaskRepository(db)
    task = await repo.get_by_id(task_id)
    if not task or task.user_id != user:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    update_data = ScheduledTaskUpdate()
    if req.prompt is not None:
        update_data.prompt = req.prompt
    if req.schedule_type is not None:
        update_data.schedule_type = req.schedule_type
    if req.cron_expression is not None:
        update_data.cron_expression = req.cron_expression
    if req.timezone is not None:
        update_data.timezone = req.timezone
    if req.max_runs is not None:
        update_data.max_runs = req.max_runs

    # Handle status changes (pause/resume)
    if req.status is not None:
        if req.status not in ("active", "paused", "completed"):
            raise HTTPException(status_code=400, detail="Invalid status")
        update_data.status = req.status

        if req.status == "paused" and task.celery_task_id:
            from app.core.celery_app import celery_app

            celery_app.control.revoke(task.celery_task_id, terminate=False)

        if req.status == "active" and task.status == "paused":
            # Re-queue if resuming
            from app.tasks.scheduled import execute_scheduled_chat

            eta = task.scheduled_at if task.scheduled_at > datetime.now(timezone.utc) else None
            if eta:
                result = execute_scheduled_chat.apply_async(args=(str(task.id),), eta=eta)
            else:
                result = execute_scheduled_chat.delay(str(task.id))
            await repo.update_celery_task_id(task.id, result.id)

    # Handle scheduled_at change
    if req.scheduled_at is not None:
        try:
            tz_str = req.timezone or task.timezone
            tz = ZoneInfo(tz_str)
            dt = datetime.fromisoformat(req.scheduled_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=tz)
            update_data.scheduled_at = dt.astimezone(timezone.utc)
        except (ValueError, KeyError):
            raise HTTPException(status_code=400, detail="Invalid scheduled_at or timezone")

        # Revoke old and schedule new
        if task.celery_task_id:
            from app.core.celery_app import celery_app

            celery_app.control.revoke(task.celery_task_id, terminate=False)
        from app.tasks.scheduled import execute_scheduled_chat

        result = execute_scheduled_chat.apply_async(args=(str(task.id),), eta=update_data.scheduled_at)
        await repo.update_celery_task_id(task.id, result.id)

    updated = await repo.update(task_id, update_data)
    await db.commit()

    if not updated:
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    return ScheduledTaskRead.model_validate(updated)


@router.delete("/{task_id}", status_code=204)
async def delete_scheduled_task(
    task_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Delete a scheduled task and revoke its Celery task."""
    repo = ScheduledTaskRepository(db)
    task = await repo.get_by_id(task_id)
    if not task or task.user_id != user:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    # Revoke Celery task
    if task.celery_task_id:
        from app.core.celery_app import celery_app

        celery_app.control.revoke(task.celery_task_id, terminate=False)

    await repo.delete(task_id)
    await db.commit()
