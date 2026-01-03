"""Check-in service for handling daily check-in logic and rewards."""

import logging
from datetime import datetime, timedelta, timezone

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCode, ErrCodeError
from app.core.redemption import RedemptionService
from app.models.checkin import CheckIn, CheckInCreate
from app.repos.checkin import CheckInRepository

logger = logging.getLogger(__name__)

# Define timezone for check-in (UTC+8 for China Standard Time)
CHECKIN_TZ = timezone(timedelta(hours=8))


class CheckInService:
    """Service layer for check-in operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.check_in_repo = CheckInRepository(db)
        self.redemption_service = RedemptionService(db)

    @staticmethod
    def normalize_date(dt: datetime) -> datetime:
        """
        Normalize a datetime to the start of the day in the check-in timezone.

        Args:
            dt: Datetime to normalize.

        Returns:
            Datetime normalized to 00:00:00 in check-in timezone.
        """
        # Convert to check-in timezone
        dt_tz = dt.astimezone(CHECKIN_TZ)
        # Normalize to start of day
        return dt_tz.replace(hour=0, minute=0, second=0, microsecond=0)

    @staticmethod
    def calculate_points(consecutive_days: int) -> int:
        """
        Calculate points to award based on consecutive check-in days.

        Rules:
        - Day 1: 10 points
        - Day 2: 20 points
        - Day 3: 30 points
        - Day 4: 40 points
        - Day 5+: 50 points

        Args:
            consecutive_days: Number of consecutive days (1-indexed).

        Returns:
            Points to award.
        """
        if consecutive_days <= 0:
            return 10
        elif consecutive_days == 1:
            return 10
        elif consecutive_days == 2:
            return 20
        elif consecutive_days == 3:
            return 30
        elif consecutive_days == 4:
            return 40
        else:
            # Day 5 and beyond: 50 points
            return 50

    async def check_in(self, user_id: str) -> tuple[CheckIn, int]:
        """
        Process a check-in for a user.

        This method:
        1. Checks if user has already checked in today
        2. Calculates consecutive days
        3. Determines points to award
        4. Creates check-in record
        5. Credits points to user wallet

        Args:
            user_id: User ID to check in.

        Returns:
            Tuple of (CheckIn record, new balance).

        Raises:
            ErrCodeError: If user has already checked in today.
        """
        now = datetime.now(CHECKIN_TZ)
        today = self.normalize_date(now)

        logger.info(f"Processing check-in for user: {user_id}")

        # Check if user has already checked in today
        existing_check_in = await self.check_in_repo.get_check_in_by_user_and_date(user_id, today)
        if existing_check_in:
            logger.warning(f"User {user_id} has already checked in today")
            # raise ErrCodeError(ErrCode.ALREADY_CHECKED_IN_TODAY, "您今天已经签到过了哦～")
            raise ErrCodeError(ErrCode.ALREADY_CHECKED_IN_TODAY)

        # Get latest check-in to calculate consecutive days
        latest_check_in = await self.check_in_repo.get_latest_check_in_by_user(user_id)

        consecutive_days = 1
        if latest_check_in:
            yesterday = today - timedelta(days=1)
            latest_date = self.normalize_date(latest_check_in.check_in_date)

            if latest_date == yesterday:
                # Consecutive check-in
                consecutive_days = latest_check_in.consecutive_days + 1
                logger.debug(f"User {user_id} consecutive check-in, days: {consecutive_days}")
            else:
                # Streak broken, reset to 1
                consecutive_days = 1
                logger.debug(f"User {user_id} check-in streak broken, resetting to 1")
        else:
            # First time check-in
            logger.debug(f"User {user_id} first time check-in")

        # Calculate points
        points = self.calculate_points(consecutive_days)
        logger.info(f"User {user_id} will receive {points} points for {consecutive_days} consecutive days")

        # Create check-in record
        check_in_data = CheckInCreate(
            user_id=user_id,
            check_in_date=today,
            consecutive_days=consecutive_days,
            points_awarded=points,
        )
        check_in = await self.check_in_repo.create_check_in(check_in_data)

        # Credit points to user wallet
        wallet = await self.redemption_service.credit_balance(user_id, points, "每日签到奖励")

        logger.info(
            f"Check-in completed for user {user_id}: "
            f"{consecutive_days} days, {points} points, new balance: {wallet.virtual_balance}"
        )

        return check_in, wallet.virtual_balance

    async def get_check_in_status(self, user_id: str) -> dict:
        """
        Get check-in status for a user.

        Returns:
            Dictionary containing:
            - checked_in_today: bool
            - consecutive_days: int
            - next_points: int (points for next check-in)
            - total_check_ins: int
        """
        now = datetime.now(CHECKIN_TZ)
        today = self.normalize_date(now)

        # Check if checked in today
        today_check_in = await self.check_in_repo.get_check_in_by_user_and_date(user_id, today)
        checked_in_today = today_check_in is not None

        # Get latest check-in for consecutive days
        latest_check_in = await self.check_in_repo.get_latest_check_in_by_user(user_id)

        consecutive_days = 0
        if latest_check_in:
            latest_date = self.normalize_date(latest_check_in.check_in_date)
            if latest_date == today:
                consecutive_days = latest_check_in.consecutive_days
            else:
                yesterday = today - timedelta(days=1)
                if latest_date == yesterday:
                    consecutive_days = latest_check_in.consecutive_days

        # Calculate next points
        next_consecutive_days = consecutive_days + 1 if checked_in_today else consecutive_days + 1
        next_points = self.calculate_points(next_consecutive_days)

        # Get total check-ins
        total_check_ins = await self.check_in_repo.count_check_ins_by_user(user_id)

        return {
            "checked_in_today": checked_in_today,
            "consecutive_days": consecutive_days,
            "next_points": next_points,
            "total_check_ins": total_check_ins,
        }

    async def get_monthly_check_ins(self, user_id: str, year: int, month: int) -> list[CheckIn]:
        """
        Get all check-in records for a user in a specific month.

        Args:
            user_id: User ID to query.
            year: Year to query.
            month: Month to query (1-12).

        Returns:
            List of CheckIn records.
        """
        logger.debug(f"Getting monthly check-ins for user: {user_id}, year: {year}, month: {month}")
        return await self.check_in_repo.get_check_ins_by_month(user_id, year, month)

    async def get_check_in_history(
        self,
        user_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[CheckIn]:
        """
        Get check-in history for a user with pagination.

        Args:
            user_id: User ID to query.
            limit: Maximum number of records to return.
            offset: Number of records to skip.

        Returns:
            List of CheckIn records.
        """
        logger.debug(f"Getting check-in history for user: {user_id}")
        return await self.check_in_repo.get_check_ins_by_user(user_id, limit, offset)
