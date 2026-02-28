"""FGA tuple sync for subscription plan changes.

Writes/deletes ``user:X subscriber plan:Y`` tuples so that FGA
capability checks resolve correctly for the user's current plan.

All operations are best-effort — failures are logged but never
block the subscription change in the database.
"""

import logging

logger = logging.getLogger(__name__)


async def write_plan_subscription(user_id: str, plan_key: str) -> None:
    """Write ``user:X subscriber plan:Y`` tuple (best-effort)."""
    try:
        from app.core.fga.client import get_fga_client

        fga = await get_fga_client()
        await fga.write_tuple(user_id, "subscriber", "plan", plan_key)
    except Exception as e:
        if "already exists" not in str(e).lower():
            logger.warning("FGA write_plan_subscription failed for user=%s plan=%s: %s", user_id, plan_key, e)


async def delete_plan_subscription(user_id: str, plan_key: str) -> None:
    """Delete ``user:X subscriber plan:Y`` tuple (best-effort)."""
    try:
        from app.core.fga.client import get_fga_client

        fga = await get_fga_client()
        await fga.delete_tuple(user_id, "subscriber", "plan", plan_key)
    except Exception as e:
        if "cannot delete" not in str(e).lower():
            logger.warning("FGA delete_plan_subscription failed for user=%s plan=%s: %s", user_id, plan_key, e)


async def update_plan_subscription(user_id: str, old_plan_key: str | None, new_plan_key: str) -> None:
    """Switch user from old to new plan. Deletes old, writes new (best-effort)."""
    if old_plan_key and old_plan_key != new_plan_key:
        await delete_plan_subscription(user_id, old_plan_key)
    await write_plan_subscription(user_id, new_plan_key)
