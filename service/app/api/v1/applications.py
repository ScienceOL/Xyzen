"""Application API endpoints for beta surveys and internal applications."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCodeError, handle_auth_error
from app.core.application import ApplicationService
from app.infra.database import get_session as get_db_session
from app.middleware.auth import get_current_user, get_current_user_optional
from app.models.beta_survey import BetaSurveyCreate, BetaSurveyRead
from app.models.internal_application import InternalApplicationCreate, InternalApplicationRead

logger = logging.getLogger(__name__)

router = APIRouter(tags=["applications"])

GENERIC_ERROR_MESSAGES = {
    "survey_submit": "Failed to submit survey",
    "survey_get": "Failed to get survey",
    "application_submit": "Failed to submit application",
    "application_get": "Failed to get application",
}


@router.post("/survey", response_model=BetaSurveyRead)
async def submit_survey(
    data: BetaSurveyCreate,
    user_id: str | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session),
):
    """Submit a beta survey. Authentication is optional (anonymous surveys allowed)."""
    try:
        service = ApplicationService(db)
        survey = await service.submit_survey(data, user_id)
        await db.commit()
        return survey

    except ErrCodeError as e:
        await db.rollback()
        raise handle_auth_error(e)
    except Exception as e:
        await db.rollback()
        logger.error(f"Error submitting survey: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=GENERIC_ERROR_MESSAGES["survey_submit"],
        )


@router.get("/survey/mine", response_model=BetaSurveyRead | None)
async def get_my_survey(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get the current user's beta survey submission."""
    try:
        service = ApplicationService(db)
        return await service.get_my_survey(current_user)

    except Exception as e:
        logger.error(f"Error getting survey for user {current_user}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=GENERIC_ERROR_MESSAGES["survey_get"],
        )


@router.post("/internal", response_model=InternalApplicationRead)
async def submit_application(
    data: InternalApplicationCreate,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Submit an internal application. Requires authentication."""
    try:
        service = ApplicationService(db)
        application = await service.submit_application(data, current_user)
        await db.commit()
        return application

    except ErrCodeError as e:
        await db.rollback()
        raise handle_auth_error(e)
    except Exception as e:
        await db.rollback()
        logger.error(f"Error submitting application for user {current_user}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=GENERIC_ERROR_MESSAGES["application_submit"],
        )


@router.get("/internal/mine", response_model=list[InternalApplicationRead])
async def get_my_applications(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get all of the current user's internal applications."""
    try:
        service = ApplicationService(db)
        return await service.get_my_applications(current_user)

    except Exception as e:
        logger.error(f"Error getting applications for user {current_user}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=GENERIC_ERROR_MESSAGES["application_get"],
        )
