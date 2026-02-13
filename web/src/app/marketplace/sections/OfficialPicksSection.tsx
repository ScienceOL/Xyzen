import { HeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
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
      className="group relative cursor-pointer overflow-hidden rounded-lg bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 p-[1px] transition-all duration-300 hover:shadow-xl"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className="relative flex items-center gap-6 rounded-[7px] bg-white/95 p-6 backdrop-blur-sm dark:bg-neutral-950/95">
        {listing.avatar ? (
          <img
            src={listing.avatar}
            alt={listing.name}
            className="h-20 w-20 shrink-0 rounded-lg object-cover shadow-lg ring-2 ring-indigo-200 dark:ring-indigo-800"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-purple-500 via-pink-500 to-indigo-500 text-3xl font-bold text-white shadow-lg">
            {listing.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              {listing.name}
            </h3>
            <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {t("marketplace.badge.official")}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            {listing.description || t("marketplace.card.noDescription")}
          </p>
          <div className="mt-3 flex items-center gap-5 text-sm">
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
          </div>
        </div>
        <button
          onClick={handleLikeClick}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all hover:bg-red-50 dark:hover:bg-red-950/20"
        >
          {listing.has_liked ? (
            <HeartSolidIcon className="h-6 w-6 text-red-500" />
          ) : (
            <HeartIcon className="h-6 w-6 text-neutral-400 transition-colors group-hover:text-red-500" />
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
