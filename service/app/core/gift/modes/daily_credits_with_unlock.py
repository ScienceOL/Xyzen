"""Daily credits with milestone unlock mode handler."""

from .base import GiftModeHandler, RewardResult


class DailyCreditsWithUnlockHandler(GiftModeHandler):
    """Awards daily credits and unlocks full model access after a streak milestone."""

    def compute_reward(self, day_number: int, consecutive_days: int, config: dict) -> RewardResult:
        credits = config.get("daily_credits", 500)
        result = RewardResult(credits=credits)

        unlock_day = config.get("unlock_consecutive_day", 3)
        if consecutive_days >= unlock_day:
            result.full_model_access_days = config.get("model_access_days", 30)
            if consecutive_days == unlock_day:
                # Only trigger milestone notification once
                result.milestone_reached = True
                result.milestone_name = "ultra_unlock"

        return result
