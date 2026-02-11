import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.subscription import (
    SubscriptionRole,
    UserSubscription,
    UserSubscriptionCreate,
)
from app.repos.redemption import RedemptionRepository
from app.repos.subscription import SubscriptionRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class UserLimits:
    """Resolved resource limits for a user based on their subscription role."""

    storage_limit_bytes: int
    max_file_count: int
    max_file_upload_bytes: int
    max_parallel_chats: int
    max_sandboxes: int
    role_name: str
    role_display_name: str


class SubscriptionService:
    """Business logic for subscription roles and user subscriptions."""

    SUBSCRIPTION_DURATION_DAYS = 30

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = SubscriptionRepository(db)

    def _default_expires_at(self) -> datetime:
        return datetime.now(timezone.utc) + timedelta(days=self.SUBSCRIPTION_DURATION_DAYS)

    async def get_user_role(self, user_id: str) -> SubscriptionRole | None:
        """Get the user's current role, auto-assigning the default if missing."""
        role = await self.repo.get_user_role(user_id)
        if role is not None:
            return role

        # Auto-assign default role
        default_role = await self.repo.get_default_role()
        if default_role is None:
            return None

        await self.repo.create_user_subscription(
            UserSubscriptionCreate(
                user_id=user_id,
                role_id=default_role.id,
                expires_at=self._default_expires_at(),
            )
        )
        await self.db.commit()
        return default_role

    async def get_user_limits(self, user_id: str) -> UserLimits | None:
        """Resolve the effective resource limits for a user. Returns None if no roles exist in DB."""
        role = await self.get_user_role(user_id)
        if role is None:
            return None
        return UserLimits(
            storage_limit_bytes=role.storage_limit_bytes,
            max_file_count=role.max_file_count,
            max_file_upload_bytes=role.max_file_upload_bytes,
            max_parallel_chats=role.max_parallel_chats,
            max_sandboxes=role.max_sandboxes,
            role_name=role.name,
            role_display_name=role.display_name,
        )

    async def get_or_create_subscription(self, user_id: str) -> tuple[UserSubscription, SubscriptionRole] | None:
        """Get existing subscription or create one with the default role. Returns None if no default role."""
        sub = await self.repo.get_user_subscription(user_id)
        if sub is not None:
            role = await self.repo.get_role_by_id(sub.role_id)
            if role is not None:
                return sub, role

        default_role = await self.repo.get_default_role()
        if default_role is None:
            return None

        if sub is None:
            sub = await self.repo.create_user_subscription(
                UserSubscriptionCreate(
                    user_id=user_id,
                    role_id=default_role.id,
                    expires_at=self._default_expires_at(),
                )
            )
            await self.db.commit()

        return sub, default_role

    async def assign_role(
        self,
        user_id: str,
        role_id: UUID,
        expires_at: datetime | None = None,
    ) -> UserSubscription | None:
        """Create or update a user's subscription to point to a new role."""
        effective_expires = expires_at if expires_at is not None else self._default_expires_at()
        sub = await self.repo.get_user_subscription(user_id)
        if sub is not None:
            return await self.repo.update_user_role(user_id, role_id, effective_expires)

        sub = await self.repo.create_user_subscription(
            UserSubscriptionCreate(user_id=user_id, role_id=role_id, expires_at=effective_expires)
        )
        await self.db.commit()
        return sub

    async def list_plans(self) -> list[SubscriptionRole]:
        """List all available subscription plans."""
        return await self.repo.list_roles()

    async def list_all_subscriptions(self) -> list[tuple[UserSubscription, SubscriptionRole | None]]:
        """List all user subscriptions with their resolved roles (admin)."""
        subs = await self.repo.list_all_subscriptions()
        results: list[tuple[UserSubscription, SubscriptionRole | None]] = []
        for sub in subs:
            role = await self.repo.get_role_by_id(sub.role_id)
            results.append((sub, role))
        return results

    def can_claim_credits(
        self,
        sub: UserSubscription,
        role: SubscriptionRole,
    ) -> bool:
        """Check if the user can claim monthly credits right now."""
        if role.monthly_credits <= 0:
            return False
        # Expired subscriptions cannot claim
        if sub.expires_at and sub.expires_at < datetime.now(timezone.utc):
            return False
        if sub.last_credits_claimed_at is None:
            return True
        # Can claim once per calendar month (UTC)
        now = datetime.now(timezone.utc)
        last = sub.last_credits_claimed_at
        return (now.year, now.month) != (last.year, last.month)

    async def claim_credits(self, user_id: str) -> int:
        """Claim monthly credits for the user. Returns amount credited. Raises HTTPException on failure."""
        from fastapi import HTTPException

        result = await self.get_or_create_subscription(user_id)
        if result is None:
            raise HTTPException(status_code=404, detail="No subscription found")
        sub, role = result

        if not self.can_claim_credits(sub, role):
            raise HTTPException(status_code=400, detail="Credits already claimed this month")

        amount = role.monthly_credits

        # Credit wallet
        redemption_repo = RedemptionRepository(self.db)
        await redemption_repo.credit_wallet(user_id, amount)

        # Update last_credits_claimed_at
        await self.repo.update_last_credits_claimed(user_id)
        await self.db.commit()

        return amount
