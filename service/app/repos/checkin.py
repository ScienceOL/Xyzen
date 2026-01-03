"""Check-in repository for managing daily check-in records."""

import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.checkin import CheckIn, CheckInCreate

logger = logging.getLogger(__name__)


# Check-in dates are normalized to start-of-day in China Standard Time (UTC+8).
# Monthly queries must use the same timezone boundaries, otherwise the first 8
# hours of a month (in CST) would be counted as the previous month (in UTC).
CHECKIN_TZ = timezone(timedelta(hours=8))


class CheckInRepository:
    """Check-in data access layer."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_check_in(self, check_in_data: CheckInCreate) -> CheckIn:
        """
        Create a new check-in record.
        This function does NOT commit the transaction, but it does flush the session.

        Args:
            check_in_data: The check-in data to create.

        Returns:
            The newly created CheckIn instance.
        """
        logger.debug(f"Creating check-in for user: {check_in_data.user_id}")

        check_in = CheckIn(**check_in_data.model_dump())
        self.db.add(check_in)
        await self.db.flush()
        await self.db.refresh(check_in)

        logger.info(
            f"Created check-in: {check_in.id}, user: {check_in.user_id}, "
            f"consecutive_days: {check_in.consecutive_days}, points: {check_in.points_awarded}"
        )
        return check_in

    async def get_check_in_by_user_and_date(self, user_id: str, check_in_date: datetime) -> CheckIn | None:
        """
        Get a check-in record for a specific user and date.

        Args:
            user_id: User ID to query.
            check_in_date: Date to query (should be normalized to start of day).

        Returns:
            CheckIn record if found, None otherwise.
        """
        logger.debug(f"Getting check-in for user: {user_id}, date: {check_in_date}")

        statement = select(CheckIn).where(
            col(CheckIn.user_id) == user_id,
            col(CheckIn.check_in_date) == check_in_date,
        )

        result = await self.db.exec(statement)
        check_in = result.first()

        if check_in:
            logger.debug(f"Found check-in: {check_in.id}")
        else:
            logger.debug(f"No check-in found for user: {user_id}, date: {check_in_date}")

        return check_in

    async def get_latest_check_in_by_user(self, user_id: str) -> CheckIn | None:
        """
        Get the most recent check-in record for a user.

        Args:
            user_id: User ID to query.

        Returns:
            The most recent CheckIn record if found, None otherwise.
        """
        logger.debug(f"Getting latest check-in for user: {user_id}")

        statement = (
            select(CheckIn).where(col(CheckIn.user_id) == user_id).order_by(col(CheckIn.check_in_date).desc()).limit(1)
        )

        result = await self.db.exec(statement)
        check_in = result.first()

        if check_in:
            logger.debug(f"Found latest check-in: {check_in.id}, date: {check_in.check_in_date}")
        else:
            logger.debug(f"No check-ins found for user: {user_id}")

        return check_in

    async def get_check_ins_by_user(
        self,
        user_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[CheckIn]:
        """
        Get check-in records for a user with pagination.

        Args:
            user_id: User ID to query.
            limit: Maximum number of records to return.
            offset: Number of records to skip.

        Returns:
            List of CheckIn records.
        """
        logger.debug(f"Getting check-ins for user: {user_id}, limit: {limit}, offset: {offset}")

        statement = (
            select(CheckIn)
            .where(col(CheckIn.user_id) == user_id)
            .order_by(col(CheckIn.check_in_date).desc())
            .limit(limit)
            .offset(offset)
        )

        result = await self.db.exec(statement)
        check_ins = result.all()

        logger.debug(f"Found {len(check_ins)} check-ins for user: {user_id}")
        return list(check_ins)

    async def get_check_ins_by_month(self, user_id: str, year: int, month: int) -> list[CheckIn]:
        """
        Get all check-in records for a user in a specific month.

        Args:
            user_id: User ID to query.
            year: Year to query.
            month: Month to query (1-12).

        Returns:
            List of CheckIn records for the specified month.
        """
        logger.debug(f"Getting check-ins for user: {user_id}, year: {year}, month: {month}")

        # Calculate start and end dates for the month in CHECKIN_TZ.
        start_date = datetime(year, month, 1, tzinfo=CHECKIN_TZ)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=CHECKIN_TZ)
        else:
            end_date = datetime(year, month + 1, 1, tzinfo=CHECKIN_TZ)

        statement = (
            select(CheckIn)
            .where(
                col(CheckIn.user_id) == user_id,
                col(CheckIn.check_in_date) >= start_date,
                col(CheckIn.check_in_date) < end_date,
            )
            .order_by(col(CheckIn.check_in_date).asc())
        )

        result = await self.db.exec(statement)
        check_ins = result.all()

        logger.debug(f"Found {len(check_ins)} check-ins for user: {user_id} in {year}-{month:02d}")
        return list(check_ins)

    async def count_check_ins_by_user(self, user_id: str) -> int:
        """
        Count total check-ins for a user.

        Args:
            user_id: User ID to query.

        Returns:
            Total count of check-ins.
        """
        from sqlalchemy import func

        statement = select(func.count(CheckIn.id)).where(col(CheckIn.user_id) == user_id)  # type: ignore

        result = await self.db.exec(statement)
        count = result.one()

        logger.debug(f"User {user_id} has {count} total check-ins")
        return count
