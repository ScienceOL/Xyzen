"""Application service for beta surveys and internal applications."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

import jwt
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCode
from app.configs import configs
from app.models.beta_survey import BetaSurveyCreate
from app.models.internal_application import InternalApplication, InternalApplicationCreate
from app.repos.beta_survey import BetaSurveyRepository
from app.repos.internal_application import InternalApplicationRepository

logger = logging.getLogger(__name__)


class ApplicationService:
    """Service for handling beta surveys and internal applications."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.survey_repo = BetaSurveyRepository(db)
        self.app_repo = InternalApplicationRepository(db)

    async def submit_survey(self, data: BetaSurveyCreate, user_id: str | None = None):
        """Submit a beta survey. Checks for duplicates if user_id is provided."""
        if user_id:
            existing = await self.survey_repo.get_by_user(user_id)
            if existing:
                raise ErrCode.APPLICATION_SURVEY_ALREADY_SUBMITTED.with_messages("You have already submitted a survey.")
            data.user_id = user_id

        return await self.survey_repo.create(data)

    async def submit_application(self, data: InternalApplicationCreate, user_id: str, *, username: str | None = None):
        """Submit an internal application with serial number and JWT certificate."""
        now = datetime.now(timezone.utc)
        serial_number = f"XYZEN-{now.strftime('%Y%m%d')}-{uuid4().hex[:8].upper()}"

        application = InternalApplication(
            user_id=user_id,
            username=username,
            company_name=data.company_name,
            company_email=data.company_email,
            real_name=data.real_name,
            reason=data.reason,
            application_items=data.application_items,
            serial_number=serial_number,
            certificate_token="",  # Placeholder, will be set after we get the ID
        )

        application = await self.app_repo.create(application)

        # Generate certificate with the actual app ID
        application.certificate_token = self._generate_certificate(application)
        await self.db.flush()
        await self.db.refresh(application)

        return application

    async def get_my_survey(self, user_id: str):
        """Get the user's existing survey, if any."""
        return await self.survey_repo.get_by_user(user_id)

    async def get_my_application(self, user_id: str):
        """Get the user's existing application, if any."""
        return await self.app_repo.get_by_user(user_id)

    async def get_my_applications(self, user_id: str):
        """Get all of the user's applications, newest first."""
        return await self.app_repo.get_all_by_user(user_id)

    def _generate_certificate(self, app: InternalApplication) -> str:
        """Generate a JWT certificate for the internal application."""
        payload = {
            "app_id": str(app.id),
            "serial_number": app.serial_number,
            "email": app.company_email,
            "company": app.company_name,
            "real_name": app.real_name,
            "items": app.application_items,
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "iss": "xyzen",
            "sub": app.user_id,
        }
        token = jwt.encode(payload, configs.Secret, algorithm="HS256")
        # jwt.encode returns str in PyJWT>=2.0, but type stubs may say bytes
        return token if isinstance(token, str) else token.decode("utf-8")
