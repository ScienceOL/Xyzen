import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.runner import Runner, RunnerUpdate

logger = logging.getLogger(__name__)


class RunnerRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, runner: Runner) -> Runner:
        self.db.add(runner)
        await self.db.flush()
        await self.db.refresh(runner)
        return runner

    async def get_by_id(self, runner_id: UUID) -> Runner | None:
        return await self.db.get(Runner, runner_id)

    async def get_by_token_hash(self, token_hash: str) -> Runner | None:
        statement = select(Runner).where(Runner.token_hash == token_hash)
        result = await self.db.exec(statement)
        return result.first()

    async def list_by_user(self, user_id: str) -> list[Runner]:
        statement = select(Runner).where(Runner.user_id == user_id).order_by(Runner.created_at.desc())
        result = await self.db.exec(statement)
        return list(result.all())

    async def update(self, runner_id: UUID, update: RunnerUpdate) -> Runner | None:
        runner = await self.db.get(Runner, runner_id)
        if not runner:
            return None
        update_data = update.model_dump(exclude_unset=True, exclude_none=True)
        for field, value in update_data.items():
            if hasattr(runner, field):
                setattr(runner, field, value)
        runner.updated_at = datetime.now(timezone.utc)
        self.db.add(runner)
        await self.db.flush()
        await self.db.refresh(runner)
        return runner

    async def delete(self, runner_id: UUID) -> bool:
        runner = await self.db.get(Runner, runner_id)
        if not runner:
            return False
        await self.db.delete(runner)
        await self.db.flush()
        return True

    async def touch_last_connected(
        self,
        runner_id: UUID,
        os_info: str | None = None,
        work_dir: str | None = None,
    ) -> None:
        runner = await self.db.get(Runner, runner_id)
        if runner:
            runner.last_connected_at = datetime.now(timezone.utc)
            if os_info is not None:
                runner.os_info = os_info
            if work_dir is not None:
                runner.work_dir = work_dir
            runner.updated_at = datetime.now(timezone.utc)
            self.db.add(runner)
            await self.db.flush()
