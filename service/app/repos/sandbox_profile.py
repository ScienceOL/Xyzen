"""Repository for sandbox_profiles table."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.sandbox_profile import SandboxProfile, SandboxProfileUpdate

logger = logging.getLogger(__name__)


class SandboxProfileRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_user_id(self, user_id: str) -> SandboxProfile | None:
        """Get the sandbox profile for a user."""
        result = await self.db.exec(select(SandboxProfile).where(col(SandboxProfile.user_id) == user_id))
        return result.first()

    async def upsert(self, user_id: str, update: SandboxProfileUpdate) -> SandboxProfile:
        """Create or update a sandbox profile for a user.

        Only non-None fields in *update* are written; None clears back to default.
        """
        profile = await self.get_by_user_id(user_id)
        if profile is None:
            profile = SandboxProfile(user_id=user_id, **update.model_dump())
            self.db.add(profile)
        else:
            for field_name, value in update.model_dump().items():
                setattr(profile, field_name, value)
            profile.updated_at = datetime.now(timezone.utc)
            self.db.add(profile)

        await self.db.flush()
        await self.db.refresh(profile)
        logger.info("Upserted sandbox profile for user=%s", user_id)
        return profile

    async def delete(self, user_id: str) -> bool:
        """Delete a user's sandbox profile (reset to global defaults)."""
        profile = await self.get_by_user_id(user_id)
        if not profile:
            return False
        await self.db.delete(profile)
        await self.db.flush()
        logger.info("Deleted sandbox profile for user=%s", user_id)
        return True
