"use client";

import { useState } from "react";
import {
  useMarketplaceListing,
  useMarketplaceRequirements,
  useToggleLike,
  useUnpublishAgent,
} from "@/hooks/useMarketplace";
import {
  HeartIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  EyeIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import ForkAgentModal from "@/components/features/ForkAgentModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { useIsMarketplaceOwner } from "@/utils/marketplace";

interface AgentMarketplaceDetailProps {
  marketplaceId: string;
  onBack: () => void;
}

/**
 * AgentMarketplaceDetail Component
 *
 * Detailed view of a marketplace listing with fork and like functionality
 */
export default function AgentMarketplaceDetail({
  marketplaceId,
  onBack,
}: AgentMarketplaceDetailProps) {
  const [showForkModal, setShowForkModal] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);

  // Fetch listing data
  const {
    data: listing,
    isLoading,
    error,
  } = useMarketplaceListing(marketplaceId);

  // Fetch requirements
  const { data: requirements } = useMarketplaceRequirements(marketplaceId);

  // Like mutation
  const toggleLike = useToggleLike();

  // Unpublish mutation
  const unpublishMutation = useUnpublishAgent();
  const isOwner = useIsMarketplaceOwner(listing);

  const handleBack = () => {
    onBack();
  };

  const handleLike = () => {
    if (marketplaceId) {
      toggleLike.mutate(marketplaceId);
    }
  };

  const handleFork = () => {
    setShowForkModal(true);
  };

  const handleForkSuccess = (agentId: string) => {
    // Navigate to agent editor or show success message
    console.log("Agent forked successfully:", agentId);
    // You might want to navigate to the agent detail page or show a notification
  };

  const handleUnpublish = () => {
    if (!listing) return;
    unpublishMutation.mutate(listing.id, {
      onSuccess: () => {
        // Navigate back to marketplace after successful unpublish
        onBack();
      },
      onError: (error) => {
        console.error("Failed to unpublish agent:", error);
        // Error handling is managed by the mutation hook
      },
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Loading agent details...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !listing) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="max-w-md relative w-full rounded-lg border border-red-500/50 bg-red-50 p-4 text-red-900 dark:bg-red-950/50 dark:text-red-400">
          <div className="flex gap-2">
            <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
            <div className="text-sm">
              Failed to load agent details. Please try again.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-950 dark:to-black">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header with back button */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="group mb-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:border-neutral-300 hover:shadow dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700"
          >
            <ArrowLeftIcon className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Marketplace</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column - Agent Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Agent Header */}
            <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
              {/* Gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-indigo-500/10"></div>

              <div className="relative flex flex-col space-y-1.5 p-8">
                <div className="flex items-start gap-6">
                  {listing.avatar ? (
                    <img
                      src={listing.avatar}
                      alt={listing.name}
                      className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white dark:ring-neutral-800"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-indigo-500 text-3xl font-bold text-white shadow-xl">
                      {listing.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                      {listing.name}
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      Published by{" "}
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">
                        {listing.user_id.split("@")[0] || listing.user_id}
                      </span>
                    </p>
                    <p className="mt-3 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
                      {listing.description || "No description provided"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {listing.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative border-t border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/50">
                <div className="flex items-center gap-8 text-sm">
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30">
                      <HeartIcon className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                        {listing.likes_count}
                      </div>
                      <div className="text-xs">Likes</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <svg
                        className="h-5 w-5 text-blue-500"
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
                    </div>
                    <div>
                      <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                        {listing.forks_count}
                      </div>
                      <div className="text-xs">Forks</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/30">
                      <EyeIcon className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                        {listing.views_count}
                      </div>
                      <div className="text-xs">Views</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Configuration Preview */}
            {listing.snapshot && (
              <div className="rounded-2xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex flex-col space-y-1.5 border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-white p-6 dark:border-neutral-800 dark:from-neutral-900 dark:to-neutral-950">
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                    Configuration
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      v{listing.snapshot.version}
                    </span>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      {listing.snapshot.commit_message}
                    </span>
                  </div>
                </div>
                <div className="space-y-4 p-6 pt-0">
                  {/* Model */}
                  {listing.snapshot.configuration.model && (
                    <div>
                      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Model
                      </h3>
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        {listing.snapshot.configuration.model}
                      </p>
                    </div>
                  )}

                  <div className="my-4 h-px w-full bg-neutral-200 dark:bg-neutral-800" />

                  {/* System Prompt */}
                  {listing.snapshot.configuration.prompt && (
                    <div>
                      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        System Prompt
                      </h3>
                      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
                        <pre className="whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
                          {listing.snapshot.configuration.prompt}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Requirements Section */}
            {requirements && (
              <div className="rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex flex-col space-y-1.5 p-6">
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                    Requirements
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    What you'll need to use this agent
                  </p>
                </div>
                <div className="space-y-4 p-6 pt-0">
                  {/* Provider */}
                  {requirements.provider_needed && (
                    <div className="relative w-full rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="flex gap-2">
                        <InformationCircleIcon className="h-4 w-4 flex-shrink-0" />
                        <div className="text-sm">
                          <strong>LLM Provider Required:</strong> You'll need to
                          configure an AI provider (OpenAI, Anthropic, etc.) to
                          use this agent.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MCP Servers */}
                  {requirements.mcp_servers.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        MCP Servers ({requirements.mcp_servers.length})
                      </h3>
                      <div className="mt-2 space-y-2">
                        {requirements.mcp_servers.map((mcp, index) => (
                          <div
                            key={index}
                            className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900"
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
                                  {mcp.name}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-transparent bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  ✅ Auto-configured
                                </span>
                              </div>
                              {mcp.description && (
                                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                                  {mcp.description}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Knowledge Base */}
                  {requirements.knowledge_base && (
                    <div className="relative w-full rounded-lg border border-blue-500/50 bg-blue-50 p-4 text-blue-900 dark:bg-blue-950/50 dark:text-blue-400">
                      <div className="flex gap-2">
                        <InformationCircleIcon className="h-4 w-4 flex-shrink-0" />
                        <div className="text-sm">
                          <strong>Knowledge Base:</strong> The original agent
                          uses {requirements.knowledge_base.file_count} files.
                          These files will be copied to your workspace when you
                          fork this agent.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* No Requirements */}
                  {!requirements.provider_needed &&
                    requirements.mcp_servers.length === 0 &&
                    !requirements.knowledge_base && (
                      <div className="relative w-full rounded-lg border border-green-500/50 bg-green-50 p-4 text-green-900 dark:bg-green-950/50 dark:text-green-400">
                        <div className="flex gap-2">
                          <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-600" />
                          <div className="text-sm">
                            No special requirements! This agent is ready to use
                            after forking.
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Actions */}
          <div className="space-y-6">
            {/* Action Card */}
            <div className="sticky top-4 rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
              <div className="p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Actions
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={handleFork}
                    className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 px-4 py-4 text-base font-bold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-700 via-pink-700 to-indigo-700 opacity-0 transition-opacity group-hover:opacity-100"></div>
                    <div className="relative flex items-center justify-center gap-2">
                      <svg
                        className="h-5 w-5"
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
                      Fork This Agent
                    </div>
                  </button>
                  <button
                    onClick={handleLike}
                    disabled={toggleLike.isPending}
                    className={`w-full rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-50 ${
                      listing.has_liked
                        ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                        : "border-neutral-300 bg-white text-neutral-700 hover:border-red-300 hover:bg-red-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-red-800 dark:hover:bg-red-950/30"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {listing.has_liked ? (
                        <HeartSolidIcon className="h-5 w-5 text-red-500" />
                      ) : (
                        <HeartIcon className="h-5 w-5" />
                      )}
                      <span>
                        {listing.has_liked ? "Liked" : "Like This Agent"}
                      </span>
                    </div>
                  </button>

                  {/* Unpublish Button - Only visible to owner */}
                  {isOwner && (
                    <button
                      onClick={() => setShowUnpublishConfirm(true)}
                      disabled={unpublishMutation.isPending}
                      className="w-full rounded-xl border-2 border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 transition-all hover:bg-red-50 hover:scale-[1.02] disabled:opacity-50 dark:border-red-800 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <TrashIcon className="h-5 w-5" />
                        <span>
                          {unpublishMutation.isPending
                            ? "Unpublishing..."
                            : "Unpublish Agent"}
                        </span>
                      </div>
                    </button>
                  )}
                </div>

                <div className="my-4 h-px w-full bg-neutral-200 dark:bg-neutral-800" />

                {/* Author Info */}
                <div>
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Published By
                  </h3>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {listing.user_id}
                  </p>
                </div>

                <div className="my-4 h-px w-full bg-neutral-200 dark:bg-neutral-800" />

                {/* Author Info */}
                {/* Dates */}
                <div className="space-y-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {listing.first_published_at && (
                    <div>
                      <span className="font-medium">First Published:</span>{" "}
                      {new Date(
                        listing.first_published_at,
                      ).toLocaleDateString()}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Last Updated:</span>{" "}
                    {new Date(listing.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Info Card */}
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-lg dark:border-blue-900/50 dark:from-blue-950/30 dark:to-indigo-950/30">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white">
                  <InformationCircleIcon className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="mb-1 font-semibold text-blue-900 dark:text-blue-100">
                    About Forking
                  </h4>
                  <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-200">
                    Forking creates your own independent copy. Changes won't
                    affect the original agent.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fork Modal */}
      {listing && (
        <ForkAgentModal
          open={showForkModal}
          onOpenChange={setShowForkModal}
          marketplaceId={listing.id}
          agentName={listing.name}
          agentDescription={listing.description || undefined}
          requirements={requirements}
          onForkSuccess={handleForkSuccess}
        />
      )}

      {/* Unpublish Confirmation Modal */}
      {listing && (
        <ConfirmationModal
          isOpen={showUnpublishConfirm}
          onClose={() => setShowUnpublishConfirm(false)}
          onConfirm={handleUnpublish}
          title="Unpublish Agent"
          message={`Are you sure you want to unpublish "${listing.name}"? It will be removed from the marketplace, but you can republish it later if needed.`}
          confirmLabel={
            unpublishMutation.isPending ? "Unpublishing..." : "Unpublish"
          }
          cancelLabel="Cancel"
          destructive={true}
        />
      )}
    </div>
  );
}
