import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.subscription import (
    SubscriptionRole,
    SubscriptionRoleCreate,
    UserSubscription,
    UserSubscriptionCreate,
)

logger = logging.getLogger(__name__)


class SubscriptionRepository:
    """Data access layer for subscription roles and user subscriptions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== SubscriptionRole ====================

    async def create_role(self, data: SubscriptionRoleCreate) -> SubscriptionRole:
        role = SubscriptionRole.model_validate(data)
        self.db.add(role)
        await self.db.flush()
        await self.db.refresh(role)
        return role

    async def get_role_by_id(self, role_id: UUID) -> SubscriptionRole | None:
        return await self.db.get(SubscriptionRole, role_id)

    async def get_role_by_name(self, name: str) -> SubscriptionRole | None:
        stmt = select(SubscriptionRole).where(SubscriptionRole.name == name)
        result = await self.db.exec(stmt)
        return result.first()

    async def get_default_role(self) -> SubscriptionRole | None:
        stmt = select(SubscriptionRole).where(col(SubscriptionRole.is_default).is_(True))
        result = await self.db.exec(stmt)
        return result.first()

    async def list_roles(self) -> list[SubscriptionRole]:
        stmt = select(SubscriptionRole).order_by(col(SubscriptionRole.priority))
        result = await self.db.exec(stmt)
        return list(result.all())

    async def upsert_role(self, name: str, **fields: Any) -> SubscriptionRole:
        """Insert or update a SubscriptionRole by name. Returns the role."""
        existing = await self.get_role_by_name(name)
        if existing is not None:
            changed = False
            for k, v in fields.items():
                if getattr(existing, k) != v:
                    setattr(existing, k, v)
                    changed = True
            if changed:
                existing.updated_at = datetime.now(timezone.utc)
                self.db.add(existing)
                await self.db.flush()
            return existing
        return await self.create_role(SubscriptionRoleCreate(name=name, **fields))

    # ==================== UserSubscription ====================

    async def get_user_subscription(self, user_id: str) -> UserSubscription | None:
        stmt = select(UserSubscription).where(UserSubscription.user_id == user_id)
        result = await self.db.exec(stmt)
        return result.first()

    async def create_user_subscription(self, data: UserSubscriptionCreate) -> UserSubscription:
        sub = UserSubscription.model_validate(data)
        self.db.add(sub)
        await self.db.flush()
        await self.db.refresh(sub)
        return sub

    async def update_user_role(
        self,
        user_id: str,
        role_id: UUID,
        expires_at: datetime | None = None,
    ) -> UserSubscription | None:
        sub = await self.get_user_subscription(user_id)
        if sub is None:
            return None
        sub.role_id = role_id
        sub.expires_at = expires_at
        sub.updated_at = datetime.now(timezone.utc)
        self.db.add(sub)
        await self.db.flush()
        await self.db.refresh(sub)
        return sub

    async def get_user_role(self, user_id: str) -> SubscriptionRole | None:
        """Resolve user_id → subscription → role in one query chain."""
        sub = await self.get_user_subscription(user_id)
        if sub is None:
            return None
        return await self.get_role_by_id(sub.role_id)

    async def update_last_credits_claimed(self, user_id: str) -> UserSubscription | None:
        """Set last_credits_claimed_at to now for a user's subscription."""
        sub = await self.get_user_subscription(user_id)
        if sub is None:
            return None
        sub.last_credits_claimed_at = datetime.now(timezone.utc)
        sub.updated_at = datetime.now(timezone.utc)
        self.db.add(sub)
        await self.db.flush()
        await self.db.refresh(sub)
        return sub

    async def list_all_subscriptions(self) -> list[UserSubscription]:
        """List all user subscriptions, ordered by creation time descending."""
        stmt = select(UserSubscription).order_by(col(UserSubscription.created_at).desc())
        result = await self.db.exec(stmt)
        return list(result.all())
