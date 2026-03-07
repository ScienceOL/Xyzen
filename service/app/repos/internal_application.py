"""Internal application repository for managing application submissions."""

import logging
from uuid import UUID

from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.internal_application import InternalApplication

logger = logging.getLogger(__name__)


class InternalApplicationRepository:
    """Internal application data access layer."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, application: InternalApplication) -> InternalApplication:
        """Create a new internal application record."""
        logger.debug(f"Creating internal application for user: {application.user_id}")

        self.db.add(application)
        await self.db.flush()
        await self.db.refresh(application)

        logger.info(f"Created internal application: {application.id}, serial: {application.serial_number}")
        return application

    async def get_by_user(self, user_id: str) -> InternalApplication | None:
        """Get an internal application by user ID."""
        statement = select(InternalApplication).where(col(InternalApplication.user_id) == user_id)
        result = await self.db.exec(statement)
        return result.first()

    async def get_all_by_user(self, user_id: str) -> list[InternalApplication]:
        """Get all internal applications by user ID, newest first."""
        statement = (
            select(InternalApplication)
            .where(col(InternalApplication.user_id) == user_id)
            .order_by(col(InternalApplication.created_at).desc())
        )
        result = await self.db.exec(statement)
        return list(result.all())

    async def get_all(
        self,
        limit: int = 50,
        offset: int = 0,
        search: str | None = None,
        company: str | None = None,
    ) -> tuple[list[InternalApplication], int]:
        """Get all internal applications, newest first, with total count.

        Args:
            search: ilike match on real_name, username, or company_name
            company: exact match on company_name
        """
        base = select(InternalApplication)
        if company:
            base = base.where(col(InternalApplication.company_name) == company)
        if search:
            pattern = f"%{search}%"
            base = base.where(
                col(InternalApplication.real_name).ilike(pattern)
                | col(InternalApplication.username).ilike(pattern)
                | col(InternalApplication.company_name).ilike(pattern)
            )

        count_stmt = select(func.count()).select_from(base.subquery())
        count_result = await self.db.exec(count_stmt)
        total = count_result.one()

        statement = base.order_by(col(InternalApplication.created_at).desc()).limit(limit).offset(offset)
        result = await self.db.exec(statement)
        return list(result.all()), total

    async def get_distinct_companies(self) -> list[str]:
        """Get distinct company names from all applications."""
        statement = select(InternalApplication.company_name).distinct().order_by(col(InternalApplication.company_name))
        result = await self.db.exec(statement)
        return list(result.all())

    async def get_by_id(self, app_id: UUID) -> InternalApplication | None:
        """Get a single internal application by ID."""
        statement = select(InternalApplication).where(col(InternalApplication.id) == app_id)
        result = await self.db.exec(statement)
        return result.first()

    async def update(self, application: InternalApplication) -> InternalApplication:
        """Persist changes to an internal application."""
        self.db.add(application)
        await self.db.flush()
        await self.db.refresh(application)
        return application
