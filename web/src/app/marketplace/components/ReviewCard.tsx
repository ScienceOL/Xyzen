import type { AgentReview } from "@/service/marketplaceService";
import { CheckBadgeIcon } from "@heroicons/react/24/outline";
import { HandThumbDownIcon, HandThumbUpIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";

interface ReviewCardProps {
  review: AgentReview;
}

export default function ReviewCard({ review }: ReviewCardProps) {
  const { t } = useTranslation();

  const displayName =
    review.author_display_name ||
    review.user_id.split("@")[0] ||
    review.user_id;

  return (
    <div className="rounded-lg bg-neutral-100/60 p-4 dark:bg-white/[0.04]">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {review.author_avatar_url ? (
          <img
            src={review.author_avatar_url}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Author + sentiment */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
              {displayName}
            </span>
            {review.is_positive ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400">
                <HandThumbUpIcon className="h-3.5 w-3.5" />
                {t("marketplace.review.card.recommended")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400">
                <HandThumbDownIcon className="h-3.5 w-3.5" />
                {t("marketplace.review.card.notRecommended")}
              </span>
            )}
            {review.has_forked && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400">
                <CheckBadgeIcon className="h-3 w-3" />
                {t("marketplace.review.card.hasUsed")}
              </span>
            )}
          </div>

          {/* Date */}
          <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
            {new Date(review.created_at).toLocaleDateString()}
          </p>

          {/* Content */}
          {review.content && (
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">
              {review.content}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
