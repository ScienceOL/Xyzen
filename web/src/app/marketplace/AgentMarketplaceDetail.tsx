"use client";

import ForkAgentModal from "@/components/features/ForkAgentModal";
import {
  useMarketplaceListing,
  useMarketplaceRequirements,
  useToggleLike,
} from "@/hooks/useMarketplace";
import Markdown from "@/lib/Markdown";
import { useIsMarketplaceOwner } from "@/utils/marketplace";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  CubeIcon,
  DocumentTextIcon,
  EyeIcon,
  HeartIcon,
  InformationCircleIcon,
  LockClosedIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentSnapshot } from "@/service/marketplaceService";

// Helper to detect agent type from graph_config
function getAgentType(
  graphConfig: Record<string, unknown> | null | undefined,
): string {
  if (!graphConfig) return "ReAct";
  const metadata = graphConfig.metadata as Record<string, unknown> | undefined;
  if (metadata?.builtin_key) return String(metadata.builtin_key);
  if (metadata?.pattern) return String(metadata.pattern);
  // Check if it has custom nodes beyond the standard react pattern
  const nodes = graphConfig.nodes as Array<unknown> | undefined;
  if (nodes && nodes.length > 2) return "Custom Graph";
  return "ReAct";
}

// Helper to extract display prompt from configuration
function getDisplayPrompt(
  config: AgentSnapshot["configuration"],
): string | null {
  // Check graph_config.prompt_config.custom_instructions first
  const gc = config.graph_config as Record<string, unknown> | undefined;
  if (gc?.prompt_config) {
    const pc = gc.prompt_config as Record<string, unknown>;
    if (pc.custom_instructions) return String(pc.custom_instructions);
  }
  // Fallback to legacy prompt
  return config.prompt || null;
}

interface AgentMarketplaceDetailProps {
  marketplaceId: string;
  onBack: () => void;
  onManage?: () => void;
}

/**
 * AgentMarketplaceDetail Component
 *
 * Detailed view of a marketplace listing with fork and like functionality
 */
export default function AgentMarketplaceDetail({
  marketplaceId,
  onBack,
  onManage,
}: AgentMarketplaceDetailProps) {
  const { t } = useTranslation();
  const [showForkModal, setShowForkModal] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "readme" | "config" | "requirements"
  >("readme");

  // Note: Unpublish and Edit README states removed as they moved to dedicated Manage view

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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          {/* Loading Icon */}
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600"></div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {t("marketplace.detail.loading")}
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
            <InformationCircleIcon className="h-4 w-4 shrink-0" />
            <div className="text-sm">{t("marketplace.detail.error")}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-linear-to-b from-neutral-50 to-white dark:from-neutral-950 dark:to-black">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header with back button */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="group mb-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:border-neutral-300 hover:shadow dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700"
          >
            <ArrowLeftIcon className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>{t("marketplace.detail.back")}</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column - Agent Info */}
          <div className="lg:col-span-2 min-w-0 space-y-6">
            {/* Agent Header */}
            <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
              {/* Gradient background */}
              <div className="absolute inset-0 bg-linear-to-br from-purple-500/10 via-pink-500/10 to-indigo-500/10"></div>

              <div className="relative flex flex-col space-y-1.5 p-8">
                <div className="flex items-start gap-6">
                  {listing.avatar ? (
                    <img
                      src={listing.avatar}
                      alt={listing.name}
                      className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white dark:ring-neutral-800"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-linear-to-br from-purple-500 via-pink-500 to-indigo-500 text-3xl font-bold text-white shadow-xl">
                      {listing.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                        {listing.name}
                      </h1>
                      {listing.fork_mode === "locked" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                          <LockClosedIcon className="h-3 w-3" />
                          {t("marketplace.forkMode.locked")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {t("marketplace.detail.publishedBy")}{" "}
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">
                        {listing.user_id.split("@")[0] || listing.user_id}
                      </span>
                    </p>
                    <p className="mt-3 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
                      {listing.description ||
                        t("marketplace.detail.noDescription")}
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
                      <div className="text-xs">
                        {t("marketplace.detail.stats.likes")}
                      </div>
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
                      <div className="text-xs">
                        {t("marketplace.detail.stats.forks")}
                      </div>
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
                      <div className="text-xs">
                        {t("marketplace.detail.stats.views")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabbed Content Section */}
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
              {/* Tab Bar */}
              <div className="flex overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
                <button
                  onClick={() => setActiveTab("readme")}
                  className={`flex whitespace-nowrap items-center gap-2 border-b-2 px-4 py-4 text-sm font-medium transition-colors sm:px-6 ${
                    activeTab === "readme"
                      ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  <DocumentTextIcon className="h-4 w-4" />
                  {t("marketplace.detail.tabs.readme")}
                </button>
                <button
                  onClick={() => setActiveTab("config")}
                  className={`flex whitespace-nowrap items-center gap-2 border-b-2 px-4 py-4 text-sm font-medium transition-colors sm:px-6 ${
                    activeTab === "config"
                      ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  <Cog6ToothIcon className="h-4 w-4" />
                  {t("marketplace.detail.tabs.config")}
                </button>
                <button
                  onClick={() => setActiveTab("requirements")}
                  className={`flex whitespace-nowrap items-center gap-2 border-b-2 px-4 py-4 text-sm font-medium transition-colors sm:px-6 ${
                    activeTab === "requirements"
                      ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  <CubeIcon className="h-4 w-4" />
                  {t("marketplace.detail.tabs.requirements")}
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {/* README Tab */}
                {activeTab === "readme" && (
                  <div className="w-full min-w-0">
                    {listing.readme ? (
                      <Markdown
                        content={listing.readme}
                        className="prose-neutral dark:prose-invert"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-500 dark:text-neutral-400">
                        <DocumentTextIcon className="mb-3 h-12 w-12 opacity-20" />
                        <p>{t("marketplace.detail.readme.empty")}</p>
                        {isOwner && onManage && (
                          <button
                            onClick={onManage}
                            className="mt-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            {t("marketplace.detail.readme.manage")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Configuration Tab */}
                {activeTab === "config" && (
                  <div className="space-y-6">
                    {/* Locked agent - hide config for non-owners */}
                    {listing.fork_mode === "locked" && !isOwner ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4">
                          <LockClosedIcon className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                        </div>
                        <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
                          {t("marketplace.fork.lockedAgent")}
                        </h3>
                        <p className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
                          {t("marketplace.detail.config.hidden")}
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Locked agent warning for owner */}
                        {listing.fork_mode === "locked" && isOwner && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                            <div className="flex gap-3">
                              <LockClosedIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                              <div>
                                <p className="font-medium text-amber-800 dark:text-amber-300">
                                  {t("marketplace.fork.lockedAgent")}
                                </p>
                                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                                  {t(
                                    "marketplace.detail.config.lockedOwnerNote",
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        {listing.snapshot ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                                v{listing.snapshot.version}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                {getAgentType(
                                  listing.snapshot.configuration.graph_config,
                                )}
                              </span>
                              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                                {listing.snapshot.commit_message}
                              </span>
                            </div>

                            {/* Model */}
                            {listing.snapshot.configuration.model && (
                              <div>
                                <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                  {t("marketplace.detail.config.model")}
                                </h3>
                                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                                  {listing.snapshot.configuration.model}
                                </p>
                              </div>
                            )}

                            {/* System Prompt */}
                            {getDisplayPrompt(
                              listing.snapshot.configuration,
                            ) && (
                              <div>
                                <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                  {t("marketplace.detail.config.systemPrompt")}
                                </h3>
                                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
                                  <pre className="whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
                                    {getDisplayPrompt(
                                      listing.snapshot.configuration,
                                    )}
                                  </pre>
                                </div>
                              </div>
                            )}

                            {/* MCP Servers in Configuration */}
                            {listing.snapshot.mcp_server_configs &&
                              listing.snapshot.mcp_server_configs.length >
                                0 && (
                                <div>
                                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                    {t("marketplace.detail.config.mcpServers", {
                                      count:
                                        listing.snapshot.mcp_server_configs
                                          .length,
                                    })}
                                  </h3>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {listing.snapshot.mcp_server_configs.map(
                                      (mcp, index) => (
                                        <span
                                          key={index}
                                          className="inline-flex items-center rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
                                        >
                                          {mcp.name}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-500 dark:text-neutral-400">
                            <Cog6ToothIcon className="mb-3 h-12 w-12 opacity-20" />
                            <p>{t("marketplace.detail.config.empty")}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Requirements Tab */}
                {activeTab === "requirements" && (
                  <div className="space-y-4">
                    {requirements ? (
                      <>
                        {/* Provider */}
                        {requirements.provider_needed && (
                          <div className="relative w-full rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
                            <div className="flex gap-2">
                              <InformationCircleIcon className="h-4 w-4 shrink-0" />
                              <div className="text-sm">
                                <strong>
                                  {t(
                                    "marketplace.detail.requirements.provider.title",
                                  )}
                                </strong>{" "}
                                {t(
                                  "marketplace.detail.requirements.provider.description",
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* MCP Servers */}
                        {requirements.mcp_servers.length > 0 && (
                          <div>
                            <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                              {t("marketplace.detail.requirements.mcpServers", {
                                count: requirements.mcp_servers.length,
                              })}
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
                                        ✅{" "}
                                        {t(
                                          "marketplace.detail.requirements.autoConfigured",
                                        )}
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
                              <InformationCircleIcon className="h-4 w-4 shrink-0" />
                              <div className="text-sm">
                                <strong>
                                  {t(
                                    "marketplace.detail.requirements.knowledgeBase.title",
                                  )}
                                </strong>{" "}
                                {t(
                                  "marketplace.detail.requirements.knowledgeBase.description",
                                  {
                                    count:
                                      requirements.knowledge_base.file_count,
                                  },
                                )}
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
                                <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600" />
                                <div className="text-sm">
                                  {t("marketplace.detail.requirements.none")}
                                </div>
                              </div>
                            </div>
                          )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-500 dark:text-neutral-400">
                        <CubeIcon className="mb-3 h-12 w-12 opacity-20" />
                        <p>{t("marketplace.detail.requirements.loading")}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Actions */}
          <div className="sticky top-4 h-fit space-y-6">
            {/* Action Card */}
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
              <div className="p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {t("marketplace.detail.actions.title")}
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={handleFork}
                    className="group relative w-full overflow-hidden rounded-xl bg-linear-to-r from-purple-600 via-pink-600 to-indigo-600 px-4 py-4 text-base font-bold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
                  >
                    <div className="absolute inset-0 bg-linear-to-r from-purple-700 via-pink-700 to-indigo-700 opacity-0 transition-opacity group-hover:opacity-100"></div>
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
                      {t("marketplace.detail.actions.fork")}
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
                        {listing.has_liked
                          ? t("marketplace.detail.actions.liked")
                          : t("marketplace.detail.actions.like")}
                      </span>
                    </div>
                  </button>

                  {/* Manage Button - Only visible to owner */}
                  {isOwner && onManage && (
                    <button
                      onClick={onManage}
                      className="w-full rounded-xl border-2 border-indigo-300 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 transition-all hover:bg-indigo-50 hover:scale-[1.02] dark:border-indigo-800 dark:bg-neutral-900 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <PencilIcon className="h-5 w-5" />
                        <span>{t("marketplace.detail.actions.manage")}</span>
                      </div>
                    </button>
                  )}
                </div>

                <div className="my-4 h-px w-full bg-neutral-200 dark:bg-neutral-800" />

                {/* Author Info */}
                <div>
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("marketplace.detail.meta.publishedBy")}
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
                      <span className="font-medium">
                        {t("marketplace.detail.meta.firstPublished")}
                      </span>{" "}
                      {new Date(
                        listing.first_published_at,
                      ).toLocaleDateString()}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">
                      {t("marketplace.detail.meta.lastUpdated")}
                    </span>{" "}
                    {new Date(listing.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Info Card */}
            <div className="rounded-2xl border border-blue-200 bg-linear-to-br from-blue-50 to-indigo-50 p-6 shadow-lg dark:border-blue-900/50 dark:from-blue-950/30 dark:to-indigo-950/30">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white">
                  <InformationCircleIcon className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="mb-1 font-semibold text-blue-900 dark:text-blue-100">
                    {t("marketplace.detail.aboutForking.title")}
                  </h4>
                  <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-200">
                    {t("marketplace.detail.aboutForking.description")}
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
          forkMode={listing.fork_mode}
          onForkSuccess={handleForkSuccess}
        />
      )}

      {/* Unpublish Confirmation Modal Removed */}
    </div>
  );
}
