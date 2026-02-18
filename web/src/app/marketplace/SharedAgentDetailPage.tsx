import { CopyButton } from "@/components/animate-ui/components/buttons/copy";
import ForkAgentModal from "@/components/features/ForkAgentModal";
import { useAuth } from "@/hooks/useAuth";
import Markdown from "@/lib/Markdown";
import {
  marketplaceService,
  type MarketplaceListingWithSnapshot,
  type RequirementsResponse,
} from "@/service/marketplaceService";
import { useXyzen } from "@/store";
import { initiateOAuthLogin } from "@/utils/authFlow";
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
} from "@heroicons/react/24/outline";
import {
  CheckBadgeIcon,
  HeartIcon as HeartSolidIcon,
} from "@heroicons/react/24/solid";
import { LogInIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// ── Pending agent share helpers (post-OAuth redirect) ──────────────────
const PENDING_AGENT_SHARE_KEY = "pending_agent_share";

function savePendingAgentShare(marketplaceId: string) {
  sessionStorage.setItem(PENDING_AGENT_SHARE_KEY, marketplaceId);
}

export function consumePendingAgentShare(): string | null {
  const id = sessionStorage.getItem(PENDING_AGENT_SHARE_KEY);
  if (id) sessionStorage.removeItem(PENDING_AGENT_SHARE_KEY);
  return id;
}

// ── Agent type detection helper ────────────────────────────────────────
function getAgentType(
  graphConfig: Record<string, unknown> | null | undefined,
): string {
  if (!graphConfig) return "ReAct";
  const metadata = graphConfig.metadata as Record<string, unknown> | undefined;
  if (metadata?.tags) {
    const tags = metadata.tags as string[];
    if (tags.includes("deep_research")) return "deep_research";
    if (tags.includes("react")) return "react";
  }
  const key = graphConfig.key as string | undefined;
  if (key) return key;
  const graph = graphConfig.graph as Record<string, unknown> | undefined;
  const nodes = graph?.nodes as Array<unknown> | undefined;
  if (nodes && nodes.length > 2) return "Custom Graph";
  return "ReAct";
}

function getDisplayPrompt(
  config: MarketplaceListingWithSnapshot["snapshot"]["configuration"],
): string | null {
  const gc = config.graph_config as Record<string, unknown> | undefined;
  if (gc?.prompt_config) {
    const pc = gc.prompt_config as Record<string, unknown>;
    if (pc.custom_instructions) return String(pc.custom_instructions);
  }
  return config.prompt || null;
}

// ── Component ──────────────────────────────────────────────────────────

interface SharedAgentDetailPageProps {
  marketplaceId: string;
  onBack: () => void;
}

type PageState =
  | { kind: "loading" }
  | { kind: "error" }
  | {
      kind: "loaded";
      listing: MarketplaceListingWithSnapshot;
      requirements: RequirementsResponse | null;
    };

export default function SharedAgentDetailPage({
  marketplaceId,
  onBack,
}: SharedAgentDetailPageProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [activeTab, setActiveTab] = useState<
    "readme" | "config" | "requirements"
  >("readme");
  const [showForkModal, setShowForkModal] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const autoForkTriggered = useRef(false);

  const addForkedAgent = useXyzen((s) => s.addForkedAgent);
  const setActivePanel = useXyzen((s) => s.setActivePanel);

  // ── Fetch listing data (public — optional auth) ────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [listing, requirements] = await Promise.allSettled([
          marketplaceService.getListingPublic(marketplaceId),
          marketplaceService.getRequirementsPublic(marketplaceId),
        ]);
        if (cancelled) return;
        if (listing.status === "rejected") {
          setState({ kind: "error" });
          return;
        }
        setState({
          kind: "loaded",
          listing: listing.value,
          requirements:
            requirements.status === "fulfilled" ? requirements.value : null,
        });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [marketplaceId]);

  // ── Auto-open fork modal after OAuth redirect ──────────────────────
  useEffect(() => {
    if (
      state.kind === "loaded" &&
      isAuthenticated &&
      !autoForkTriggered.current
    ) {
      const pending = consumePendingAgentShare();
      if (pending === marketplaceId) {
        autoForkTriggered.current = true;
        setShowForkModal(true);
      }
    }
  }, [state, isAuthenticated, marketplaceId]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleFork = useCallback(async () => {
    if (!isAuthenticated) {
      savePendingAgentShare(marketplaceId);
      try {
        await initiateOAuthLogin();
      } catch {
        sessionStorage.removeItem(PENDING_AGENT_SHARE_KEY);
      }
      return;
    }
    setShowForkModal(true);
  }, [isAuthenticated, marketplaceId]);

  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      savePendingAgentShare(marketplaceId);
      try {
        await initiateOAuthLogin();
      } catch {
        sessionStorage.removeItem(PENDING_AGENT_SHARE_KEY);
      }
      return;
    }
    if (state.kind !== "loaded") return;
    setLikeLoading(true);
    try {
      const result = await marketplaceService.toggleLike(marketplaceId);
      setState((prev) => {
        if (prev.kind !== "loaded") return prev;
        return {
          ...prev,
          listing: {
            ...prev.listing,
            has_liked: result.is_liked,
            likes_count: result.likes_count,
          },
        };
      });
    } catch {
      // silently ignore
    } finally {
      setLikeLoading(false);
    }
  }, [isAuthenticated, marketplaceId, state.kind]);

  const handleForkSuccess = useCallback(
    async (agentId: string) => {
      setActivePanel("chat");
      await new Promise((resolve) => setTimeout(resolve, 150));
      await addForkedAgent(agentId, { x: 100, y: 100 });
    },
    [setActivePanel, addForkedAgent],
  );

  const shareUrl = `${window.location.origin}/xyzen/og/agent/${marketplaceId}`;

  // ── Loading state ──────────────────────────────────────────────────
  if (state.kind === "loading") {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {t("marketplace.detail.loading")}
          </p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────
  if (state.kind === "error") {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <div className="max-w-md w-full rounded-lg border border-red-500/50 bg-red-50 p-4 text-red-900 dark:bg-red-950/50 dark:text-red-400">
          <div className="flex gap-2">
            <InformationCircleIcon className="h-4 w-4 shrink-0" />
            <div className="text-sm">{t("marketplace.detail.error")}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Loaded ─────────────────────────────────────────────────────────
  const { listing, requirements } = state;

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-linear-to-b from-neutral-50 to-white dark:from-neutral-950 dark:to-black custom-scrollbar">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header with back button */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="group mb-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:border-neutral-300 hover:shadow dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700"
          >
            <ArrowLeftIcon className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>{t("marketplace.detail.backToApp")}</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column - Agent Info */}
          <div className="lg:col-span-2 min-w-0 space-y-6">
            {/* Agent Header */}
            <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
              <div className="absolute inset-0 bg-linear-to-br from-purple-500/10 via-pink-500/10 to-indigo-500/10" />

              <div className="relative grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 p-6 sm:gap-x-6 sm:p-8">
                {/* Avatar */}
                {listing.avatar ? (
                  <img
                    src={listing.avatar}
                    alt={listing.name}
                    className="h-14 w-14 self-center rounded-xl object-cover ring-2 ring-white sm:h-24 sm:w-24 sm:self-start sm:rounded-2xl sm:ring-4 dark:ring-neutral-800"
                  />
                ) : (
                  <div className="flex h-14 w-14 self-center items-center justify-center rounded-xl bg-linear-to-br from-purple-500 via-pink-500 to-indigo-500 text-xl font-bold text-white shadow-xl sm:h-24 sm:w-24 sm:self-start sm:rounded-2xl sm:text-3xl">
                    {listing.name.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Title + Author */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h1 className="text-xl font-bold text-neutral-900 sm:text-3xl dark:text-neutral-100">
                      {listing.name}
                    </h1>
                    {listing.scope === "official" && (
                      <CheckBadgeIcon className="h-6 w-6 shrink-0 text-indigo-500 sm:h-7 sm:w-7 dark:text-indigo-400" />
                    )}
                    {listing.fork_mode === "locked" && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                        <LockClosedIcon className="h-3 w-3" />
                        {t("marketplace.forkMode.locked")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.detail.publishedBy")}{" "}
                    {listing.scope === "official" ? (
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {t("marketplace.badge.official")}
                      </span>
                    ) : (
                      <>
                        {listing.author_avatar_url && (
                          <img
                            src={listing.author_avatar_url}
                            alt=""
                            className="h-4 w-4 rounded-full object-cover"
                          />
                        )}
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">
                          {listing.author_display_name ||
                            (listing.user_id ?? "").split("@")[0] ||
                            listing.user_id}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                {/* Description */}
                <p className="col-span-full text-base leading-relaxed text-neutral-700 sm:col-span-1 sm:col-start-2 dark:text-neutral-300">
                  {listing.description || t("marketplace.detail.noDescription")}
                </p>

                {/* Tags */}
                {listing.tags.length > 0 && (
                  <div className="col-span-full flex flex-wrap gap-2 sm:col-span-1 sm:col-start-2">
                    {listing.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats bar */}
              <div className="relative border-t border-neutral-200 bg-white/50 px-6 py-4 backdrop-blur-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
                <div className="flex items-center gap-6 text-sm sm:gap-8">
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 sm:h-10 sm:w-10 dark:bg-red-950/30">
                      <HeartIcon className="h-4 w-4 text-red-500 sm:h-5 sm:w-5" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-neutral-900 sm:text-lg dark:text-neutral-100">
                        {listing.likes_count}
                      </div>
                      <div className="text-xs">
                        {t("marketplace.detail.stats.likes")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 sm:h-10 sm:w-10 dark:bg-blue-950/30">
                      <svg
                        className="h-4 w-4 text-blue-500 sm:h-5 sm:w-5"
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
                      <div className="text-base font-bold text-neutral-900 sm:text-lg dark:text-neutral-100">
                        {listing.forks_count}
                      </div>
                      <div className="text-xs">
                        {t("marketplace.detail.stats.forks")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 sm:h-10 sm:w-10 dark:bg-purple-950/30">
                      <EyeIcon className="h-4 w-4 text-purple-500 sm:h-5 sm:w-5" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-neutral-900 sm:text-lg dark:text-neutral-100">
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
                      </div>
                    )}
                  </div>
                )}

                {/* Configuration Tab */}
                {activeTab === "config" && (
                  <div className="space-y-6">
                    {listing.fork_mode === "locked" ? (
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
                    ) : listing.snapshot ? (
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

                        {getDisplayPrompt(listing.snapshot.configuration) && (
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

                        {listing.snapshot.mcp_server_configs &&
                          listing.snapshot.mcp_server_configs.length > 0 && (
                            <div>
                              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                {t("marketplace.detail.config.mcpServers", {
                                  count:
                                    listing.snapshot.mcp_server_configs.length,
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
                  </div>
                )}

                {/* Requirements Tab */}
                {activeTab === "requirements" && (
                  <div className="space-y-4">
                    {requirements ? (
                      <>
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
                  {/* Fork button */}
                  <button
                    onClick={handleFork}
                    className="group relative w-full overflow-hidden rounded-sm bg-linear-to-r from-purple-600 via-pink-600 to-indigo-600 px-4 py-4 text-base font-bold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
                  >
                    <div className="absolute inset-0 bg-linear-to-r from-purple-700 via-pink-700 to-indigo-700 opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="relative flex items-center justify-center gap-2">
                      {isAuthenticated ? (
                        <>
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
                        </>
                      ) : (
                        <>
                          <LogInIcon className="h-5 w-5" />
                          {t("marketplace.detail.actions.loginToFork")}
                        </>
                      )}
                    </div>
                  </button>

                  {/* Like button */}
                  <button
                    onClick={handleLike}
                    disabled={likeLoading}
                    className={`w-full rounded-sm border-2 px-4 py-3 text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-50 ${
                      listing.has_liked
                        ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                        : "border-neutral-300 bg-white text-neutral-700 hover:border-red-300 hover:bg-red-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-red-800 dark:hover:bg-red-950/30"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {isAuthenticated ? (
                        <>
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
                        </>
                      ) : (
                        <>
                          <LogInIcon className="h-5 w-5" />
                          <span>
                            {t("marketplace.detail.actions.loginToLike")}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                </div>

                <div className="my-4 h-px w-full bg-neutral-200 dark:bg-neutral-800" />

                {/* Share */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                    {t("marketplace.detail.actions.shareTitle")}
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
                      <p className="truncate text-xs text-neutral-500">
                        {shareUrl}
                      </p>
                    </div>
                    <CopyButton
                      content={shareUrl}
                      variant="outline"
                      size="default"
                    />
                  </div>
                </div>

                <div className="my-4 h-px w-full bg-neutral-200 dark:bg-neutral-800" />

                {/* Author Info */}
                <div>
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("marketplace.detail.meta.publishedBy")}
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    {listing.scope === "official" ? (
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {t("marketplace.badge.official")}
                      </span>
                    ) : (
                      <>
                        {listing.author_avatar_url && (
                          <img
                            src={listing.author_avatar_url}
                            alt=""
                            className="h-5 w-5 rounded-full object-cover"
                          />
                        )}
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                          {listing.author_display_name ||
                            (listing.user_id ?? "").split("@")[0] ||
                            listing.user_id}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="my-4 h-px w-full bg-neutral-200 dark:bg-neutral-800" />

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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-blue-500 text-white">
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

      {/* Fork Modal — only rendered when authenticated */}
      {isAuthenticated && (
        <ForkAgentModal
          open={showForkModal}
          onOpenChange={setShowForkModal}
          marketplaceId={listing.id}
          agentName={listing.name}
          agentDescription={listing.description || undefined}
          requirements={requirements ?? undefined}
          forkMode={listing.fork_mode}
          onForkSuccess={handleForkSuccess}
        />
      )}
    </div>
  );
}
