"""Redemption API endpoints for code generation and redemption."""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from common.code.error_code import ErrCodeError, handle_auth_error
from core.redemption import RedemptionService
from internal.configs import configs
from middleware.auth import get_current_user
from middleware.database.connection import get_session as get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["redemption"])


# ==================== Request/Response Models ====================
class GenerateCodeRequest(BaseModel):
    """Request model for generating a redemption code."""

    amount: int = Field(gt=0, description="Virtual balance amount to credit")
    max_usage: int = Field(default=1, gt=0, description="Maximum number of times this code can be used")
    code: Optional[str] = Field(default=None, description="Custom code (if None, generates random code)")
    expires_at: Optional[datetime] = Field(default=None, description="Expiration time (None means no expiration)")
    description: Optional[str] = Field(default=None, description="Code description or notes")
    is_active: bool = Field(default=True, description="Whether the code is active")


class RedemptionCodeResponse(BaseModel):
    """Response model for redemption code."""

    id: UUID
    code: str
    amount: int
    max_usage: int
    current_usage: int
    is_active: bool
    expires_at: Optional[datetime]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime


class RedeemCodeRequest(BaseModel):
    """Request model for redeeming a code."""

    code: str = Field(description="Redemption code to redeem")


class RedeemCodeResponse(BaseModel):
    """Response model for successful redemption."""

    success: bool
    amount_credited: int
    new_balance: int
    message: str


class UserWalletResponse(BaseModel):
    """Response model for user wallet."""

    user_id: str
    virtual_balance: int
    total_credited: int
    total_consumed: int
    created_at: datetime
    updated_at: datetime


class RedemptionHistoryResponse(BaseModel):
    """Response model for redemption history."""

    id: UUID
    code_id: UUID
    user_id: str
    amount: int
    redeemed_at: datetime


class ListCodesResponse(BaseModel):
    """Response model for listing redemption codes."""

    codes: list[RedemptionCodeResponse]
    total: int


# ==================== Admin Endpoints ====================
@router.post("/admin/codes", response_model=RedemptionCodeResponse, status_code=status.HTTP_201_CREATED)
async def generate_redemption_code(
    request: GenerateCodeRequest,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Generate a new redemption code (admin only).

    Requires X-Admin-Secret header for authentication.

    Args:
        request: Code generation parameters
        admin_secret: Admin secret key from header
        db: Database session

    Returns:
        Created redemption code
    """
    logger.info("Admin attempting to generate redemption code")

    # Verify admin secret
    if admin_secret != configs.Admin.secret:
        logger.warning("Invalid admin secret key provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin secret key",
        )

    try:
        service = RedemptionService(db)
        code = await service.create_redemption_code(
            amount=request.amount,
            max_usage=request.max_usage,
            code=request.code,
            expires_at=request.expires_at,
            description=request.description,
            is_active=request.is_active,
        )

        await db.commit()

        logger.info(f"Generated redemption code: {code.code}, amount: {code.amount}")

        return RedemptionCodeResponse(
            id=code.id,
            code=code.code,
            amount=code.amount,
            max_usage=code.max_usage,
            current_usage=code.current_usage,
            is_active=code.is_active,
            expires_at=code.expires_at,
            description=code.description,
            created_at=code.created_at,
            updated_at=code.updated_at,
        )

    except ErrCodeError as e:
        await db.rollback()
        logger.error(f"Failed to generate redemption code: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error generating redemption code: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/admin/codes", response_model=ListCodesResponse)
async def list_redemption_codes(
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    limit: int = 100,
    offset: int = 0,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db_session),
):
    """
    List redemption codes (admin only).

    Requires X-Admin-Secret header for authentication.

    Args:
        admin_secret: Admin secret key from header
        limit: Maximum number of codes to return
        offset: Number of codes to skip
        is_active: Filter by active status
        db: Database session

    Returns:
        List of redemption codes
    """
    logger.info("Admin listing redemption codes")

    # Verify admin secret
    if admin_secret != configs.Admin.secret:
        logger.warning("Invalid admin secret key provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin secret key",
        )

    try:
        service = RedemptionService(db)
        codes = await service.list_redemption_codes(limit=limit, offset=offset, is_active=is_active)

        response_codes = [
            RedemptionCodeResponse(
                id=code.id,
                code=code.code,
                amount=code.amount,
                max_usage=code.max_usage,
                current_usage=code.current_usage,
                is_active=code.is_active,
                expires_at=code.expires_at,
                description=code.description,
                created_at=code.created_at,
                updated_at=code.updated_at,
            )
            for code in codes
        ]

        return ListCodesResponse(codes=response_codes, total=len(response_codes))

    except Exception as e:
        logger.error(f"Error listing redemption codes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/admin/codes/{code_id}", response_model=RedemptionCodeResponse)
async def get_redemption_code(
    code_id: UUID,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get redemption code by ID (admin only).

    Requires X-Admin-Secret header for authentication.

    Args:
        code_id: Code ID to fetch
        admin_secret: Admin secret key from header
        db: Database session

    Returns:
        Redemption code details
    """
    logger.info(f"Admin fetching redemption code: {code_id}")

    # Verify admin secret
    if admin_secret != configs.Admin.secret:
        logger.warning("Invalid admin secret key provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin secret key",
        )

    try:
        service = RedemptionService(db)
        code = await service.get_redemption_code_by_id(code_id)

        if code is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Redemption code {code_id} not found",
            )

        return RedemptionCodeResponse(
            id=code.id,
            code=code.code,
            amount=code.amount,
            max_usage=code.max_usage,
            current_usage=code.current_usage,
            is_active=code.is_active,
            expires_at=code.expires_at,
            description=code.description,
            created_at=code.created_at,
            updated_at=code.updated_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching redemption code: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/admin/codes/{code_id}/deactivate", response_model=RedemptionCodeResponse)
async def deactivate_redemption_code(
    code_id: UUID,
    admin_secret: str = Header(..., alias="X-Admin-Secret"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Deactivate a redemption code (admin only).

    Requires X-Admin-Secret header for authentication.

    Args:
        code_id: Code ID to deactivate
        admin_secret: Admin secret key from header
        db: Database session

    Returns:
        Updated redemption code
    """
    logger.info(f"Admin deactivating redemption code: {code_id}")

    # Verify admin secret
    if admin_secret != configs.Admin.secret:
        logger.warning("Invalid admin secret key provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin secret key",
        )

    try:
        service = RedemptionService(db)
        code = await service.deactivate_code(code_id)

        await db.commit()

        logger.info(f"Deactivated redemption code: {code_id}")

        return RedemptionCodeResponse(
            id=code.id,
            code=code.code,
            amount=code.amount,
            max_usage=code.max_usage,
            current_usage=code.current_usage,
            is_active=code.is_active,
            expires_at=code.expires_at,
            description=code.description,
            created_at=code.created_at,
            updated_at=code.updated_at,
        )

    except ErrCodeError as e:
        await db.rollback()
        logger.error(f"Failed to deactivate redemption code: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error deactivating redemption code: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


# ==================== User Endpoints ====================
@router.post("/redeem", response_model=RedeemCodeResponse)
async def redeem_code(
    request: RedeemCodeRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Redeem a code to get virtual balance.

    Requires user authentication.

    Args:
        request: Redemption code
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        Redemption result with updated balance
    """
    user_id = current_user
    logger.info(f"User {user_id} attempting to redeem code: {request.code}")

    try:
        service = RedemptionService(db)
        wallet, history = await service.redeem_code(user_id, request.code)

        await db.commit()

        logger.info(f"User {user_id} successfully redeemed code {request.code}, credited: {history.amount}")

        return RedeemCodeResponse(
            success=True,
            amount_credited=history.amount,
            new_balance=wallet.virtual_balance,
            message=f"Successfully redeemed code! {history.amount} credits added to your balance.",
        )

    except ErrCodeError as e:
        await db.rollback()
        logger.warning(f"User {user_id} failed to redeem code {request.code}: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error redeeming code for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/wallet", response_model=UserWalletResponse)
async def get_user_wallet(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get current user's wallet information.

    Requires user authentication.

    Args:
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        User wallet information
    """
    user_id = current_user
    logger.info(f"User {user_id} fetching wallet information")

    try:
        service = RedemptionService(db)
        wallet = await service.get_user_wallet(user_id)

        return UserWalletResponse(
            user_id=wallet.user_id,
            virtual_balance=wallet.virtual_balance,
            total_credited=wallet.total_credited,
            total_consumed=wallet.total_consumed,
            created_at=wallet.created_at,
            updated_at=wallet.updated_at,
        )

    except Exception as e:
        logger.error(f"Error fetching wallet for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/history", response_model=list[RedemptionHistoryResponse])
async def get_redemption_history(
    limit: int = 100,
    offset: int = 0,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get current user's redemption history.

    Requires user authentication.

    Args:
        limit: Maximum number of records to return
        offset: Number of records to skip
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        List of redemption history records
    """
    user_id = current_user
    logger.info(f"User {user_id} fetching redemption history")

    try:
        service = RedemptionService(db)
        history = await service.get_user_redemption_history(user_id, limit, offset)

        return [
            RedemptionHistoryResponse(
                id=record.id,
                code_id=record.code_id,
                user_id=record.user_id,
                amount=record.amount,
                redeemed_at=record.redeemed_at,
            )
            for record in history
        ]

    except Exception as e:
        logger.error(f"Error fetching redemption history for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
