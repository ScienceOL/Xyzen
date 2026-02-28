"""Repository for Web Push subscriptions."""

import logging
from urllib.parse import urlparse

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


class PushSubscriptionRepository:
    """CRUD operations for PushSubscription."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_user_id(self, user_id: str) -> list[PushSubscription]:
        stmt = select(PushSubscription).where(col(PushSubscription.user_id) == user_id)
        result = await self.db.exec(stmt)
        return list(result.all())

    async def upsert(self, sub: PushSubscription) -> PushSubscription:
        """Insert or update by endpoint (unique)."""
        stmt = select(PushSubscription).where(col(PushSubscription.endpoint) == sub.endpoint)
        result = await self.db.exec(stmt)
        existing = result.first()

        if existing:
            existing.user_id = sub.user_id
            existing.keys_p256dh = sub.keys_p256dh
            existing.keys_auth = sub.keys_auth
            existing.user_agent = sub.user_agent
            self.db.add(existing)
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        self.db.add(sub)
        await self.db.flush()
        await self.db.refresh(sub)
        return sub

    async def delete_by_endpoint(self, endpoint: str) -> bool:
        stmt = select(PushSubscription).where(col(PushSubscription.endpoint) == endpoint)
        result = await self.db.exec(stmt)
        existing = result.first()
        if existing:
            await self.db.delete(existing)
            await self.db.flush()
            return True
        return False

    async def delete_stale_by_user_and_domain(self, user_id: str, domain: str, keep_endpoint: str) -> int:
        """Delete all subscriptions for *user_id* whose endpoint shares the
        same push-service *domain*, EXCEPT the one with *keep_endpoint*.

        Returns the number of deleted rows.
        """
        stmt = select(PushSubscription).where(
            col(PushSubscription.user_id) == user_id,
            col(PushSubscription.endpoint) != keep_endpoint,
            col(PushSubscription.endpoint).startswith(domain),
        )
        result = await self.db.exec(stmt)
        stale = list(result.all())
        for row in stale:
            await self.db.delete(row)
        if stale:
            await self.db.flush()
        return len(stale)

    @staticmethod
    def extract_domain(endpoint: str) -> str:
        """Return ``https://host`` from an endpoint URL."""
        parsed = urlparse(endpoint)
        return f"{parsed.scheme}://{parsed.netloc}"
