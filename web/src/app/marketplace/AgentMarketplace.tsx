"use client";

import { useState } from "react";
import {
  useMarketplaceListings,
  usePrefetchMarketplaceListing,
  useToggleLike,
} from "@/hooks/useMarketplace";
import {
  HeartIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

import type { MarketplaceListing } from "@/service/marketplaceService";
import AgentMarketplaceDetail from "./AgentMarketplaceDetail";

/**
 * AgentMarketplace Component
 *
 * Main marketplace page for discovering and browsing community agents.
 */
export default function AgentMarketplace() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "likes" | "forks" | "views" | "recent" | "oldest"
  >("recent");

  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState<
    string | null
  >(null);

  // Fetch listings
  const {
    data: listings,
    isLoading,
    error,
    refetch,
  } = useMarketplaceListings({
    query: searchQuery || undefined,
    sort_by: sortBy,
    limit: 50,
  });

  const prefetchListing = usePrefetchMarketplaceListing();

  const handleSearch = (value: string) => {
    setSearchQuery(value);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value as typeof sortBy);
  };

  const handleMouseEnter = (marketplaceId: string) => {
    prefetchListing(marketplaceId);
  };

  const handleSelectListing = (marketplaceId: string) => {
    setSelectedMarketplaceId(marketplaceId);
  };

  const handleBackToList = () => {
    setSelectedMarketplaceId(null);
  };

  // Show detail view if a listing is selected
  if (selectedMarketplaceId) {
    return (
      <AgentMarketplaceDetail
        marketplaceId={selectedMarketplaceId}
        onBack={handleBackToList}
      />
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            Agent Marketplace
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Discover and fork amazing agents from the community
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleSearch(e.target.value)
              }
              className="w-full rounded-md border border-neutral-200 bg-white px-4 py-2 pl-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value="recent">Most Recent</option>
              <option value="likes">Most Liked</option>
              <option value="forks">Most Forked</option>
              <option value="views">Most Viewed</option>
              <option value="oldest">Oldest</option>
            </select>

            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="rounded-md border border-neutral-200 bg-white p-2 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Loading agents...
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <p className="text-sm text-red-600 dark:text-red-400">
              Failed to load marketplace listings. Please try again.
            </p>
            <p className="mt-2 text-xs text-red-500 dark:text-red-400">
              Error: {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {/* Listings Grid */}
        {!isLoading && !error && listings && (
          <>
            {listings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="relative mb-8">
                  <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 opacity-20 blur-2xl"></div>
                  <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
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
                  </div>
                </div>
                <h3 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  No Agents Yet
                </h3>
                <p className="mb-6 max-w-md text-center text-neutral-600 dark:text-neutral-400">
                  {searchQuery
                    ? "No agents match your search. Try different keywords or clear filters."
                    : "Be the first to share your amazing agent with the community!"}
                </p>
                {!searchQuery && (
                  <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <h4 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">
                      How to publish your agent:
                    </h4>
                    <ol className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                      <li className="flex items-start gap-2">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                          1
                        </span>
                        <span>
                          Go to the Chat panel and create or edit an agent
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                          2
                        </span>
                        <span>
                          Make sure your agent has a name, description, and
                          prompt
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                          3
                        </span>
                        <span>Click "Publish to Marketplace" button</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                          4
                        </span>
                        <span>Share your agent with the community!</span>
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                  <AgentListingCard
                    key={listing.id}
                    listing={listing}
                    onMouseEnter={() => handleMouseEnter(listing.id)}
                    onClick={() => handleSelectListing(listing.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
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
}

function AgentListingCard({
  listing,
  onMouseEnter,
  onClick,
}: AgentListingCardProps) {
  const toggleLike = useToggleLike();

  const handleLikeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleLike.mutate(listing.id);
  };

  const handleCardClick = () => {
    onClick();
  };

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
      onMouseEnter={onMouseEnter}
      onClick={handleCardClick}
    >
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-pink-500/5 to-indigo-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>

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
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-indigo-500 text-xl font-bold text-white shadow-lg">
                {listing.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col">
              <h3 className="line-clamp-1 text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {listing.name}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                by {listing.user_id.split("@")[0] || listing.user_id}
              </p>
            </div>
          </div>
          <button
            onClick={handleLikeClick}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-all hover:bg-red-50 dark:hover:bg-red-950/20"
          >
            <HeartIcon className="h-5 w-5 text-neutral-400 transition-colors group-hover:text-red-500" />
          </button>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {listing.description || "No description provided"}
        </p>
      </div>

      <div className="relative border-t border-neutral-100 p-6 pt-4 dark:border-neutral-800">
        {/* Tags */}
        {listing.tags && listing.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {listing.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {tag}
              </span>
            ))}
            {listing.tags.length > 3 && (
              <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                +{listing.tags.length - 3} more
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
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
    </div>
  );
}
