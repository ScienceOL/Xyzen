"""Daily credits with milestone unlock mode handler."""

from .base import GiftModeHandler, RewardResult


class DailyCreditsWithUnlockHandler(GiftModeHandler):
    """Awards daily credits and unlocks full model access after streak milestones."""

    def compute_reward(self, day_number: int, consecutive_days: int, config: dict) -> RewardResult:
        credits = config.get("daily_credits", 500)
        result = RewardResult(credits=credits)

        milestones = config.get("milestones")
        if milestones:
            for ms in milestones:
                if consecutive_days == ms["consecutive_day"]:
                    result.milestone_reached = True
                    result.milestone_name = ms["milestone_name"]
                    if ms.get("access_days", 0) > 0:
                        result.full_model_access_days = ms["access_days"]
                    break
        else:
            # Legacy single-milestone fallback
            unlock_day = config.get("unlock_consecutive_day", 3)
            if consecutive_days >= unlock_day:
                result.full_model_access_days = config.get("model_access_days", 30)
                if consecutive_days == unlock_day:
                    result.milestone_reached = True
                    result.milestone_name = "ultra_unlock"

        return result
