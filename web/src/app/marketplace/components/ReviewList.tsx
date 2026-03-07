import { useMarketplaceReviews } from "@/hooks/useMarketplace";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import ReviewCard from "./ReviewCard";
import WriteReviewForm from "./WriteReviewForm";

interface ReviewListProps {
  marketplaceId: string;
}

export default function ReviewList({ marketplaceId }: ReviewListProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useMarketplaceReviews(marketplaceId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600" />
      </div>
    );
  }

  const reviews = data?.reviews ?? [];
  const userReview = data?.user_review ?? null;

  return (
    <div className="space-y-6">
      {/* Write review form */}
      <WriteReviewForm
        marketplaceId={marketplaceId}
        existingReview={userReview}
      />

      {/* Review list */}
      {reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
          {data?.has_more && (
            <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
              {t("marketplace.review.list.hasMore")}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center text-neutral-500 dark:text-neutral-400">
          <ChatBubbleLeftRightIcon className="mb-3 h-10 w-10 opacity-20" />
          <p className="text-[13px]">{t("marketplace.review.empty.title")}</p>
          <p className="mt-1 text-xs">{t("marketplace.review.empty.body")}</p>
        </div>
      )}
    </div>
  );
}
