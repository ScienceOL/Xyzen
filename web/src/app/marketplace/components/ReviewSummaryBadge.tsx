import { computeRatingTier } from "@/utils/ratingTier";
import { useTranslation } from "react-i18next";

interface ReviewSummaryBadgeProps {
  positiveCount: number;
  negativeCount: number;
  compact?: boolean;
}

export default function ReviewSummaryBadge({
  positiveCount,
  negativeCount,
  compact = false,
}: ReviewSummaryBadgeProps) {
  const { t } = useTranslation();
  const total = positiveCount + negativeCount;
  const tier = computeRatingTier(positiveCount, negativeCount);
  const percentage = total > 0 ? Math.round((positiveCount / total) * 100) : 0;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tier.bgColor} ${tier.textColor}`}
      >
        {t(`marketplace.review.tier.${tier.id}`)}
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${tier.bgColor}`}
    >
      <span className={`text-[13px] font-semibold ${tier.textColor}`}>
        {t(`marketplace.review.tier.${tier.id}`)}
      </span>
      {total >= 10 && (
        <span className={`text-xs ${tier.textColor} opacity-80`}>
          {t("marketplace.review.summary", {
            count: total,
            percentage,
          })}
        </span>
      )}
    </div>
  );
}
