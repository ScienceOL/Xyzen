import { DEFAULT_TIMEZONE } from "@/configs/common";
import {
  marketplaceAdminService,
  type AdminMarketplaceListing,
  type DeveloperAgentEntry,
  type EarningsHeatmapEntry,
  type MarketplaceOverview,
  type TopDeveloperEntry,
} from "@/service/marketplaceAdminService";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AdminFilterBar } from "./shared/AdminFilterBar";
import { AdminHeatmap } from "./shared/AdminHeatmap";
import { AdminStatCards } from "./shared/AdminStatCards";
import {
  formatCompact,
  TIER_BADGE_COLORS,
  TIER_DISPLAY_NAMES,
} from "./shared/constants";

interface AgentMarketplaceTabProps {
  adminSecret: string;
}

export function AgentMarketplaceTab({ adminSecret }: AgentMarketplaceTabProps) {
  // Overview
  const [overview, setOverview] = useState<MarketplaceOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  // Heatmap
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [heatmapData, setHeatmapData] = useState<EarningsHeatmapEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loadingHeatmap, setLoadingHeatmap] = useState(true);
  const [selectedTier, setSelectedTier] = useState("");

  // Listings
  const [listings, setListings] = useState<AdminMarketplaceListing[]>([]);
  const [listingsTotal, setListingsTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [publishedFilter, setPublishedFilter] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(0);
  const [loadingListings, setLoadingListings] = useState(true);
  const pageSize = 15;

  // Top developers
  const [topDevelopers, setTopDevelopers] = useState<TopDeveloperEntry[]>([]);
  const [loadingTop, setLoadingTop] = useState(true);

  // Developer expand
  const [expandedDev, setExpandedDev] = useState<string | null>(null);
  const [devAgents, setDevAgents] = useState<DeveloperAgentEntry[]>([]);
  const [loadingDevAgents, setLoadingDevAgents] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, scopeFilter, publishedFilter, sortBy]);

  // Fetch overview
  const fetchOverview = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingOverview(true);
      try {
        const data = await marketplaceAdminService.getOverview(adminSecret);
        if (!signal?.aborted) setOverview(data);
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error ? err.message : "Failed to fetch overview",
          );
      } finally {
        if (!signal?.aborted) setLoadingOverview(false);
      }
    },
    [adminSecret],
  );

  // Fetch heatmap
  const fetchHeatmap = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingHeatmap(true);
      try {
        const data = await marketplaceAdminService.getEarningsHeatmap(
          adminSecret,
          year,
          DEFAULT_TIMEZONE,
          selectedTier || undefined,
        );
        if (!signal?.aborted) setHeatmapData(data);
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error ? err.message : "Failed to fetch heatmap",
          );
      } finally {
        if (!signal?.aborted) setLoadingHeatmap(false);
      }
    },
    [adminSecret, year, selectedTier],
  );

  // Fetch listings
  const fetchListings = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingListings(true);
      try {
        const data = await marketplaceAdminService.getListings(adminSecret, {
          search: debouncedSearch || undefined,
          scope: scopeFilter || undefined,
          is_published:
            publishedFilter === "true"
              ? true
              : publishedFilter === "false"
                ? false
                : undefined,
          sort_by: sortBy,
          limit: pageSize,
          offset: page * pageSize,
        });
        if (!signal?.aborted) {
          setListings(data.listings);
          setListingsTotal(data.total);
        }
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error ? err.message : "Failed to fetch listings",
          );
      } finally {
        if (!signal?.aborted) setLoadingListings(false);
      }
    },
    [adminSecret, debouncedSearch, scopeFilter, publishedFilter, sortBy, page],
  );

  // Fetch top developers
  const fetchTopData = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingTop(true);
      try {
        const devs = await marketplaceAdminService.getTopDevelopers(
          adminSecret,
          year,
          DEFAULT_TIMEZONE,
          selectedDate ?? undefined,
        );
        if (!signal?.aborted) setTopDevelopers(devs);
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Failed to fetch top developers",
          );
      } finally {
        if (!signal?.aborted) setLoadingTop(false);
      }
    },
    [adminSecret, year, selectedDate],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchOverview(controller.signal);
    return () => controller.abort();
  }, [fetchOverview]);

  useEffect(() => {
    const controller = new AbortController();
    fetchHeatmap(controller.signal);
    return () => controller.abort();
  }, [fetchHeatmap]);

  useEffect(() => {
    const controller = new AbortController();
    fetchListings(controller.signal);
    return () => controller.abort();
  }, [fetchListings]);

  useEffect(() => {
    const controller = new AbortController();
    fetchTopData(controller.signal);
    return () => controller.abort();
  }, [fetchTopData]);

  // Heatmap chart data
  const chartData = useMemo<[string, number][]>(
    () => heatmapData.map((d) => [d.date, d.total_earned]),
    [heatmapData],
  );

  // Handlers
  const handleTogglePublish = async (id: string) => {
    try {
      await marketplaceAdminService.togglePublish(adminSecret, id);
      fetchListings();
      fetchOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle publish");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await marketplaceAdminService.deleteListing(adminSecret, id);
      setDeleteId(null);
      fetchListings();
      fetchOverview();
      fetchTopData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete listing");
    }
  };

  const handleDevClick = async (devUserId: string) => {
    if (expandedDev === devUserId) {
      setExpandedDev(null);
      return;
    }
    setExpandedDev(devUserId);
    setLoadingDevAgents(true);
    try {
      const agents = await marketplaceAdminService.getDeveloperAgents(
        adminSecret,
        devUserId,
      );
      setDevAgents(agents);
    } catch {
      setDevAgents([]);
    } finally {
      setLoadingDevAgents(false);
    }
  };

  const totalPages = Math.ceil(listingsTotal / pageSize);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md bg-red-950/30 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Section 1: Overview Stat Cards */}
      <AdminStatCards
        isLoading={loadingOverview}
        columns={6}
        cards={[
          { label: "Total Listings", value: overview?.total_listings ?? 0 },
          {
            label: "Published",
            value: overview?.published_listings ?? 0,
          },
          {
            label: "Community",
            value: overview?.community_listings ?? 0,
          },
          { label: "Total Forks", value: overview?.total_forks ?? 0 },
          {
            label: "Developer Earnings",
            value: overview?.total_developer_earnings ?? 0,
          },
          {
            label: "Unique Creators",
            value: overview?.unique_developers ?? 0,
          },
        ]}
      />

      {/* Section 2: Earnings Heatmap */}
      <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-neutral-300">
            Daily Developer Earnings
          </h3>
          <div className="flex items-center gap-3">
            {selectedDate && (
              <span className="text-xs text-indigo-400 flex items-center gap-1.5">
                Showing: {selectedDate}
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="hover:text-indigo-300 text-indigo-500"
                  aria-label="Clear date selection"
                >
                  ✕
                </button>
              </span>
            )}
            <AdminFilterBar
              year={year}
              onYearChange={(y) => {
                setYear(y);
                setSelectedDate(null);
              }}
              selectedTier={selectedTier}
              onTierChange={setSelectedTier}
              showTierFilter
            />
          </div>
        </div>
        <AdminHeatmap
          data={chartData}
          year={year}
          selectedDate={selectedDate}
          onDateClick={setSelectedDate}
          tooltipLabel="Earnings (credits)"
          colorScheme="orange"
          isLoading={loadingHeatmap}
        />
      </div>

      {/* Section 3: Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Agent Listing Management */}
        <div className="bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-700">
            <h3 className="text-sm font-semibold text-white mb-3">
              Agent Listings
            </h3>
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Search name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
              />
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">All Scope</option>
                <option value="official">Official</option>
                <option value="community">Community</option>
              </select>
              <select
                value={publishedFilter}
                onChange={(e) => setPublishedFilter(e.target.value)}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">All Status</option>
                <option value="true">Published</option>
                <option value="false">Hidden</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="recent">Recent</option>
                <option value="forks">Forks</option>
                <option value="views">Views</option>
                <option value="likes">Likes</option>
                <option value="earnings">Earnings</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[420px]">
            <table className="min-w-full divide-y divide-neutral-700 text-xs">
              <thead className="bg-neutral-800 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-neutral-400">Name</th>
                  <th className="px-2 py-2 text-left text-neutral-400">
                    Scope
                  </th>
                  <th className="px-2 py-2 text-center text-neutral-400">
                    Status
                  </th>
                  <th className="px-2 py-2 text-right text-neutral-400">
                    Forks
                  </th>
                  <th className="px-2 py-2 text-right text-neutral-400">
                    Views
                  </th>
                  <th className="px-2 py-2 text-right text-neutral-400">
                    Likes
                  </th>
                  <th className="px-2 py-2 text-right text-neutral-400">
                    Earned
                  </th>
                  <th className="px-2 py-2 text-center text-neutral-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {loadingListings ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center text-neutral-500"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : listings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center text-neutral-500"
                    >
                      No listings found
                    </td>
                  </tr>
                ) : (
                  listings.map((l) => (
                    <tr key={l.id} className="hover:bg-neutral-800/50">
                      <td className="px-3 py-2 text-neutral-300 max-w-[140px] truncate">
                        <div className="flex items-center gap-1.5">
                          {l.avatar && (
                            <img
                              src={l.avatar}
                              alt=""
                              className="w-5 h-5 rounded-full shrink-0"
                            />
                          )}
                          <span className="truncate">{l.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            l.scope === "official"
                              ? "bg-blue-900/40 text-blue-400"
                              : "bg-neutral-700 text-neutral-300"
                          }`}
                        >
                          {l.scope}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            l.is_published ? "bg-green-500" : "bg-neutral-600"
                          }`}
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-neutral-400">
                        {l.forks_count}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-neutral-400">
                        {l.views_count}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-neutral-400">
                        {l.likes_count}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-orange-400">
                        {formatCompact(l.total_earned)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleTogglePublish(l.id)}
                            title={
                              l.is_published
                                ? "Hide listing"
                                : "Publish listing"
                            }
                            className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                          >
                            {l.is_published ? (
                              <EyeSlashIcon className="w-3.5 h-3.5" />
                            ) : (
                              <EyeIcon className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {deleteId === l.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(l.id)}
                                className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] hover:bg-red-500"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteId(null)}
                                className="px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300 text-[10px] hover:bg-neutral-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteId(l.id)}
                              title="Delete listing"
                              className="p-1 rounded hover:bg-red-900/40 text-neutral-400 hover:text-red-400 transition-colors"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {listingsTotal > 0 && (
            <div className="px-4 py-2 border-t border-neutral-700 flex items-center justify-between text-xs text-neutral-400">
              <span>
                {page * pageSize + 1}–
                {Math.min((page + 1) * pageSize, listingsTotal)} of{" "}
                {listingsTotal}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30"
                >
                  Prev
                </button>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Developer Ranking */}
        <div className="bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-700">
            <h3 className="text-sm font-semibold text-white">
              Developer Ranking
            </h3>
          </div>
          <div className="overflow-x-auto max-h-[480px]">
            <table className="min-w-full divide-y divide-neutral-700 text-xs">
              <thead className="bg-neutral-800 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-neutral-400">#</th>
                  <th className="px-3 py-2 text-left text-neutral-400">
                    Developer
                  </th>
                  <th className="px-2 py-2 text-left text-neutral-400">Tier</th>
                  <th className="px-2 py-2 text-right text-neutral-400">
                    Agents
                  </th>
                  <th className="px-2 py-2 text-right text-neutral-400">
                    Earned
                  </th>
                  <th className="px-2 py-2 text-right text-neutral-400">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {loadingTop ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-neutral-500"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : topDevelopers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-neutral-500"
                    >
                      No data
                    </td>
                  </tr>
                ) : (
                  topDevelopers.map((d, i) => (
                    <Fragment key={d.developer_user_id}>
                      <tr
                        className="hover:bg-neutral-800/50 cursor-pointer"
                        onClick={() => handleDevClick(d.developer_user_id)}
                      >
                        <td className="px-3 py-1.5 text-neutral-500">
                          <div className="flex items-center gap-1">
                            {expandedDev === d.developer_user_id ? (
                              <ChevronDownIcon className="w-3 h-3 text-neutral-400" />
                            ) : (
                              <ChevronRightIcon className="w-3 h-3 text-neutral-400" />
                            )}
                            {i + 1}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-neutral-300 truncate max-w-[120px]">
                          {d.developer_user_id}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIER_BADGE_COLORS[d.subscription_tier] ?? TIER_BADGE_COLORS.unknown}`}
                          >
                            {TIER_DISPLAY_NAMES[d.subscription_tier] ??
                              d.subscription_tier}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-neutral-400">
                          {d.listing_count}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-orange-400">
                          {formatCompact(d.total_earned)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-green-400">
                          {formatCompact(d.available_balance)}
                        </td>
                      </tr>
                      {expandedDev === d.developer_user_id && (
                        <tr key={`${d.developer_user_id}-expand`}>
                          <td colSpan={6} className="p-0">
                            <div className="bg-neutral-800/60 border-y border-neutral-700">
                              {loadingDevAgents ? (
                                <div className="py-4 text-center text-neutral-500 text-xs">
                                  Loading agents...
                                </div>
                              ) : devAgents.length === 0 ? (
                                <div className="py-4 text-center text-neutral-500 text-xs">
                                  No agents found
                                </div>
                              ) : (
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-neutral-500">
                                      <th className="px-3 py-1.5 text-left">
                                        Agent
                                      </th>
                                      <th className="px-2 py-1.5 text-left">
                                        Scope
                                      </th>
                                      <th className="px-2 py-1.5 text-center">
                                        Status
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        Forks
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        Views
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        Likes
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        Earned
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        Consumed
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-700/50">
                                    {devAgents.map((a) => (
                                      <tr
                                        key={a.marketplace_id}
                                        className="hover:bg-neutral-700/30"
                                      >
                                        <td className="px-3 py-1.5 text-neutral-300 max-w-[120px] truncate">
                                          <div className="flex items-center gap-1.5">
                                            {a.avatar && (
                                              <img
                                                src={a.avatar}
                                                alt=""
                                                className="w-4 h-4 rounded-full shrink-0"
                                              />
                                            )}
                                            <span className="truncate">
                                              {a.name ?? "Unknown"}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                              a.scope === "official"
                                                ? "bg-blue-900/40 text-blue-400"
                                                : "bg-neutral-700 text-neutral-300"
                                            }`}
                                          >
                                            {a.scope}
                                          </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          <span
                                            className={`inline-block w-2 h-2 rounded-full ${
                                              a.is_published
                                                ? "bg-green-500"
                                                : "bg-neutral-600"
                                            }`}
                                          />
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono text-neutral-400">
                                          {a.forks_count}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono text-neutral-400">
                                          {a.views_count}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono text-neutral-400">
                                          {a.likes_count}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-semibold text-orange-400">
                                          {formatCompact(a.total_earned)}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono text-neutral-400">
                                          {formatCompact(a.total_consumed)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
