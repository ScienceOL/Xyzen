"use client";

import { useState } from "react";
import {
  useMyMarketplaceListings,
  useUnpublishAgent,
  usePrefetchMarketplaceListing,
} from "@/hooks/useMarketplace";
import {
  HeartIcon,
  ArrowPathIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import type { MarketplaceListing } from "@/service/marketplaceService";

interface MyMarketplaceListingsProps {
  onSelectListing: (marketplaceId: string) => void;
}

/**
 * MyMarketplaceListings Component
 *
 * Displays and manages the current user's marketplace listings with unpublish functionality
 */
export default function MyMarketplaceListings({
  onSelectListing,
}: MyMarketplaceListingsProps) {
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState<
    string | null
  >(null);

  // Fetch my listings
  const {
    data: myListings,
    isLoading,
    error,
    refetch,
  } = useMyMarketplaceListings();

  // Unpublish mutation
  const unpublishMutation = useUnpublishAgent();

  const prefetchListing = usePrefetchMarketplaceListing();

  const handleMouseEnter = (marketplaceId: string) => {
    prefetchListing(marketplaceId);
  };

  const handleUnpublish = (marketplaceId: string) => {
    unpublishMutation.mutate(marketplaceId, {
      onSuccess: () => {
        setShowUnpublishConfirm(null);
        // Optionally refetch to ensure fresh data
        refetch();
      },
      onError: (error) => {
        console.error("Failed to unpublish agent:", error);
        setShowUnpublishConfirm(null);
      },
    });
  };

  const getConfirmingListing = () => {
    if (!showUnpublishConfirm || !myListings) return null;
    return myListings.find((listing) => listing.id === showUnpublishConfirm);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Loading your listings...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load your marketplace listings. Please try again.
        </p>
        <p className="mt-2 text-xs text-red-500 dark:text-red-400">
          Error: {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-3 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Empty state
  if (!myListings || myListings.length === 0) {
    return (
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
          No Published Agents
        </h3>
        <p className="mb-6 max-w-md text-center text-neutral-600 dark:text-neutral-400">
          You haven't published any agents to the marketplace yet. Create and
          publish your first agent to get started!
        </p>
        <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h4 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">
            How to publish your agent:
          </h4>
          <ol className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
            <li className="flex items-start gap-2">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                1
              </span>
              <span>Go to the Chat panel and create or edit an agent</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                2
              </span>
              <span>
                Make sure your agent has a name, description, and prompt
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                3
              </span>
              <span>Click "Publish to Marketplace" button</span>
            </li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Listings Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {myListings.map((listing) => (
          <MyMarketplaceListingCard
            key={listing.id}
            listing={listing}
            onMouseEnter={() => handleMouseEnter(listing.id)}
            onClick={() => onSelectListing(listing.id)}
            onUnpublish={(marketplaceId) =>
              setShowUnpublishConfirm(marketplaceId)
            }
            isUnpublishing={
              unpublishMutation.isPending && showUnpublishConfirm === listing.id
            }
          />
        ))}
      </div>

      {/* Unpublish Confirmation Modal */}
      {showUnpublishConfirm && (
        <ConfirmationModal
          isOpen={true}
          onClose={() => setShowUnpublishConfirm(null)}
          onConfirm={() => handleUnpublish(showUnpublishConfirm)}
          title="Unpublish Agent"
          message={`Are you sure you want to unpublish "${getConfirmingListing()?.name}"? It will be removed from the marketplace, but you can republish it later if needed.`}
          confirmLabel={
            unpublishMutation.isPending ? "Unpublishing..." : "Unpublish"
          }
          cancelLabel="Cancel"
          destructive={true}
        />
      )}
    </>
  );
}

/**
 * MyMarketplaceListingCard Component
 *
 * Individual card for a user's marketplace listing with management actions
 */
interface MyMarketplaceListingCardProps {
  listing: MarketplaceListing;
  onMouseEnter: () => void;
  onClick: () => void;
  onUnpublish: (marketplaceId: string) => void;
  isUnpublishing: boolean;
}

function MyMarketplaceListingCard({
  listing,
  onMouseEnter,
  onClick,
  onUnpublish,
  isUnpublishing,
}: MyMarketplaceListingCardProps) {
  const handleUnpublishClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUnpublishing) {
      onUnpublish(listing.id);
    }
  };

  const handleCardClick = () => {
    if (!isUnpublishing) {
      onClick();
    }
  };

  return (
    <div
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
      onMouseEnter={onMouseEnter}
      onClick={handleCardClick}
    >
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-pink-500/5 to-indigo-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>

      {/* Management Actions Overlay */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={handleUnpublishClick}
          disabled={isUnpublishing}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-600 transition-all hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
          title="Unpublish from Marketplace"
        >
          {isUnpublishing ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          ) : (
            <EyeSlashIcon className="h-4 w-4" />
          )}
        </button>
      </div>

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
                by you
              </p>
            </div>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {listing.description || "No description provided"}
        </p>
      </div>

      <div className="relative mt-auto border-t border-neutral-100 p-6 pt-4 dark:border-neutral-800">
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
