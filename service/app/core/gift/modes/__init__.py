"""Gift campaign mode registry."""

from .daily_credits_with_unlock import DailyCreditsWithUnlockHandler

from .base import GiftModeHandler

MODE_REGISTRY: dict[str, GiftModeHandler] = {
    "daily_credits_with_unlock": DailyCreditsWithUnlockHandler(),
}
