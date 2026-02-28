"""
Utilities for calculating next scheduled run times.

Uses croniter for cron expressions and zoneinfo for timezone-aware calculations.
"""

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)


def calculate_next_run(
    schedule_type: str,
    current_scheduled_at: datetime,
    cron_expression: str | None = None,
    timezone_str: str = "UTC",
) -> datetime | None:
    """
    Calculate the next run time based on schedule type.

    Args:
        schedule_type: "once", "daily", "weekly", or "cron"
        current_scheduled_at: The current (just-completed) scheduled_at time
        cron_expression: Cron expression string (required for "cron" type)
        timezone_str: IANA timezone name (e.g., "Asia/Shanghai")

    Returns:
        Next run time as a timezone-aware UTC datetime, or None if no next run.
    """
    if schedule_type == "once":
        return None

    try:
        tz = ZoneInfo(timezone_str)
    except (KeyError, ValueError):
        logger.warning(f"Invalid timezone '{timezone_str}', falling back to UTC")
        tz = ZoneInfo("UTC")

    # Convert to user's timezone for calculation
    local_time = current_scheduled_at.astimezone(tz)

    if schedule_type == "daily":
        next_local = local_time + timedelta(days=1)
        return next_local.astimezone(timezone.utc)

    if schedule_type == "weekly":
        next_local = local_time + timedelta(weeks=1)
        return next_local.astimezone(timezone.utc)

    if schedule_type == "cron":
        if not cron_expression:
            logger.error("Cron expression required for schedule_type='cron'")
            return None
        try:
            from croniter import croniter

            cron = croniter(cron_expression, local_time)
            next_local = cron.get_next(datetime)
            # croniter returns a naive datetime in the same tz context; attach the tz
            if next_local.tzinfo is None:
                next_local = next_local.replace(tzinfo=tz)
            return next_local.astimezone(timezone.utc)
        except Exception as e:
            logger.error(f"Failed to calculate next cron run: {e}")
            return None

    logger.warning(f"Unknown schedule_type: {schedule_type}")
    return None


def validate_min_interval(
    schedule_type: str,
    cron_expression: str | None,
    min_minutes: int = 15,
) -> str | None:
    """Validate that a schedule does not fire more frequently than *min_minutes*.

    Returns ``None`` when valid, or an error message string when invalid.
    Also validates cron syntax for ``schedule_type="cron"``.
    """
    if schedule_type != "cron":
        # once/daily/weekly always satisfy the minimum interval
        return None

    if not cron_expression:
        return "cron_expression is required for schedule_type='cron'"

    try:
        from croniter import croniter

        now = datetime.now(timezone.utc)
        cron = croniter(cron_expression, now)
        first = cron.get_next(datetime)
        second = cron.get_next(datetime)
        gap_minutes = (second - first).total_seconds() / 60

        if gap_minutes < min_minutes:
            return (
                f"Cron interval too short ({gap_minutes:.0f} min). Minimum allowed interval is {min_minutes} minutes."
            )
    except (ValueError, KeyError) as e:
        return f"Invalid cron expression: {e}"

    return None


def enforce_min_next_at(next_at: datetime, min_minutes: int = 5) -> datetime:
    """Clamp *next_at* to at least *min_minutes* from now (system safety net)."""
    floor = datetime.now(timezone.utc) + timedelta(minutes=min_minutes)
    if next_at < floor:
        logger.warning(
            "Clamped next_at from %s to %s (min %d min)",
            next_at.isoformat(),
            floor.isoformat(),
            min_minutes,
        )
        return floor
    return next_at
