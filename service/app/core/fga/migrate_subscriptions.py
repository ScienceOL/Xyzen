"""One-time migration script to backfill subscription FGA tuples.

Usage (from within the service container or locally):

    python -m app.core.fga.migrate_subscriptions

For each existing UserSubscription, writes a
``user:X subscriber plan:Y`` tuple so the FGA capability layer
recognises existing subscribers.
"""

import asyncio
import logging

from app.core.fga.client import get_fga_client
from app.infra.database import AsyncSessionLocal
from app.repos.subscription import SubscriptionRepository

logger = logging.getLogger(__name__)


async def migrate() -> None:
    fga = await get_fga_client()

    async with AsyncSessionLocal() as db:
        repo = SubscriptionRepository(db)
        subs = await repo.list_all_subscriptions()

        ok = 0
        for sub in subs:
            role = await repo.get_role_by_id(sub.role_id)
            if not role:
                logger.warning("No role found for subscription %s (role_id=%s)", sub.id, sub.role_id)
                continue
            try:
                await fga.write_tuple(sub.user_id, "subscriber", "plan", role.name)
                ok += 1
            except Exception as e:
                if "already exists" not in str(e).lower():
                    logger.warning(
                        "Failed to write subscription tuple for user=%s plan=%s: %s", sub.user_id, role.name, e
                    )
                else:
                    ok += 1  # Already exists counts as success

        logger.info("Migrated %d / %d subscription FGA tuples", ok, len(subs))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(migrate())
