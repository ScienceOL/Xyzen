import logging
from typing import Any
from uuid import UUID

from models.consume import (
    ConsumeRecord,
    ConsumeRecordCreate,
    ConsumeRecordUpdate,
    UserConsumeSummary,
    UserConsumeSummaryCreate,
    UserConsumeSummaryUpdate,
)
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)


class ConsumeRepository:
    """Consumption record data access layer"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_consume_record(self, record_data: ConsumeRecordCreate, user_id: str) -> ConsumeRecord:
        """
        Creates a new consume record.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the record object is populated with DB-defaults before being returned.

        Args:
            record_data: The Pydantic model containing the data for the new record.
            user_id: The user ID (from authentication).

        Returns:
            The newly created ConsumeRecord instance.
        """
        logger.debug(f"Creating new consume record for user_id: {user_id}")

        record_dict = record_data.model_dump()
        record_dict["user_id"] = user_id

        record = ConsumeRecord(**record_dict)

        self.db.add(record)
        await self.db.flush()
        await self.db.refresh(record)

        logger.info(f"Created consume record: {record.id} for user {user_id}, amount: {record.amount}")
        return record

    async def get_consume_record_by_id(self, record_id: UUID) -> ConsumeRecord | None:
        """
        Fetches a consume record by its ID.

        Args:
            record_id: The UUID of the record to fetch.

        Returns:
            The ConsumeRecord, or None if not found.
        """
        logger.debug(f"Fetching consume record with id: {record_id}")
        result = await self.db.exec(select(ConsumeRecord).where(ConsumeRecord.id == record_id))
        return result.one_or_none()

    async def get_consume_record_by_biz_no(self, biz_no: int) -> ConsumeRecord | None:
        """
        Fetches a consume record by business number (for idempotency checks).

        Args:
            biz_no: The business number to search for.

        Returns:
            The ConsumeRecord, or None if not found.
        """
        logger.debug(f"Fetching consume record with biz_no: {biz_no}")
        result = await self.db.exec(select(ConsumeRecord).where(ConsumeRecord.biz_no == biz_no))
        return result.one_or_none()

    async def update_consume_record(self, record_id: UUID, record_data: ConsumeRecordUpdate) -> ConsumeRecord | None:
        """
        Updates an existing consume record.
        This function does NOT commit the transaction.

        Args:
            record_id: The UUID of the record to update.
            record_data: The Pydantic model containing the update data.

        Returns:
            The updated ConsumeRecord instance, or None if not found.
        """
        logger.debug(f"Updating consume record with id: {record_id}")
        record = await self.db.get(ConsumeRecord, record_id)
        if not record:
            return None

        # Only update fields that are not None to avoid null constraint violations
        update_data = record_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(record, key):
                setattr(record, key, value)

        self.db.add(record)
        await self.db.flush()
        await self.db.refresh(record)

        logger.info(f"Updated consume record: {record.id}")
        return record

    async def list_consume_records_by_user(
        self, user_id: str, limit: int = 100, offset: int = 0
    ) -> list[ConsumeRecord]:
        """
        Get list of consumption records for a user.

        Args:
            user_id: The user ID to fetch records for.
            limit: Maximum number of records to return.
            offset: Number of records to skip.

        Returns:
            List of ConsumeRecord instances ordered by creation time (desc).
        """
        logger.debug(f"Fetching consume records for user_id: {user_id}, limit: {limit}, offset: {offset}")
        result = await self.db.exec(
            select(ConsumeRecord)
            .where(ConsumeRecord.user_id == user_id)
            .order_by(ConsumeRecord.created_at.desc())  # type: ignore
            .limit(limit)
            .offset(offset)
        )
        records = list(result.all())
        logger.debug(f"Found {len(records)} consume records for user {user_id}")
        return records

    async def list_consume_records_by_session(self, session_id: UUID) -> list[ConsumeRecord]:
        """
        Get list of consumption records for a session.

        Args:
            session_id: The session ID to fetch records for.

        Returns:
            List of ConsumeRecord instances ordered by creation time (desc).
        """
        logger.debug(f"Fetching consume records for session_id: {session_id}")
        result = await self.db.exec(
            select(ConsumeRecord)
            .where(ConsumeRecord.session_id == session_id)
            .order_by(ConsumeRecord.created_at.desc())  # type: ignore
        )
        records = list(result.all())
        logger.debug(f"Found {len(records)} consume records for session {session_id}")
        return records

    async def list_consume_records_by_topic(self, topic_id: UUID) -> list[ConsumeRecord]:
        """
        Get list of consumption records for a topic.

        Args:
            topic_id: The topic ID to fetch records for.

        Returns:
            List of ConsumeRecord instances ordered by creation time (desc).
        """
        logger.debug(f"Fetching consume records for topic_id: {topic_id}")
        result = await self.db.exec(
            select(ConsumeRecord).where(ConsumeRecord.topic_id == topic_id).order_by(ConsumeRecord.created_at.desc())  # type: ignore
        )
        records = list(result.all())
        logger.debug(f"Found {len(records)} consume records for topic {topic_id}")
        return records

    async def get_user_consume_summary(self, user_id: str) -> UserConsumeSummary | None:
        """Get user consumption summary"""
        logger.debug(f"Getting user consume summary for user_id: {user_id}")
        result = await self.db.exec(select(UserConsumeSummary).where(UserConsumeSummary.user_id == user_id))
        summary = result.one_or_none()
        logger.debug(f"Found user consume summary for user {user_id}: {'Yes' if summary else 'No'}")
        return summary

    async def create_user_consume_summary(
        self, summary_data: UserConsumeSummaryCreate, user_id: str
    ) -> UserConsumeSummary:
        """
        Creates a new user consume summary.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the summary object is populated with DB-defaults before being returned.

        Args:
            summary_data: The Pydantic model containing the data for the new summary.
            user_id: The user ID (from authentication).

        Returns:
            The newly created UserConsumeSummary instance.
        """
        logger.debug(f"Creating new user consume summary for user_id: {user_id}")

        summary_dict = summary_data.model_dump()
        summary_dict["user_id"] = user_id
        summary = UserConsumeSummary(**summary_dict)

        self.db.add(summary)
        await self.db.flush()
        await self.db.refresh(summary)

        logger.info(f"Created user consume summary for user {user_id}")
        return summary

    async def update_user_consume_summary(
        self, user_id: str, summary_data: UserConsumeSummaryUpdate
    ) -> UserConsumeSummary | None:
        """
        Updates an existing user consume summary.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID to update summary for.
            summary_data: The Pydantic model containing the update data.

        Returns:
            The updated UserConsumeSummary instance, or None if not found.
        """
        logger.debug(f"Updating user consume summary for user_id: {user_id}")

        summary = await self.get_user_consume_summary(user_id)
        if not summary:
            return None

        # Only update fields that are not None to avoid null constraint violations
        update_data = summary_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(summary, key):
                setattr(summary, key, value)

        self.db.add(summary)
        await self.db.flush()
        await self.db.refresh(summary)

        logger.info(f"Updated user consume summary for user {user_id}")
        return summary

    async def increment_user_consume(
        self,
        user_id: str,
        auth_provider: str,
        amount: int,
        consume_state: str = "pending",
    ) -> UserConsumeSummary:
        """
        Increments user consumption statistics.
        This function does NOT commit the transaction.

        Args:
            user_id: User ID
            auth_provider: Authentication provider
            amount: Consumption amount
            consume_state: Consumption state

        Returns:
            Updated user consumption summary
        """
        logger.debug(f"Incrementing user consume for user_id: {user_id}, amount: {amount}, state: {consume_state}")
        summary = await self.get_user_consume_summary(user_id)

        success = 1 if consume_state == "success" else 0
        failed = 1 if consume_state == "failed" else 0

        summary_data: UserConsumeSummaryCreate | UserConsumeSummaryUpdate

        if summary is None:
            # Create new summary using the new pattern
            summary_data = UserConsumeSummaryCreate(
                user_id=user_id,
                auth_provider=auth_provider,
                total_amount=amount,
                total_count=1,
                success_count=success,
                failed_count=failed,
            )
            return await self.create_user_consume_summary(summary_data, user_id)
        else:
            # Update existing summary using the new pattern
            summary_data = UserConsumeSummaryUpdate(
                total_amount=summary.total_amount + amount,
                total_count=summary.total_count + 1,
                success_count=summary.success_count + success,
                failed_count=summary.failed_count + failed,
            )
            updated_summary = await self.update_user_consume_summary(user_id, summary_data)
            # This should not happen since we know the summary exists
            return updated_summary or summary

    async def get_total_consume_by_user(self, user_id: str) -> int:
        """Get user's total consumption amount"""
        logger.debug(f"Getting total consumption amount for user_id: {user_id}")
        result = await self.db.exec(select(func.sum(ConsumeRecord.amount)).where(ConsumeRecord.user_id == user_id))
        total = result.one()
        logger.debug(f"Total consumption amount for user {user_id}: {total or 0}")
        return total or 0

    async def get_consume_count_by_user(self, user_id: str) -> int:
        """Get user's consumption count"""
        logger.debug(f"Getting consumption count for user_id: {user_id}")
        result = await self.db.exec(
            select(func.count()).select_from(ConsumeRecord).where(ConsumeRecord.user_id == user_id)
        )
        count = result.one() or 0
        logger.debug(f"Consumption count for user {user_id}: {count}")
        return count

    async def get_remote_consume_success_count(self, user_id: str) -> int:
        """Get user's successful remote consumption count (records with success state)"""
        logger.debug(f"Getting successful consumption count for user_id: {user_id}")
        result = await self.db.exec(
            select(func.count())
            .select_from(ConsumeRecord)
            .where(
                ConsumeRecord.user_id == user_id,
                ConsumeRecord.consume_state == "success",
            )
        )
        count = result.one() or 0
        logger.debug(f"Successful consumption count for user {user_id}: {count}")
        return count

    async def get_daily_token_stats(self, date: str | None = None) -> dict[str, Any]:
        """
        Get daily token consumption statistics.

        Args:
            date: Date in YYYY-MM-DD format. If None, uses today.

        Returns:
            Dictionary with total_tokens, input_tokens, output_tokens, total_amount
        """
        from datetime import datetime, timezone

        if date:
            # Parse the provided date
            target_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        else:
            # Use today
            target_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        # Get start and end of day
        start_of_day = target_date
        end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)

        logger.debug(f"Getting daily token stats for {start_of_day} to {end_of_day}")

        # Query for sum of tokens and amount
        stmt = select(
            func.coalesce(func.sum(ConsumeRecord.total_tokens), 0).label("total_tokens"),  # type: ignore
            func.coalesce(func.sum(ConsumeRecord.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(ConsumeRecord.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(ConsumeRecord.amount), 0).label("total_amount"),
            func.count().label("record_count"),  #
        ).where(
            ConsumeRecord.created_at >= start_of_day,
            ConsumeRecord.created_at <= end_of_day,
        )

        result = await self.db.exec(stmt)  # type: ignore

        row = result.one()
        stats: dict[str, Any] = {
            "date": start_of_day.strftime("%Y-%m-%d"),
            "total_tokens": int(row.total_tokens),  # type: ignore
            "input_tokens": int(row.input_tokens),  # type: ignore
            "output_tokens": int(row.output_tokens),  # type: ignore
            "total_amount": int(row.total_amount),  # type: ignore
            "record_count": int(row.record_count),  # type: ignore
        }

        logger.debug(f"Daily token stats: {stats}")
        return stats

    async def get_top_users_by_consumption(self, limit: int = 20) -> list[dict[str, Any]]:
        """
        Get top users by consumption amount.

        Args:
            limit: Maximum number of users to return

        Returns:
            List of dictionaries with user_id, auth_provider, total_amount, total_count, etc.
        """
        logger.debug(f"Getting top {limit} users by consumption")

        result = await self.db.exec(
            select(UserConsumeSummary)
            .order_by(UserConsumeSummary.total_amount.desc())  # type: ignore
            .limit(limit)
        )

        summaries = list(result.all())

        users: list[dict[str, Any]] = [
            {
                "user_id": summary.user_id,
                "auth_provider": summary.auth_provider,
                "total_amount": summary.total_amount,
                "total_count": summary.total_count,
                "success_count": summary.success_count,
                "failed_count": summary.failed_count,
            }
            for summary in summaries
        ]

        logger.debug(f"Found {len(users)} top users")
        return users

    async def list_all_consume_records(
        self, start_date: str | None = None, end_date: str | None = None, limit: int = 10000
    ) -> list[ConsumeRecord]:
        """
        Get all consumption records with optional date filtering.

        Args:
            start_date: Start date in YYYY-MM-DD format (optional)
            end_date: End date in YYYY-MM-DD format (optional)
            limit: Maximum number of records to return (default: 10000)

        Returns:
            List of ConsumeRecord instances ordered by creation time (asc)
        """
        from datetime import datetime, timezone

        logger.debug(f"Fetching consume records from {start_date} to {end_date}, limit: {limit}")

        query = select(ConsumeRecord)

        # Apply date filters if provided
        if start_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query = query.where(ConsumeRecord.created_at >= start_dt)

        if end_date:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)  # noqa: E501
            query = query.where(ConsumeRecord.created_at <= end_dt)

        # Order by creation time ascending for chronological trend analysis
        query = query.order_by(ConsumeRecord.created_at.asc()).limit(limit)  # type: ignore

        result = await self.db.exec(query)
        records = list(result.all())

        logger.debug(f"Found {len(records)} consume records")
        return records
        return records
        return records
        return records
        return records
        return records
        return records
        return records
