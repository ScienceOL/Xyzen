import { HeartIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";

import { useToggleLike } from "@/hooks/useMarketplace";
import type { MarketplaceListing } from "@/service/marketplaceService";

interface AgentListingCardProps {
  listing: MarketplaceListing;
  onMouseEnter?: () => void;
  onClick: () => void;
  onTagClick?: (tag: string) => void;
  compact?: boolean;
}

function AgentListingCard({
  listing,
  onMouseEnter,
  onClick,
  onTagClick,
  compact = false,
}: AgentListingCardProps) {
  const { t } = useTranslation();
  const toggleLike = useToggleLike();

  const handleLikeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleLike.mutate(listing.id);
  };

  const handleCardClick = () => {
    onClick();
  };

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    if (onTagClick) {
      onTagClick(tag);
    }
  };

  if (compact) {
    return (
      <div
        className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-sm border border-neutral-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
        onMouseEnter={onMouseEnter}
        onClick={handleCardClick}
      >
        <div className="absolute inset-0 bg-linear-to-br from-purple-500/5 via-pink-500/5 to-indigo-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <div className="relative flex flex-col space-y-1 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              {listing.avatar ? (
                <img
                  src={listing.avatar}
                  alt={listing.name}
                  className="h-10 w-10 rounded-sm object-cover ring-2 ring-neutral-200 dark:ring-neutral-800"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-linear-to-br from-purple-500 via-pink-500 to-indigo-500 text-base font-bold text-white shadow-lg">
                  {listing.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <h3 className="line-clamp-1 text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {listing.name}
                  </h3>
                  {listing.scope === "official" && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {t("marketplace.badge.official")}
                    </span>
                  )}
                </div>
                <p className="line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {listing.description || t("marketplace.card.noDescription")}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {listing.fork_mode === "locked" && (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg">
                  <LockClosedIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
              )}
              <button
                onClick={handleLikeClick}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:bg-red-50 dark:hover:bg-red-950/20"
              >
                {listing.has_liked ? (
                  <HeartSolidIcon className="h-4 w-4 text-red-500" />
                ) : (
                  <HeartIcon className="h-4 w-4 text-neutral-400 transition-colors group-hover:text-red-500" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="relative mt-auto border-t border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
              <HeartIcon className="h-3.5 w-3.5" />
              <span className="font-medium">{listing.likes_count}</span>
            </div>
            <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              <span className="font-medium">{listing.forks_count}</span>
            </div>
            <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              <span className="font-medium">{listing.views_count}</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-1 bg-linear-to-r from-purple-500 via-pink-500 to-indigo-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
    );
  }

  return (
    <div
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-sm border border-neutral-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
      onMouseEnter={onMouseEnter}
      onClick={handleCardClick}
    >
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-linear-to-br from-purple-500/5 via-pink-500/5 to-indigo-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>

      <div className="relative flex flex-col space-y-1.5 p-6 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {listing.avatar ? (
              <img
                src={listing.avatar}
                alt={listing.name}
                className="h-14 w-14 rounded-sm object-cover ring-2 ring-neutral-200 dark:ring-neutral-800"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-sm bg-linear-to-br from-purple-500 via-pink-500 to-indigo-500 text-xl font-bold text-white shadow-lg">
                {listing.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <h3 className="line-clamp-1 text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  {listing.name}
                </h3>
                {listing.scope === "official" && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    {t("marketplace.badge.official")}
                  </span>
                )}
              </div>
              <p className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                {listing.scope === "official" ? (
                  t("marketplace.card.byOfficial", { defaultValue: "Xyzen" })
                ) : (
                  <>
                    {listing.author_avatar_url && (
                      <img
                        src={listing.author_avatar_url}
                        alt=""
                        className="h-4 w-4 rounded-full object-cover"
                      />
                    )}
                    {t("marketplace.card.by", {
                      author:
                        listing.author_display_name ||
                        (listing.user_id ?? "").split("@")[0] ||
                        listing.user_id,
                    })}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {listing.fork_mode === "locked" && (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg">
                <LockClosedIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            )}
            <button
              onClick={handleLikeClick}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              {listing.has_liked ? (
                <HeartSolidIcon className="h-5 w-5 text-red-500" />
              ) : (
                <HeartIcon className="h-5 w-5 text-neutral-400 transition-colors group-hover:text-red-500" />
              )}
            </button>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {listing.description || t("marketplace.card.noDescription")}
        </p>
      </div>

      <div className="relative mt-auto border-t border-neutral-100 p-6 pt-4 dark:border-neutral-800">
        {/* Tags */}
        {listing.tags && listing.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {listing.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                onClick={(e) => handleTagClick(e, tag)}
                className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {tag}
              </span>
            ))}
            {listing.tags.length > 3 && (
              <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                {t("marketplace.card.tagsMore", {
                  count: listing.tags.length - 3,
                })}
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-5 text-sm">
          <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
            <HeartIcon className="h-4 w-4" />
            <span className="font-medium">{listing.likes_count}</span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            <span className="font-medium">{listing.forks_count}</span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            <span className="font-medium">{listing.views_count}</span>
          </div>
        </div>
      </div>

      {/* Hover indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-linear-to-r from-purple-500 via-pink-500 to-indigo-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
    </div>
  );
}

export default AgentListingCard;
export type { AgentListingCardProps };
