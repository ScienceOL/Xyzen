"""Check-in API endpoints for daily sign-in rewards."""

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCodeError, handle_auth_error
from app.core.checkin import CheckInService
from app.infra.database import get_session as get_db_session
from app.middleware.auth import get_current_user
from app.repos.consume import ConsumeRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["check-in"])


# ==================== Request/Response Models ====================
class CheckInResponse(BaseModel):
    """Response model for successful check-in."""

    success: bool
    consecutive_days: int
    points_awarded: int
    new_balance: int
    message: str


class CheckInStatusResponse(BaseModel):
    """Response model for check-in status."""

    checked_in_today: bool
    consecutive_days: int
    next_points: int
    total_check_ins: int


class CheckInRecordResponse(BaseModel):
    """Response model for a check-in record."""

    id: UUID
    user_id: str
    check_in_date: datetime
    consecutive_days: int
    points_awarded: int
    created_at: datetime


class DayConsumptionResponse(BaseModel):
    """Response model for daily consumption statistics."""

    date: str
    total_amount: int
    total_tokens: int
    input_tokens: int
    output_tokens: int
    record_count: int
    tool_call_count: int = 0
    message: str | None = None
    by_tier: dict[str, "TierStats"] = {}


class TierStats(BaseModel):
    """Statistics for a model tier."""

    total_tokens: int
    input_tokens: int
    output_tokens: int
    total_amount: int
    record_count: int
    tool_call_count: int = 0


class ConsumptionRangeResponse(BaseModel):
    """Response model for consumption statistics over a date range."""

    daily: list[DayConsumptionResponse]
    by_tier: dict[str, TierStats]
    total_tool_call_count: int = 0


class UserConsumeRecordItem(BaseModel):
    """Response model for a single consume record item."""

    id: UUID
    biz_no: int | None
    amount: int
    scene: str | None
    model_tier: str | None
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    consume_state: str
    created_at: datetime


class UserConsumeRecordsPage(BaseModel):
    """Paginated response model for user consume records."""

    records: list[UserConsumeRecordItem]
    total: int
    limit: int
    offset: int


# ==================== User Endpoints ====================
@router.post("/check-in", response_model=CheckInResponse)
async def check_in(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Check in for today and receive points reward.

    Requires user authentication.

    Reward structure:
    - Day 1: 10 points
    - Day 2: 20 points
    - Day 3: 30 points
    - Day 4: 40 points
    - Day 5+: 50 points

    Consecutive days reset if a day is skipped.

    Args:
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        Check-in result with points awarded and new balance
    """
    user_id = current_user
    logger.info(f"User {user_id} attempting to check in")

    try:
        service = CheckInService(db)
        check_in, new_balance = await service.check_in(user_id)

        await db.commit()

        logger.info(
            f"User {user_id} checked in successfully: "
            f"{check_in.consecutive_days} days, {check_in.points_awarded} points"
        )

        # Generate friendly message based on consecutive days
        if check_in.consecutive_days == 1:
            message = f"签到成功！获得 {check_in.points_awarded} 积分，开始你的签到之旅吧～"
        elif check_in.consecutive_days <= 3:
            message = f"已连续签到 {check_in.consecutive_days} 天！获得 {check_in.points_awarded} 积分，继续加油哦～"
        elif check_in.consecutive_days == 4:
            message = f"太棒了！已连续签到 {check_in.consecutive_days} 天，获得 {check_in.points_awarded} 积分！明天就能达到最高奖励啦～"
        else:
            message = (
                f"厉害！已连续签到 {check_in.consecutive_days} 天，获得 {check_in.points_awarded} 积分！坚持就是胜利～"
            )

        return CheckInResponse(
            success=True,
            consecutive_days=check_in.consecutive_days,
            points_awarded=check_in.points_awarded,
            new_balance=new_balance,
            message=message,
        )

    except ErrCodeError as e:
        await db.rollback()
        logger.warning(f"User {user_id} check-in failed: {e}")
        raise handle_auth_error(e)
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during check-in for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/check-in/status", response_model=CheckInStatusResponse)
async def get_check_in_status(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get current check-in status for the user.

    Requires user authentication.

    Args:
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        Check-in status including consecutive days and next reward
    """
    user_id = current_user
    logger.info(f"User {user_id} fetching check-in status")

    try:
        service = CheckInService(db)
        status_data = await service.get_check_in_status(user_id)

        return CheckInStatusResponse(**status_data)

    except Exception as e:
        logger.error(f"Error fetching check-in status for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/check-in/history", response_model=list[CheckInRecordResponse])
async def get_check_in_history(
    limit: int = 30,
    offset: int = 0,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get check-in history for the current user.

    Requires user authentication.

    Args:
        limit: Maximum number of records to return (default: 30)
        offset: Number of records to skip (default: 0)
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        List of check-in records
    """
    user_id = current_user
    logger.info(f"User {user_id} fetching check-in history")

    try:
        service = CheckInService(db)
        history = await service.get_check_in_history(user_id, limit, offset)

        return [
            CheckInRecordResponse(
                id=record.id,
                user_id=record.user_id,
                check_in_date=record.check_in_date,
                consecutive_days=record.consecutive_days,
                points_awarded=record.points_awarded,
                created_at=record.created_at,
            )
            for record in history
        ]

    except Exception as e:
        logger.error(f"Error fetching check-in history for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/check-in/monthly/{year}/{month}", response_model=list[CheckInRecordResponse])
async def get_monthly_check_ins(
    year: int,
    month: int,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get all check-in records for a specific month.

    Requires user authentication.

    Args:
        year: Year (2020-2100)
        month: Month (1-12)
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        List of check-in records for the specified month
    """
    # Validate year and month
    if not (2020 <= year <= 2100):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Year must be between 2020 and 2100",
        )
    if not (1 <= month <= 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be between 1 and 12",
        )
    user_id = current_user
    logger.info(f"User {user_id} fetching monthly check-ins for {year}-{month:02d}")

    try:
        service = CheckInService(db)
        records = await service.get_monthly_check_ins(user_id, year, month)

        return [
            CheckInRecordResponse(
                id=record.id,
                user_id=record.user_id,
                check_in_date=record.check_in_date,
                consecutive_days=record.consecutive_days,
                points_awarded=record.points_awarded,
                created_at=record.created_at,
            )
            for record in records
        ]

    except Exception as e:
        logger.error(f"Error fetching monthly check-ins for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/check-in/consumption/{date}", response_model=DayConsumptionResponse)
async def get_day_consumption(
    date: str,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get consumption statistics for a specific day.

    Requires user authentication.

    Args:
        date: Date in YYYY-MM-DD format
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        Daily consumption statistics including tokens and points
    """
    user_id = current_user
    logger.info(f"User {user_id} fetching consumption for date: {date}")

    try:
        # Validate date format
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD",
            )

        consume_repo = ConsumeRepository(db)
        stats = await consume_repo.get_daily_token_stats(date, user_id)

        # Generate friendly message based on consumption
        message = None
        if stats["record_count"] == 0:
            message = "这一天还没有任何使用记录呢，快来体验吧～"
        elif stats["total_amount"] < 50:
            message = f"这天消耗了 {stats['total_amount']} 积分，轻度使用很不错哦～"
        elif stats["total_amount"] < 200:
            message = f"这天消耗了 {stats['total_amount']} 积分，使用量挺活跃的呢～"
        else:
            message = f"哇！这天消耗了 {stats['total_amount']} 积分，看来你很喜欢我们的服务～"

        return DayConsumptionResponse(
            date=stats["date"],
            total_amount=stats["total_amount"],
            total_tokens=stats["total_tokens"],
            input_tokens=stats["input_tokens"],
            output_tokens=stats["output_tokens"],
            record_count=stats["record_count"],
            message=message,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching day consumption for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/consumption/range", response_model=ConsumptionRangeResponse)
async def get_consumption_range(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    tz: str = Query(default="Asia/Shanghai", description="Timezone name (IANA)"),
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get aggregated consumption statistics for the current user over a date range.

    Returns daily breakdown, model tier distribution, and scene distribution.

    Args:
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        tz: Timezone name (IANA), defaults to Asia/Shanghai
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        Consumption range statistics
    """
    user_id = current_user
    logger.info(f"User {user_id} fetching consumption range from {start_date} to {end_date}")

    try:
        try:
            datetime.strptime(start_date, "%Y-%m-%d")
            datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD",
            )

        consume_repo = ConsumeRepository(db)
        data = await consume_repo.get_user_consumption_range(user_id, start_date, end_date, tz)

        daily_responses = [
            DayConsumptionResponse(
                date=day["date"],
                total_amount=day["total_amount"],
                total_tokens=day["total_tokens"],
                input_tokens=day["input_tokens"],
                output_tokens=day["output_tokens"],
                record_count=day["record_count"],
                tool_call_count=day.get("tool_call_count", 0),
                by_tier=day.get("by_tier", {}),
            )
            for day in data["daily"]
        ]

        total_tool_call_count = sum(d.tool_call_count for d in daily_responses)

        return ConsumptionRangeResponse(
            daily=daily_responses,
            by_tier=data["by_tier"],
            total_tool_call_count=total_tool_call_count,
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching consumption range for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/consumption/records", response_model=UserConsumeRecordsPage)
async def get_consumption_records(
    limit: int = Query(default=20, ge=1, le=100, description="Number of records per page"),
    offset: int = Query(default=0, ge=0, description="Number of records to skip"),
    start_date: str | None = Query(default=None, description="Start date filter (YYYY-MM-DD)"),
    end_date: str | None = Query(default=None, description="End date filter (YYYY-MM-DD)"),
    tz: str = Query(default="Asia/Shanghai", description="Timezone name (IANA)"),
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get paginated consume records for the current user.

    Args:
        limit: Number of records per page (1-100, default 20)
        offset: Records to skip (default 0)
        start_date: Optional start date filter
        end_date: Optional end date filter
        tz: Timezone name (IANA), defaults to Asia/Shanghai
        current_user: Current authenticated user ID
        db: Database session

    Returns:
        Paginated list of consume records with total count
    """
    user_id = current_user
    logger.info(f"User {user_id} fetching consumption records, limit={limit}, offset={offset}")

    try:
        if start_date:
            try:
                datetime.strptime(start_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid start_date format. Use YYYY-MM-DD",
                )
        if end_date:
            try:
                datetime.strptime(end_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid end_date format. Use YYYY-MM-DD",
                )

        consume_repo = ConsumeRepository(db)

        total = await consume_repo.count_consume_records_by_user_range(user_id, start_date, end_date, tz)

        user_records = await consume_repo.list_consume_records_by_user_range(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            tz=tz,
            limit=limit,
            offset=offset,
        )

        record_items = [
            UserConsumeRecordItem(
                id=r.id,
                biz_no=r.biz_no,
                amount=r.amount,
                scene=r.scene,
                model_tier=r.model_tier,
                input_tokens=r.input_tokens,
                output_tokens=r.output_tokens,
                total_tokens=r.total_tokens,
                consume_state=r.consume_state,
                created_at=r.created_at,
            )
            for r in user_records
        ]

        return UserConsumeRecordsPage(
            records=record_items,
            total=total,
            limit=limit,
            offset=offset,
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching consumption records for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
