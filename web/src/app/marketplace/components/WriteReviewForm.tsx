import { Textarea } from "@/components/base/Textarea";
import { useDeleteReview, useSubmitReview } from "@/hooks/useMarketplace";
import type { AgentReview } from "@/service/marketplaceService";
import {
  HandThumbDownIcon,
  HandThumbUpIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  HandThumbDownIcon as ThumbDownSolid,
  HandThumbUpIcon as ThumbUpSolid,
} from "@heroicons/react/24/solid";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface WriteReviewFormProps {
  marketplaceId: string;
  existingReview: AgentReview | null;
}

export default function WriteReviewForm({
  marketplaceId,
  existingReview,
}: WriteReviewFormProps) {
  const { t } = useTranslation();
  const submitReview = useSubmitReview();
  const deleteReview = useDeleteReview();

  const [isPositive, setIsPositive] = useState<boolean | null>(
    existingReview?.is_positive ?? null,
  );
  const [content, setContent] = useState(existingReview?.content ?? "");

  const handleSubmit = () => {
    if (isPositive === null) return;
    submitReview.mutate(
      {
        marketplaceId,
        request: {
          is_positive: isPositive,
          content: content.trim() || null,
        },
      },
      {
        onSuccess: () => {
          // Keep form state in sync with what was submitted
        },
      },
    );
  };

  const handleDelete = () => {
    deleteReview.mutate(marketplaceId, {
      onSuccess: () => {
        setIsPositive(null);
        setContent("");
      },
    });
  };

  return (
    <div className="rounded-lg bg-neutral-100/60 p-4 dark:bg-white/[0.04]">
      <h4 className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
        {existingReview
          ? t("marketplace.review.write.editTitle")
          : t("marketplace.review.write.title")}
      </h4>

      {/* Thumbs up/down toggle */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setIsPositive(true)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
            isPositive === true
              ? "bg-teal-100 text-teal-700 ring-1 ring-teal-500/30 dark:bg-teal-950/40 dark:text-teal-300"
              : "bg-neutral-100 text-neutral-500 hover:bg-teal-50 hover:text-teal-600 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:bg-teal-950/20 dark:hover:text-teal-400"
          }`}
        >
          {isPositive === true ? (
            <ThumbUpSolid className="h-4 w-4" />
          ) : (
            <HandThumbUpIcon className="h-4 w-4" />
          )}
          {t("marketplace.review.write.recommend")}
        </button>
        <button
          onClick={() => setIsPositive(false)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
            isPositive === false
              ? "bg-red-100 text-red-700 ring-1 ring-red-500/30 dark:bg-red-950/40 dark:text-red-300"
              : "bg-neutral-100 text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:bg-red-950/20 dark:hover:text-red-400"
          }`}
        >
          {isPositive === false ? (
            <ThumbDownSolid className="h-4 w-4" />
          ) : (
            <HandThumbDownIcon className="h-4 w-4" />
          )}
          {t("marketplace.review.write.notRecommend")}
        </button>
      </div>

      {/* Optional text */}
      {isPositive !== null && (
        <>
          <div className="mt-3">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("marketplace.review.write.placeholder")}
              rows={3}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitReview.isPending}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50 dark:hover:bg-indigo-400"
            >
              {submitReview.isPending
                ? t("marketplace.review.write.submitting")
                : existingReview
                  ? t("marketplace.review.write.update")
                  : t("marketplace.review.write.submit")}
            </button>
            {existingReview && (
              <button
                onClick={handleDelete}
                disabled={deleteReview.isPending}
                className="flex items-center gap-1 rounded-lg bg-neutral-100/80 px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:bg-white/[0.06] dark:text-neutral-400 dark:hover:bg-red-950/20 dark:hover:text-red-400"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                {t("marketplace.review.write.delete")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
