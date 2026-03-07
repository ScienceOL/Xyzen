export type RatingTierId =
  | "overwhelmingly_positive"
  | "very_positive"
  | "mixed"
  | "mostly_negative"
  | "overwhelmingly_negative"
  | "not_enough";

export interface RatingTier {
  id: RatingTierId;
  bgColor: string;
  textColor: string;
}

const MIN_REVIEWS = 10;

export function computeRatingTier(
  positiveCount: number,
  negativeCount: number,
): RatingTier {
  const total = positiveCount + negativeCount;

  if (total < MIN_REVIEWS) {
    return {
      id: "not_enough",
      bgColor: "bg-neutral-100 dark:bg-neutral-800",
      textColor: "text-neutral-600 dark:text-neutral-400",
    };
  }

  const ratio = positiveCount / total;

  if (ratio >= 0.95) {
    return {
      id: "overwhelmingly_positive",
      bgColor: "bg-teal-50 dark:bg-teal-950/30",
      textColor: "text-teal-700 dark:text-teal-300",
    };
  }
  if (ratio >= 0.8) {
    return {
      id: "very_positive",
      bgColor: "bg-green-50 dark:bg-green-950/30",
      textColor: "text-green-700 dark:text-green-300",
    };
  }
  if (ratio >= 0.4) {
    return {
      id: "mixed",
      bgColor: "bg-amber-50 dark:bg-amber-950/20",
      textColor: "text-amber-700 dark:text-amber-300",
    };
  }
  if (ratio >= 0.2) {
    return {
      id: "mostly_negative",
      bgColor: "bg-orange-50 dark:bg-orange-950/30",
      textColor: "text-orange-700 dark:text-orange-300",
    };
  }
  return {
    id: "overwhelmingly_negative",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    textColor: "text-red-700 dark:text-red-300",
  };
}
