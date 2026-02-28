import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.scheduled_task import ScheduledTask, ScheduledTaskCreate, ScheduledTaskUpdate

logger = logging.getLogger(__name__)


class ScheduledTaskRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, data: ScheduledTaskCreate, user_id: str) -> ScheduledTask:
        task = ScheduledTask(
            agent_id=data.agent_id,
            session_id=data.session_id,
            topic_id=data.topic_id,
            prompt=data.prompt,
            schedule_type=data.schedule_type,
            cron_expression=data.cron_expression,
            scheduled_at=data.scheduled_at,
            timezone=data.timezone,
            max_runs=data.max_runs,
            metadata_=data.metadata_,
            user_id=user_id,
        )
        self.db.add(task)
        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def get_by_id(self, task_id: UUID) -> ScheduledTask | None:
        return await self.db.get(ScheduledTask, task_id)

    async def get_by_user(self, user_id: str, status: str | None = None) -> list[ScheduledTask]:
        statement = select(ScheduledTask).where(ScheduledTask.user_id == user_id)
        if status:
            statement = statement.where(ScheduledTask.status == status)
        statement = statement.order_by(ScheduledTask.created_at.desc())
        result = await self.db.exec(statement)
        return list(result.all())

    async def update(self, task_id: UUID, update: ScheduledTaskUpdate) -> ScheduledTask | None:
        task = await self.db.get(ScheduledTask, task_id)
        if not task:
            return None
        update_data = update.model_dump(exclude_unset=True, exclude_none=True)
        for field, value in update_data.items():
            if hasattr(task, field):
                setattr(task, field, value)
        task.updated_at = datetime.now(timezone.utc)
        self.db.add(task)
        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def delete(self, task_id: UUID) -> bool:
        task = await self.db.get(ScheduledTask, task_id)
        if not task:
            return False
        await self.db.delete(task)
        await self.db.flush()
        return True

    async def get_active_pending_tasks(self) -> list[ScheduledTask]:
        """Get all active tasks for worker recovery."""
        statement = select(ScheduledTask).where(ScheduledTask.status == "active")
        result = await self.db.exec(statement)
        return list(result.all())

    async def increment_run_count(self, task_id: UUID, last_run_at: datetime) -> int:
        """Increment run_count and return the new value."""
        task = await self.db.get(ScheduledTask, task_id)
        if task:
            task.run_count += 1
            task.last_run_at = last_run_at
            task.updated_at = datetime.now(timezone.utc)
            self.db.add(task)
            await self.db.flush()
            return task.run_count
        return 0

    async def update_celery_task_id(self, task_id: UUID, celery_task_id: str) -> None:
        task = await self.db.get(ScheduledTask, task_id)
        if task:
            task.celery_task_id = celery_task_id
            task.updated_at = datetime.now(timezone.utc)
            self.db.add(task)
            await self.db.flush()

    async def mark_failed(self, task_id: UUID, error: str) -> None:
        task = await self.db.get(ScheduledTask, task_id)
        if task:
            task.status = "failed"
            task.last_error = error
            task.updated_at = datetime.now(timezone.utc)
            self.db.add(task)
            await self.db.flush()

    async def mark_completed(self, task_id: UUID) -> None:
        task = await self.db.get(ScheduledTask, task_id)
        if task:
            task.status = "completed"
            task.updated_at = datetime.now(timezone.utc)
            self.db.add(task)
            await self.db.flush()

    async def mark_cancelled(self, task_id: UUID) -> None:
        task = await self.db.get(ScheduledTask, task_id)
        if task:
            task.status = "cancelled"
            task.updated_at = datetime.now(timezone.utc)
            self.db.add(task)
            await self.db.flush()

    async def update_scheduled_at(self, task_id: UUID, scheduled_at: datetime) -> None:
        task = await self.db.get(ScheduledTask, task_id)
        if task:
            task.scheduled_at = scheduled_at
            task.updated_at = datetime.now(timezone.utc)
            self.db.add(task)
            await self.db.flush()
