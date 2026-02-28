"""Startup sync: write static plan→capability association tuples into FGA.

These tuples connect each plan to its capabilities so that
``capability:X granted user:Y`` resolves via ``plan:P subscriber user:Y``.
"""

import logging

from app.core.fga.capabilities import PLAN_CAPABILITIES

logger = logging.getLogger(__name__)


async def ensure_capability_tuples() -> None:
    """Write static plan→capability association tuples (idempotent)."""
    from app.core.fga.client import get_fga_client

    fga = await get_fga_client()
    written = 0
    for plan_key, caps in PLAN_CAPABILITIES.items():
        for cap in caps:
            try:
                await fga.write_tuple_raw(
                    user=f"plan:{plan_key}",
                    relation="associated_plan",
                    object_type="capability",
                    object_id=cap,
                )
                written += 1
            except Exception as e:
                if "already exists" not in str(e).lower():
                    logger.warning("FGA capability tuple write failed: %s", e)
    logger.info("FGA capability tuples ensured (%d written)", written)
