import { HeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { SparklesIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";

import { useToggleLike } from "@/hooks/useMarketplace";
import type { MarketplaceListing } from "@/service/marketplaceService";
import AgentListingCard from "../AgentListingCard";
import { SectionHeader, SectionSkeleton } from "./SectionPrimitives";

interface OfficialPicksSectionProps {
  listings: MarketplaceListing[] | undefined;
  isLoading: boolean;
  onSelectListing: (id: string) => void;
  onMouseEnterListing: (id: string) => void;
}

function OfficialBannerCard({
  listing,
  onClick,
  onMouseEnter,
}: {
  listing: MarketplaceListing;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const { t } = useTranslation();
  const toggleLike = useToggleLike();

  const handleLikeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleLike.mutate(listing.id);
  };

  return (
    <div
      className="group relative cursor-pointer bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 p-[2px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/25 dark:hover:shadow-purple-500/15"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className="relative flex items-center gap-5 bg-white p-5 transition-colors duration-300 group-hover:bg-neutral-50 dark:bg-neutral-950 dark:group-hover:bg-neutral-900 sm:gap-6 sm:p-6">
        {/* Avatar */}
        {listing.avatar ? (
          <img
            src={listing.avatar}
            alt={listing.name}
            className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-md ring-1 ring-neutral-200 dark:ring-neutral-800 sm:h-20 sm:w-20"
          />
        ) : (
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 via-purple-600 to-pink-600 shadow-md sm:h-20 sm:w-20">
            <SparklesIcon className="h-8 w-8 text-white/90 sm:h-10 sm:w-10" />
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 sm:text-xl">
              {listing.name}
            </h3>
            <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {t("marketplace.badge.official")}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            {listing.description || t("marketplace.card.noDescription")}
          </p>
          <div className="mt-2.5 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
              <HeartIcon className="h-4 w-4" />
              <span className="font-medium">{listing.likes_count}</span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
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
          </div>
        </div>

        {/* Like button */}
        <button
          onClick={handleLikeClick}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all hover:bg-red-50 dark:hover:bg-red-950/20"
        >
          {listing.has_liked ? (
            <HeartSolidIcon className="h-5 w-5 text-red-500" />
          ) : (
            <HeartIcon className="h-5 w-5 text-neutral-400 transition-colors group-hover:text-red-500" />
          )}
        </button>
      </div>
    </div>
  );
}

export default function OfficialPicksSection({
  listings,
  isLoading,
  onSelectListing,
  onMouseEnterListing,
}: OfficialPicksSectionProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return <SectionSkeleton title={t("marketplace.sections.officialPicks")} />;
  }

  if (!listings || listings.length === 0) {
    return null;
  }

  const [banner, ...rest] = listings;

  return (
    <div>
      <SectionHeader title={t("marketplace.sections.officialPicks")} />
      <div className="space-y-4">
        <OfficialBannerCard
          listing={banner}
          onClick={() => onSelectListing(banner.id)}
          onMouseEnter={() => onMouseEnterListing(banner.id)}
        />
        {rest.length > 0 && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {rest.map((listing) => (
              <AgentListingCard
                key={listing.id}
                listing={listing}
                compact
                onClick={() => onSelectListing(listing.id)}
                onMouseEnter={() => onMouseEnterListing(listing.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
