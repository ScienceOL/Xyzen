"""Startup sync: seed plan_catalog limits → DB SubscriptionRole (upsert).

Follows the same pattern as ``SystemAgentManager.ensure_system_agents()``.
"""

import logging
from dataclasses import asdict

from app.core.plan_catalog import get_plan_limits
from app.infra.database import AsyncSessionLocal
from app.repos.subscription import SubscriptionRepository

logger = logging.getLogger(__name__)


async def ensure_subscription_roles() -> None:
    """Sync plan_catalog limits → DB SubscriptionRole (upsert).

    For each plan key in ``_PLAN_LIMITS``, upserts a matching
    SubscriptionRole row so the DB always reflects the catalog definition.
    """
    async with AsyncSessionLocal() as db:
        repo = SubscriptionRepository(db)
        for plan_key, limits in get_plan_limits().items():
            fields = asdict(limits)
            await repo.upsert_role(name=plan_key, **fields)
        await db.commit()
        logger.info("Subscription roles synced: %s", list(get_plan_limits().keys()))
