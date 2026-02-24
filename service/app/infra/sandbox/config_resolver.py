"""Sandbox configuration resolver.

Merges global defaults (from env/config) with per-user overrides (from DB)
to produce a ``ResolvedSandboxConfig`` consumed by sandbox backends.
"""

from __future__ import annotations

from app.infra.sandbox.backends.base import ResolvedSandboxConfig


def _pick[T](user_val: T | None, default: T) -> T:
    """Return *user_val* when explicitly set, otherwise *default*."""
    return user_val if user_val is not None else default


class SandboxConfigResolver:
    """Resolves the effective sandbox configuration for a user."""

    @staticmethod
    def resolve(profile: "SandboxProfile | None" = None) -> ResolvedSandboxConfig:
        """Build a fully-resolved config.

        Priority: user profile field (if not None) > global config default.
        """
        from app.configs import configs

        g = configs.Sandbox
        d = g.Daytona

        if profile is None:
            return ResolvedSandboxConfig(
                cpu=g.Cpu,
                memory=g.Memory,
                disk=g.Disk,
                auto_stop_minutes=d.AutoStopMinutes,
                auto_delete_minutes=d.AutoDeleteMinutes,
                timeout=g.Timeout,
                image=d.Image,
            )

        return ResolvedSandboxConfig(
            cpu=_pick(profile.cpu, g.Cpu),
            memory=_pick(profile.memory, g.Memory),
            disk=_pick(profile.disk, g.Disk),
            auto_stop_minutes=_pick(profile.auto_stop_minutes, d.AutoStopMinutes),
            auto_delete_minutes=_pick(profile.auto_delete_minutes, d.AutoDeleteMinutes),
            timeout=_pick(profile.timeout, g.Timeout),
            image=_pick(profile.image, d.Image),
        )

    @staticmethod
    async def resolve_for_user(user_id: str | None) -> ResolvedSandboxConfig:
        """Convenience: look up the user's profile in DB and resolve.

        Creates a short-lived DB session internally so callers (Celery
        workers, manager) don't need to pass one in.
        """
        if not user_id:
            return SandboxConfigResolver.resolve(None)

        try:
            from app.infra.database import AsyncSessionLocal
            from app.models.sandbox_profile import SandboxProfile
            from sqlmodel import col, select

            async with AsyncSessionLocal() as db:
                result = await db.exec(select(SandboxProfile).where(col(SandboxProfile.user_id) == user_id))
                profile = result.first()
                return SandboxConfigResolver.resolve(profile)
        except Exception:
            # DB unavailable or table doesn't exist yet — fall back to globals
            return SandboxConfigResolver.resolve(None)


# Re-export for convenience
from app.models.sandbox_profile import SandboxProfile as SandboxProfile  # noqa: E402, F811

__all__ = ["ResolvedSandboxConfig", "SandboxConfigResolver"]
