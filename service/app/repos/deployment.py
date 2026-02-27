"""Repository for deployments table."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.deployment import Deployment, DeploymentCreate

logger = logging.getLogger(__name__)


class DeploymentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, data: DeploymentCreate) -> Deployment:
        deployment = Deployment(**data.model_dump())
        self.db.add(deployment)
        await self.db.flush()
        await self.db.refresh(deployment)
        return deployment

    async def get_by_id(self, deployment_id: UUID, user_id: str | None = None) -> Deployment | None:
        deployment = await self.db.get(Deployment, deployment_id)
        if deployment is None:
            return None
        if user_id is not None and deployment.user_id != user_id:
            return None
        return deployment

    async def list_by_user(self, user_id: str) -> list[Deployment]:
        statement = (
            select(Deployment)
            .where(col(Deployment.user_id) == user_id)
            .where(col(Deployment.status) != "deleted")
            .order_by(Deployment.created_at.desc())
        )
        result = await self.db.exec(statement)
        return list(result.all())

    async def count_active_by_user(self, user_id: str) -> int:
        statement = (
            select(func.count())
            .select_from(Deployment)
            .where(col(Deployment.user_id) == user_id)
            .where(col(Deployment.status).in_(["creating", "running"]))
        )
        result = await self.db.exec(statement)
        return result.one()

    async def update_status(self, deployment_id: UUID, status: str, url: str | None = None) -> Deployment | None:
        deployment = await self.db.get(Deployment, deployment_id)
        if deployment is None:
            return None
        deployment.status = status
        if url is not None:
            deployment.url = url
        deployment.updated_at = datetime.now(timezone.utc)
        self.db.add(deployment)
        await self.db.flush()
        await self.db.refresh(deployment)
        return deployment

    async def delete(self, deployment_id: UUID) -> bool:
        deployment = await self.db.get(Deployment, deployment_id)
        if deployment is None:
            return False
        await self.db.delete(deployment)
        await self.db.flush()
        return True
