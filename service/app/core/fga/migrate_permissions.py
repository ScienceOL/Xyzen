"""One-time migration script to backfill existing data into OpenFGA.

Usage (from within the service container or locally):

    python -m app.core.fga.migrate_permissions

For each existing agent and session, this writes an ``owner`` tuple
so that the FGA-based authorization layer recognises the current owners.
Marketplace-published agents additionally get ``user:*`` → viewer
so that link sharing works out of the box.
"""

import asyncio
import logging

from sqlmodel import select

from app.core.fga.client import get_fga_client
from app.infra.database import AsyncSessionLocal
from app.models.agent import Agent, AgentScope
from app.models.sessions import Session

logger = logging.getLogger(__name__)


async def migrate() -> None:
    fga = await get_fga_client()

    async with AsyncSessionLocal() as db:
        # ── Agents ────────────────────────────────────────────
        agents_stmt = select(Agent).where(Agent.scope == AgentScope.USER)
        result = await db.exec(agents_stmt)
        agents = result.all()

        agent_ok = 0
        for agent in agents:
            if not agent.user_id:
                continue
            try:
                await fga.write_tuple(agent.user_id, "owner", "agent", str(agent.id))
                agent_ok += 1
            except Exception as e:
                logger.warning("Failed to write agent tuple for %s: %s", agent.id, e)

        logger.info("Migrated %d / %d agent owner tuples", agent_ok, len(agents))

        # ── Marketplace (public viewer) ───────────────────────
        from app.models.agent_marketplace import AgentMarketplace

        mp_stmt = select(AgentMarketplace).where(AgentMarketplace.is_published == True)  # noqa: E712
        result2 = await db.exec(mp_stmt)
        listings = result2.all()

        mp_ok = 0
        for listing in listings:
            try:
                await fga.write_public_access("viewer", "agent", str(listing.agent_id))
                mp_ok += 1
            except Exception as e:
                logger.warning("Failed to write public viewer for agent %s: %s", listing.agent_id, e)

        logger.info("Migrated %d / %d marketplace public viewer tuples", mp_ok, len(listings))

        # ── Sessions ─────────────────────────────────────────
        sessions_stmt = select(Session)
        result3 = await db.exec(sessions_stmt)
        sessions = result3.all()

        session_ok = 0
        for session in sessions:
            try:
                await fga.write_tuple(session.user_id, "owner", "session", str(session.id))
                session_ok += 1
            except Exception as e:
                logger.warning("Failed to write session tuple for %s: %s", session.id, e)

        logger.info("Migrated %d / %d session owner tuples", session_ok, len(sessions))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(migrate())
