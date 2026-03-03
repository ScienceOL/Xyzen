"""Base gift mode handler."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class RewardResult:
    """Result of computing a gift reward."""

    credits: int = 0
    credit_type: str = "free"
    full_model_access_days: int = 0
    milestone_reached: bool = False
    milestone_name: str = ""

    def to_dict(self) -> dict:
        """Serialize to dict for storage in reward_data."""
        return {
            "credits": self.credits,
            "credit_type": self.credit_type,
            "full_model_access_days": self.full_model_access_days,
            "milestone_reached": self.milestone_reached,
            "milestone_name": self.milestone_name,
        }


class GiftModeHandler(ABC):
    """Abstract base class for gift campaign mode handlers."""

    @abstractmethod
    def compute_reward(self, day_number: int, consecutive_days: int, config: dict) -> RewardResult:
        """Compute the reward for a given day and streak.

        Args:
            day_number: The day number in the campaign (1-indexed).
            consecutive_days: The current consecutive streak.
            config: Campaign-specific configuration dict.

        Returns:
            RewardResult describing what to award.
        """
        ...
