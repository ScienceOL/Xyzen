"use client";

import { useDebounce } from "@/hooks/useDebounce";
import {
  useMarketplaceListings,
  usePrefetchMarketplaceListing,
  useStarredListings,
  useToggleLike,
} from "@/hooks/useMarketplace";
import {
  FunnelIcon,
  HeartIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import MyMarketplaceListings from "@/components/features/MyMarketplaceListings";
import type { MarketplaceListing } from "@/service/marketplaceService";
import AgentMarketplaceDetail from "./AgentMarketplaceDetail";
import AgentMarketplaceManage from "./AgentMarketplaceManage";

type AgentMarketplaceTab = "all" | "starred" | "my-listings";
type ViewMode = "list" | "detail" | "manage";
type SortOption = "likes" | "forks" | "views" | "recent" | "oldest";

// Filter options
const SORT_OPTIONS: SortOption[] = [
  "recent",
  "likes",
  "forks",
  "views",
  "oldest",
];

/**
 * AgentMarketplace Component
 *
 * Main marketplace page for discovering and browsing community agents.
 */
export default function AgentMarketplace() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AgentMarketplaceTab>("all");
  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState<
    string | null
  >(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  // Debounce search query
  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    data: allListings,
    isLoading: isLoadingAll,
    error: errorAll,
    refetch: refetchAll,
  } = useMarketplaceListings({
    query: debouncedSearch,
    tags: selectedTag ? [selectedTag] : undefined,
    sort_by: sortBy,
  });

  const {
    data: starredListings,
    isLoading: isLoadingStarred,
    error: errorStarred,
    refetch: refetchStarred,
  } = useStarredListings();

  const listings = activeTab === "starred" ? starredListings : allListings;
  const isLoading = activeTab === "starred" ? isLoadingStarred : isLoadingAll;
  const error = activeTab === "starred" ? errorStarred : errorAll;
  const refetch = activeTab === "starred" ? refetchStarred : refetchAll;

  const prefetchListing = usePrefetchMarketplaceListing();

  const handleSelectListing = (id: string) => {
    setSelectedMarketplaceId(id);
    setViewMode("detail");
  };

  const handleManageListing = (id: string) => {
    setSelectedMarketplaceId(id);
    setViewMode("manage");
  };

  const handleBackToList = () => {
    setSelectedMarketplaceId(null);
    setViewMode("list");
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedTag(null);
    setSortBy("recent");
  };

  const handleMouseEnter = (id: string) => {
    prefetchListing(id);
  };

  if (selectedMarketplaceId && viewMode === "detail") {
    return (
      <AgentMarketplaceDetail
        marketplaceId={selectedMarketplaceId}
        onBack={handleBackToList}
        onManage={() => setViewMode("manage")}
      />
    );
  }

  if (selectedMarketplaceId && viewMode === "manage") {
    return (
      <AgentMarketplaceManage
        marketplaceId={selectedMarketplaceId}
        onBack={handleBackToList}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-neutral-50 dark:bg-black">
      {/* Header Section */}
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 px-6 py-4 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                {t("marketplace.title")}
              </h1>

              {/* Tab Navigation */}
              <div className="flex rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                    activeTab === "all"
                      ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                      : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  {t("marketplace.tabs.all")}
                </button>
                <button
                  onClick={() => setActiveTab("starred")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                    activeTab === "starred"
                      ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                      : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  {t("marketplace.tabs.starred")}
                </button>
                <button
                  onClick={() => setActiveTab("my-listings")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                    activeTab === "my-listings"
                      ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                      : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  {t("marketplace.tabs.my")}
                </button>
              </div>
            </div>

            {/* Filter Bar - Only show for "All Agents" tab */}
            {activeTab === "all" && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder={t("marketplace.search.placeholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-4 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <FunnelIcon className="h-4 w-4 text-neutral-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(`marketplace.sort.${option}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Active filters */}
          {selectedTag && activeTab === "all" && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("marketplace.filters.filteredBy")}
              </span>
              <button
                onClick={() => setSelectedTag(null)}
                className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
              >
                #{selectedTag}
                <span className="ml-1 text-indigo-400 hover:text-indigo-600 dark:text-indigo-500">
                  ×
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-7xl">
          {activeTab === "all" || activeTab === "starred" ? (
            <>
              {isLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600"></div>
                </div>
              ) : error ? (
                <div className="flex h-64 items-center justify-center text-red-500">
                  {t("marketplace.loadError")}
                  <button onClick={() => refetch()} className="ml-2 underline">
                    {t("marketplace.retry")}
                  </button>
                </div>
              ) : !listings || listings.length === 0 ? (
                <div className="flex min-h-100 flex-col items-center justify-center py-12 text-center">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 animate-pulse rounded-full bg-linear-to-r from-purple-400 via-pink-400 to-indigo-400 opacity-20 blur-2xl"></div>
                    <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-linear-to-br from-purple-500 to-pink-500">
                      {activeTab === "starred" ? (
                        <HeartSolidIcon className="h-16 w-16 text-white" />
                      ) : (
                        <svg
                          className="h-16 w-16 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <h3 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                    {activeTab === "starred"
                      ? t("marketplace.empty.starred.title")
                      : t("marketplace.empty.all.title")}
                  </h3>
                  <p className="mb-6 max-w-md text-center text-neutral-600 dark:text-neutral-400">
                    {activeTab === "starred"
                      ? t("marketplace.empty.starred.body")
                      : searchQuery
                        ? t("marketplace.empty.search.body")
                        : t("marketplace.empty.all.body")}
                  </p>

                  {/* Show "Browse Agents" button for Starred tab */}
                  {activeTab === "starred" && (
                    <button
                      onClick={() => setActiveTab("all")}
                      className="rounded-lg bg-linear-to-r from-purple-600 to-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
                    >
                      {t("marketplace.empty.starred.browse")}
                    </button>
                  )}

                  {/* Show publish instructions for All tab when not searching */}
                  {activeTab === "all" && !searchQuery && (
                    <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                      <h4 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">
                        {t("marketplace.empty.publish.title")}
                      </h4>
                      <ol className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                        <li className="flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                            1
                          </span>
                          <span>{t("marketplace.empty.publish.steps.1")}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                            2
                          </span>
                          <span>{t("marketplace.empty.publish.steps.2")}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                            3
                          </span>
                          <span>{t("marketplace.empty.publish.steps.3")}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                            4
                          </span>
                          <span>{t("marketplace.empty.publish.steps.4")}</span>
                        </li>
                      </ol>
                    </div>
                  )}

                  {(searchQuery || selectedTag || sortBy !== "recent") && (
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {t("marketplace.filters.clear")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {listings.map((listing) => (
                    <AgentListingCard
                      key={listing.id}
                      listing={listing}
                      onClick={() => handleSelectListing(listing.id)}
                      onMouseEnter={() => handleMouseEnter(listing.id)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <MyMarketplaceListings onSelectListing={handleManageListing} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * AgentListingCard Component
 *
 * Individual card for a marketplace listing
 */
interface AgentListingCardProps {
  listing: MarketplaceListing;
  onMouseEnter: () => void;
  onClick: () => void;
  onTagClick?: (tag: string) => void;
}

function AgentListingCard({
  listing,
  onMouseEnter,
  onClick,
  onTagClick,
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

  return (
    <div
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
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
                className="h-14 w-14 rounded-xl object-cover ring-2 ring-neutral-200 dark:ring-neutral-800"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-purple-500 via-pink-500 to-indigo-500 text-xl font-bold text-white shadow-lg">
                {listing.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col">
              <h3 className="line-clamp-1 text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {listing.name}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("marketplace.card.by", {
                  author: listing.user_id.split("@")[0] || listing.user_id,
                })}
              </p>
            </div>
          </div>
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
