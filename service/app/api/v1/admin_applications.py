"""Admin API endpoints for internal application management."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.infra.database import get_session as get_db_session
from app.models.internal_application import InternalApplication
from app.repos.internal_application import InternalApplicationRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-applications"])


# ==================== Request/Response Models ====================


class ApproveApplicationRequest(BaseModel):
    code_type: str = "credits"
    amount: int = 0
    role_name: str | None = None
    duration_days: int = 30
    description: str | None = None
    max_usage: int = 1


class RedemptionCodeInfo(BaseModel):
    code: str
    code_type: str
    role_name: str | None
    amount: int
    duration_days: int
    current_usage: int
    max_usage: int
    is_active: bool
    created_at: str


class AdminApplicationResponse(BaseModel):
    id: str
    user_id: str
    username: str | None
    company_name: str
    company_email: str
    real_name: str
    reason: str
    application_items: list[str]
    status: str
    serial_number: str
    redemption_code_id: str | None
    created_at: str
    updated_at: str
    total_credits_granted: int
    redemption_code: RedemptionCodeInfo | None = None
    redeemed_at: str | None = None


class AdminApplicationsListResponse(BaseModel):
    applications: list[AdminApplicationResponse]
    total: int


# ==================== Helper ====================


def _verify_admin(admin_secret: str) -> None:
    if admin_secret != configs.Admin.secret:
        logger.warning("Invalid admin secret key provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin secret key",
        )


async def _build_application_response(
    app: InternalApplication,
    db: AsyncSession,
) -> AdminApplicationResponse:
    """Build an AdminApplicationResponse with optional redemption code details."""
    from app.repos.redemption import RedemptionRepository

    redemption_code_info: RedemptionCodeInfo | None = None
    redeemed_at: str | None = None

    if app.redemption_code_id:
        redemption_repo = RedemptionRepository(db)
        code = await redemption_repo.get_redemption_code_by_id(app.redemption_code_id)
        if code:
            redemption_code_info = RedemptionCodeInfo(
                code=code.code,
                code_type=code.code_type,
                role_name=code.role_name,
                amount=code.amount,
                duration_days=code.duration_days,
                current_usage=code.current_usage,
                max_usage=code.max_usage,
                is_active=code.is_active,
                created_at=code.created_at.isoformat(),
            )
            # Check if code has been redeemed
            history = await redemption_repo.get_code_redemption_history(app.redemption_code_id, limit=1)
            if history:
                redeemed_at = history[0].redeemed_at.isoformat()

    return AdminApplicationResponse(
        id=str(app.id),
        user_id=app.user_id,
        username=app.username,
        company_name=app.company_name,
        company_email=app.company_email,
        real_name=app.real_name,
        reason=app.reason,
        application_items=app.application_items,
        status=app.status,
        serial_number=app.serial_number,
        redemption_code_id=str(app.redemption_code_id) if app.redemption_code_id else None,
        created_at=app.created_at.isoformat(),
        updated_at=app.updated_at.isoformat(),
        total_credits_granted=app.total_credits_granted,
        redemption_code=redemption_code_info,
        redeemed_at=redeemed_at,
    )


# ==================== Endpoints ====================


@router.get("/companies", response_model=list[str])
async def list_companies(
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get distinct company names for filter dropdown."""
    _verify_admin(admin_secret)
    repo = InternalApplicationRepository(db)
    return await repo.get_distinct_companies()


@router.get("", response_model=AdminApplicationsListResponse)
async def list_applications(
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None),
    company: str | None = Query(None),
    db: AsyncSession = Depends(get_db_session),
):
    """List all internal applications with optional redemption code details."""
    _verify_admin(admin_secret)

    repo = InternalApplicationRepository(db)
    applications, total = await repo.get_all(limit=limit, offset=offset, search=search, company=company)

    responses = [await _build_application_response(app, db) for app in applications]

    return AdminApplicationsListResponse(applications=responses, total=total)


@router.post("/{app_id}/approve", response_model=AdminApplicationResponse)
async def approve_application(
    app_id: UUID,
    request: ApproveApplicationRequest,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """Approve an application and generate a redemption code."""
    _verify_admin(admin_secret)

    repo = InternalApplicationRepository(db)
    application = await repo.get_by_id(app_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    if application.status != "pending":
        raise HTTPException(status_code=400, detail=f"Application is already {application.status}")

    # Generate redemption code via RedemptionService
    from app.core.redemption import RedemptionService

    redemption_service = RedemptionService(db)
    code = await redemption_service.create_redemption_code(
        amount=request.amount,
        max_usage=request.max_usage,
        code_type=request.code_type,
        role_name=request.role_name,
        duration_days=request.duration_days,
        description=request.description or f"Internal application: {application.serial_number}",
    )

    # Update application status and link to code
    application.status = "approved"
    application.redemption_code_id = code.id
    application.updated_at = datetime.now(timezone.utc)
    await repo.update(application)

    await db.commit()

    return await _build_application_response(application, db)


@router.post("/{app_id}/reject", response_model=AdminApplicationResponse)
async def reject_application(
    app_id: UUID,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """Reject an application."""
    _verify_admin(admin_secret)

    repo = InternalApplicationRepository(db)
    application = await repo.get_by_id(app_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    if application.status != "pending":
        raise HTTPException(status_code=400, detail=f"Application is already {application.status}")

    application.status = "rejected"
    application.updated_at = datetime.now(timezone.utc)
    await repo.update(application)

    await db.commit()

    return await _build_application_response(application, db)
