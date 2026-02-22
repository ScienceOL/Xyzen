import logging
from datetime import datetime
from typing import Any, cast
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import case, func, update
from sqlalchemy import select as sa_select
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.consume import (
    ConsumeRecord,
    ConsumeRecordCreate,
    ConsumeRecordUpdate,
    UserConsumeSummary,
    UserConsumeSummaryCreate,
    UserConsumeSummaryUpdate,
)
from app.utils.parser import parse_date_end, parse_date_range, parse_date_start

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
        """Fetches a consume record by its ID."""
        logger.debug(f"Fetching consume record with id: {record_id}")
        result = await self.db.exec(select(ConsumeRecord).where(ConsumeRecord.id == record_id))
        return result.one_or_none()

    async def update_consume_record(self, record_id: UUID, record_data: ConsumeRecordUpdate) -> ConsumeRecord | None:
        """
        Updates an existing consume record.
        This function does NOT commit the transaction.
        """
        logger.debug(f"Updating consume record with id: {record_id}")
        record = await self.db.get(ConsumeRecord, record_id)
        if not record:
            return None

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
        """Get list of consumption records for a user."""
        logger.debug(f"Fetching consume records for user_id: {user_id}, limit: {limit}, offset: {offset}")
        result = await self.db.exec(
            select(ConsumeRecord)
            .where(ConsumeRecord.user_id == user_id)
            .order_by(col(ConsumeRecord.created_at).desc())
            .limit(limit)
            .offset(offset)
        )
        records = list(result.all())
        logger.debug(f"Found {len(records)} consume records for user {user_id}")
        return records

    async def list_consume_records_by_session(self, session_id: UUID) -> list[ConsumeRecord]:
        """Get list of consumption records for a session."""
        logger.debug(f"Fetching consume records for session_id: {session_id}")
        result = await self.db.exec(
            select(ConsumeRecord)
            .where(ConsumeRecord.session_id == session_id)
            .order_by(col(ConsumeRecord.created_at).desc())
        )
        records = list(result.all())
        logger.debug(f"Found {len(records)} consume records for session {session_id}")
        return records

    async def list_consume_records_by_topic(self, topic_id: UUID) -> list[ConsumeRecord]:
        """Get list of consumption records for a topic."""
        logger.debug(f"Fetching consume records for topic_id: {topic_id}")
        result = await self.db.exec(
            select(ConsumeRecord)
            .where(ConsumeRecord.topic_id == topic_id)
            .order_by(col(ConsumeRecord.created_at).desc())
        )
        records = list(result.all())
        logger.debug(f"Found {len(records)} consume records for topic {topic_id}")
        return records

    # ------------------------------------------------------------------
    # Settlement queries
    # ------------------------------------------------------------------

    async def list_records_for_settlement(
        self,
        session_id: UUID,
        topic_id: UUID,
        message_id: UUID | None,
        consume_state: str = "pending",
    ) -> list[ConsumeRecord]:
        """Query pending ConsumeRecords for settlement.

        Uses session_id + topic_id scope with an OR on message_id so that
        records whose message_id is still NULL (tool response arrived before
        STREAMING_START) are not silently skipped.
        """
        from sqlalchemy import or_

        stmt = select(ConsumeRecord).where(
            ConsumeRecord.session_id == session_id,
            ConsumeRecord.topic_id == topic_id,
            ConsumeRecord.consume_state == consume_state,
        )
        if message_id:
            stmt = stmt.where(
                or_(
                    col(ConsumeRecord.message_id) == message_id,
                    col(ConsumeRecord.message_id).is_(None),
                )
            )
        result = await self.db.exec(stmt)
        return list(result.all())

    async def bulk_update_consume_state(
        self,
        record_ids: list[UUID],
        consume_state: str,
    ) -> None:
        """Batch-update consume_state for a list of record IDs."""
        if not record_ids:
            return
        stmt = update(ConsumeRecord).where(col(ConsumeRecord.id).in_(record_ids)).values(consume_state=consume_state)
        await self.db.exec(stmt)
        await self.db.flush()
        logger.info("Bulk-updated %d records to consume_state=%s", len(record_ids), consume_state)

    async def list_records_for_exception_settlement(
        self,
        user_id: str,
        session_id: UUID,
        topic_id: UUID,
        since: datetime,
    ) -> list[ConsumeRecord]:
        """Query pending ConsumeRecords for the exception-path settlement."""
        stmt = select(ConsumeRecord).where(
            ConsumeRecord.user_id == user_id,
            ConsumeRecord.session_id == session_id,
            ConsumeRecord.topic_id == topic_id,
            ConsumeRecord.consume_state == "pending",
            ConsumeRecord.created_at >= since,
        )
        result = await self.db.exec(stmt)
        return list(result.all())

    # ------------------------------------------------------------------
    # User consume summary
    # ------------------------------------------------------------------

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
        """Creates a new user consume summary."""
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
        """Updates an existing user consume summary."""
        logger.debug(f"Updating user consume summary for user_id: {user_id}")

        summary = await self.get_user_consume_summary(user_id)
        if not summary:
            return None

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
        """Increments user consumption statistics."""
        logger.debug(f"Incrementing user consume for user_id: {user_id}, amount: {amount}, state: {consume_state}")
        summary = await self.get_user_consume_summary(user_id)

        success = 1 if consume_state == "success" else 0
        failed = 1 if consume_state == "failed" else 0

        summary_data: UserConsumeSummaryCreate | UserConsumeSummaryUpdate

        if summary is None:
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
            summary_data = UserConsumeSummaryUpdate(
                total_amount=summary.total_amount + amount,
                total_count=summary.total_count + 1,
                success_count=summary.success_count + success,
                failed_count=summary.failed_count + failed,
            )
            updated_summary = await self.update_user_consume_summary(user_id, summary_data)
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

    async def get_daily_token_stats(
        self, date_str: str, user_id: str | None = None, tz: str | None = None
    ) -> dict[str, Any]:
        """Get token consumption statistics for a specific day."""
        tz_name = tz or "UTC"

        logger.debug(f"Getting daily token stats for date: {date_str}, user_id: {user_id}, tz: {tz_name}")

        date_expr = func.to_char(func.timezone(tz_name, ConsumeRecord.created_at), "YYYY-MM-DD")

        stmt = select(
            func.coalesce(func.sum(ConsumeRecord.total_tokens), 0).label("total_tokens"),  # type: ignore
            func.coalesce(func.sum(ConsumeRecord.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(ConsumeRecord.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(ConsumeRecord.amount), 0).label("total_amount"),
            func.coalesce(
                func.sum(case((col(ConsumeRecord.record_type) == "llm", 1), else_=0)),
                0,
            ).label("record_count"),
            func.coalesce(
                func.sum(
                    case(
                        (col(ConsumeRecord.record_type) == "tool_call", 1),
                        else_=0,
                    )
                ),
                0,
            ).label("tool_call_count"),
        ).where(date_expr == date_str)

        if user_id:
            stmt = stmt.where(ConsumeRecord.user_id == user_id)

        result = await self.db.exec(stmt)

        row = result.one()
        stats: dict[str, Any] = {
            "date": date_str,
            "total_tokens": int(row.total_tokens),
            "input_tokens": int(row.input_tokens),
            "output_tokens": int(row.output_tokens),
            "total_amount": int(row.total_amount),
            "record_count": int(row.record_count),
            "tool_call_count": int(row.tool_call_count),
        }

        logger.debug(f"Daily token stats: {stats}")
        return stats

    async def get_top_users_by_consumption(self, limit: int = 20) -> list[dict[str, Any]]:
        """Get top users by consumption amount."""
        logger.debug(f"Getting top {limit} users by consumption")

        result = await self.db.exec(
            select(UserConsumeSummary).order_by(UserConsumeSummary.total_amount.desc()).limit(limit)
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
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        tz: str | None = None,
        limit: int = 10000,
        offset: int = 0,
    ) -> list[ConsumeRecord]:
        """Get all consumption records with optional date filtering."""
        from datetime import datetime, timezone

        logger.debug(f"Fetching consume records from {start_date} to {end_date}, limit: {limit}, offset: {offset}")

        query = select(ConsumeRecord)

        zone = ZoneInfo("UTC")
        if tz:
            try:
                zone = ZoneInfo(tz)
            except ZoneInfoNotFoundError as e:
                raise ValueError(f"Invalid timezone: {tz}") from e

        if start_date:
            start_local = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=zone)
            start_dt = start_local.astimezone(timezone.utc)
            query = query.where(ConsumeRecord.created_at >= start_dt)

        if end_date:
            end_local = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, microsecond=999999, tzinfo=zone
            )
            end_dt = end_local.astimezone(timezone.utc)
            query = query.where(ConsumeRecord.created_at <= end_dt)

        query = query.order_by(ConsumeRecord.created_at.asc()).offset(offset).limit(limit)

        result = await self.db.exec(query)
        records = list(result.all())

        logger.debug(f"Found {len(records)} consume records")
        return records

    async def get_user_consumption_range(
        self,
        user_id: str,
        start_date: str,
        end_date: str,
        tz: str = "Asia/Shanghai",
        user_subscription_tier: str = "standard",
    ) -> dict[str, Any]:
        """Get aggregated consumption statistics for a user over a date range."""
        logger.debug(f"Getting consumption range for user {user_id} from {start_date} to {end_date}, tz: {tz}")

        start_utc, end_utc, _zone = parse_date_range(start_date, end_date, tz)
        tz_name = tz

        daily: dict[str, dict[str, Any]] = {}

        def _ensure_day(d: str) -> dict[str, Any]:
            if d not in daily:
                daily[d] = {
                    "date": d,
                    "total_tokens": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_amount": 0,
                    "record_count": 0,
                    "tool_call_count": 0,
                    "by_tier": {},
                }
            return daily[d]

        base_filter = (
            col(ConsumeRecord.user_id) == user_id,
            col(ConsumeRecord.created_at) >= start_utc,
            col(ConsumeRecord.created_at) <= end_utc,
        )

        date_expr = func.to_char(func.timezone(tz_name, ConsumeRecord.created_at), "YYYY-MM-DD")
        tier_expr = func.coalesce(col(ConsumeRecord.model_tier), "standard")
        day_tier_stmt = (
            sa_select(
                date_expr.label("date"),
                cast(Any, tier_expr.label("tier")),
                func.coalesce(func.sum(ConsumeRecord.total_tokens), 0).label("total_tokens"),
                func.coalesce(func.sum(ConsumeRecord.input_tokens), 0).label("input_tokens"),
                func.coalesce(func.sum(ConsumeRecord.output_tokens), 0).label("output_tokens"),
                func.coalesce(func.sum(ConsumeRecord.amount), 0).label("total_amount"),
                func.coalesce(
                    func.sum(case((col(ConsumeRecord.record_type) == "llm", 1), else_=0)),
                    0,
                ).label("record_count"),
                func.coalesce(
                    func.sum(
                        case(
                            (col(ConsumeRecord.record_type) == "tool_call", 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("tool_call_count"),
            )
            .where(*base_filter)
            .group_by(date_expr, tier_expr)
        )
        day_tier_rows = (await self.db.exec(cast(Any, day_tier_stmt))).all()

        by_tier: dict[str, dict[str, int]] = {}

        KNOWN_TIERS = {"lite", "standard", "pro", "ultra"}

        for row in day_tier_rows:
            date_str = str(row.date)
            raw_tier = str(row.tier) if row.tier is not None else user_subscription_tier
            tier_key = raw_tier if raw_tier in KNOWN_TIERS else user_subscription_tier

            day = _ensure_day(date_str)
            day["total_tokens"] += int(row.total_tokens)
            day["input_tokens"] += int(row.input_tokens)
            day["output_tokens"] += int(row.output_tokens)
            day["total_amount"] += int(row.total_amount)
            day["record_count"] += int(row.record_count)
            day["tool_call_count"] += int(row.tool_call_count)

            if tier_key not in by_tier:
                by_tier[tier_key] = {
                    "total_tokens": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_amount": 0,
                    "record_count": 0,
                    "tool_call_count": 0,
                }

            by_tier[tier_key]["total_tokens"] += int(row.total_tokens)
            by_tier[tier_key]["input_tokens"] += int(row.input_tokens)
            by_tier[tier_key]["output_tokens"] += int(row.output_tokens)
            by_tier[tier_key]["total_amount"] += int(row.total_amount)
            by_tier[tier_key]["record_count"] += int(row.record_count)
            by_tier[tier_key]["tool_call_count"] += int(row.tool_call_count)

            if tier_key not in day["by_tier"]:
                day["by_tier"][tier_key] = {
                    "total_tokens": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_amount": 0,
                    "record_count": 0,
                    "tool_call_count": 0,
                }

            day["by_tier"][tier_key]["total_tokens"] += int(row.total_tokens)
            day["by_tier"][tier_key]["input_tokens"] += int(row.input_tokens)
            day["by_tier"][tier_key]["output_tokens"] += int(row.output_tokens)
            day["by_tier"][tier_key]["total_amount"] += int(row.total_amount)
            day["by_tier"][tier_key]["record_count"] += int(row.record_count)
            day["by_tier"][tier_key]["tool_call_count"] += int(row.tool_call_count)

        result_dict: dict[str, Any] = {
            "daily": [daily[d] for d in sorted(daily.keys())],
            "by_tier": by_tier,
        }
        logger.debug(f"Consumption range: {len(result_dict['daily'])} days, {len(by_tier)} tiers")
        return result_dict

    async def list_consume_records_by_user_range(
        self,
        user_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
        tz: str = "Asia/Shanghai",
        limit: int = 20,
        offset: int = 0,
    ) -> list[ConsumeRecord]:
        """Get paginated consume records for a user, optionally filtered by date range."""
        try:
            ZoneInfo(tz)
        except ZoneInfoNotFoundError as e:
            raise ValueError(f"Invalid timezone: {tz}") from e

        stmt = (
            select(ConsumeRecord).where(ConsumeRecord.user_id == user_id).order_by(col(ConsumeRecord.created_at).desc())
        )

        if start_date:
            start_utc = parse_date_start(start_date, tz)
            stmt = stmt.where(ConsumeRecord.created_at >= start_utc)

        if end_date:
            end_utc = parse_date_end(end_date, tz)
            stmt = stmt.where(ConsumeRecord.created_at <= end_utc)

        stmt = stmt.offset(offset).limit(limit)
        result = await self.db.exec(stmt)
        records = list(result.all())
        logger.debug(f"Found {len(records)} records for user {user_id} in range")
        return records

    async def count_consume_records_by_user_range(
        self,
        user_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
        tz: str = "Asia/Shanghai",
    ) -> int:
        """Count consume records for a user, optionally filtered by date range."""
        try:
            ZoneInfo(tz)
        except ZoneInfoNotFoundError as e:
            raise ValueError(f"Invalid timezone: {tz}") from e

        stmt = select(func.count()).select_from(ConsumeRecord).where(ConsumeRecord.user_id == user_id)

        if start_date:
            start_utc = parse_date_start(start_date, tz)
            stmt = stmt.where(ConsumeRecord.created_at >= start_utc)

        if end_date:
            end_utc = parse_date_end(end_date, tz)
            stmt = stmt.where(ConsumeRecord.created_at <= end_utc)

        result = await self.db.exec(stmt)
        count = result.one() or 0
        logger.debug(f"Count consume records for user {user_id}: {count}")
        return int(count)

    async def get_daily_user_activity_stats(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        tz: str | None = None,
    ) -> list[dict[str, Any]]:
        """Get daily user activity statistics (daily active users and new users)."""
        from datetime import date as date_type
        from datetime import datetime, timedelta, timezone

        logger.debug(f"Getting daily user activity stats from {start_date} to {end_date}, tz: {tz}")

        zone = ZoneInfo("UTC")
        if tz:
            try:
                zone = ZoneInfo(tz)
            except ZoneInfoNotFoundError as e:
                raise ValueError(f"Invalid timezone: {tz}") from e

        if not start_date:
            start_local = datetime.now(zone).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=30)
        else:
            start_local = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=zone)

        if not end_date:
            end_local = datetime.now(zone).replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            end_local = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, microsecond=999999, tzinfo=zone
            )

        start_utc = start_local.astimezone(timezone.utc)
        end_utc = end_local.astimezone(timezone.utc)

        tz_name = tz or "UTC"

        start_day: date_type = start_local.date()
        end_day: date_type = end_local.date()
        days: list[str] = []
        cursor = start_day
        while cursor <= end_day:
            days.append(cursor.strftime("%Y-%m-%d"))
            cursor += timedelta(days=1)

        daily: dict[str, dict[str, Any]] = {d: {"date": d, "active_users": 0, "new_users": 0} for d in days}

        active_date_expr = func.to_char(func.timezone(tz_name, ConsumeRecord.created_at), "YYYY-MM-DD")
        active_stmt = (
            select(
                active_date_expr.label("date"),
                func.count(func.distinct(ConsumeRecord.user_id)).label("active_users"),
            )
            .where(ConsumeRecord.created_at >= start_utc, ConsumeRecord.created_at <= end_utc)
            .group_by(active_date_expr)
            .order_by(active_date_expr)
        )
        active_rows = (await self.db.exec(active_stmt)).all()
        for date_val, active_users in active_rows:
            date_str = str(date_val)
            if date_str in daily:
                daily[date_str]["active_users"] = int(active_users)
            else:
                daily[date_str] = {"date": date_str, "active_users": int(active_users), "new_users": 0}

        from app.models.redemption import UserWallet

        new_date_expr = func.to_char(func.timezone(tz_name, UserWallet.created_at), "YYYY-MM-DD")
        new_stmt = (
            select(new_date_expr.label("date"), func.count().label("new_users"))
            .where(UserWallet.created_at >= start_utc, UserWallet.created_at <= end_utc)
            .group_by(new_date_expr)
            .order_by(new_date_expr)
        )
        new_rows = (await self.db.exec(new_stmt)).all()
        for date_val, new_users in new_rows:
            date_str = str(date_val)
            if date_str in daily:
                daily[date_str]["new_users"] = int(new_users)
            else:
                daily[date_str] = {"date": date_str, "active_users": 0, "new_users": int(new_users)}

        result_list = [daily[d] for d in sorted(daily.keys())]
        logger.debug(f"Found activity stats for {len(result_list)} days")
        return result_list
