"""Beta survey repository for managing survey submissions."""

import logging

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.beta_survey import BetaSurvey, BetaSurveyCreate

logger = logging.getLogger(__name__)


class BetaSurveyRepository:
    """Beta survey data access layer."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: BetaSurveyCreate) -> BetaSurvey:
        """Create a new beta survey record."""
        logger.debug(f"Creating beta survey for user: {data.user_id}")

        survey = BetaSurvey(**data.model_dump())
        self.db.add(survey)
        await self.db.flush()
        await self.db.refresh(survey)

        logger.info(f"Created beta survey: {survey.id}, user: {survey.user_id}")
        return survey

    async def get_by_user(self, user_id: str) -> BetaSurvey | None:
        """Get a beta survey by user ID."""
        statement = select(BetaSurvey).where(col(BetaSurvey.user_id) == user_id)
        result = await self.db.exec(statement)
        return result.first()
