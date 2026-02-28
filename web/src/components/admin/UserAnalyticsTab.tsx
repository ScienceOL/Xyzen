import { DEFAULT_TIMEZONE } from "@/configs/common";
import {
  redemptionService,
  type ConsumptionTopUserEntry,
  type ProviderOption,
  type UserConsumptionHeatmapEntry,
} from "@/service/redemptionService";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AdminFilterBar } from "./shared/AdminFilterBar";
import { AdminHeatmap } from "./shared/AdminHeatmap";
import {
  formatCompact,
  TIER_BADGE_COLORS,
  TIER_DISPLAY_NAMES,
} from "./shared/constants";

interface UserAnalyticsTabProps {
  adminSecret: string;
}

export function UserAnalyticsTab({ adminSecret }: UserAnalyticsTabProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [selectedTier, setSelectedTier] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedTool, setSelectedTool] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [topN, setTopN] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [tierOptions, setTierOptions] = useState<string[]>([]);
  const [toolOptions, setToolOptions] = useState<string[]>([]);
  const [heatmapData, setHeatmapData] = useState<UserConsumptionHeatmapEntry[]>(
    [],
  );
  const [topUsers, setTopUsers] = useState<ConsumptionTopUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTop, setLoadingTop] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch filter options from backend
  useEffect(() => {
    redemptionService
      .getFilterOptions(
        adminSecret,
        year,
        DEFAULT_TIMEZONE,
        selectedProvider || undefined,
      )
      .then((res) => {
        setModelOptions(res.models);
        setProviderOptions(res.providers);
        setTierOptions(res.tiers);
        setToolOptions(res.tools);
      })
      .catch(() => {});
  }, [adminSecret, year, selectedProvider]);

  const fetchHeatmap = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const data = await redemptionService.getUserConsumptionHeatmap(
          adminSecret,
          year,
          DEFAULT_TIMEZONE,
          selectedTier || undefined,
          selectedModel || undefined,
          selectedProvider || undefined,
          selectedTool || undefined,
        );
        if (!signal?.aborted) setHeatmapData(data);
      } catch (err) {
        if (!signal?.aborted)
          setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [
      adminSecret,
      year,
      selectedTier,
      selectedModel,
      selectedProvider,
      selectedTool,
    ],
  );

  const fetchTopUsers = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingTop(true);
      try {
        const data = await redemptionService.getConsumptionTopUsers(
          adminSecret,
          year,
          DEFAULT_TIMEZONE,
          selectedDate ?? undefined,
          selectedTier || undefined,
          selectedModel || undefined,
          topN,
          debouncedSearch || undefined,
          selectedProvider || undefined,
          true,
          selectedTool || undefined,
        );
        if (!signal?.aborted) setTopUsers(data);
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error ? err.message : "Failed to fetch top users",
          );
      } finally {
        if (!signal?.aborted) setLoadingTop(false);
      }
    },
    [
      adminSecret,
      year,
      selectedDate,
      selectedTier,
      selectedModel,
      topN,
      debouncedSearch,
      selectedProvider,
      selectedTool,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchHeatmap(controller.signal);
    return () => controller.abort();
  }, [fetchHeatmap]);

  useEffect(() => {
    const controller = new AbortController();
    fetchTopUsers(controller.signal);
    return () => controller.abort();
  }, [fetchTopUsers]);

  const chartData = useMemo<[string, number][]>(
    () => heatmapData.map((d) => [d.date, d.active_users]),
    [heatmapData],
  );

  const peakDAU = useMemo(() => {
    if (heatmapData.length === 0) return { count: 0, date: "" };
    return heatmapData.reduce(
      (best, d) =>
        d.active_users > best.count
          ? { count: d.active_users, date: d.date }
          : best,
      { count: 0, date: "" },
    );
  }, [heatmapData]);

  const handleProviderChange = useCallback((provider: string) => {
    setSelectedProvider(provider);
    setSelectedModel("");
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-red-950/30 p-4">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <AdminFilterBar
        year={year}
        onYearChange={(y) => {
          setYear(y);
          setSelectedDate(null);
        }}
        selectedTier={selectedTier}
        onTierChange={setSelectedTier}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        selectedProvider={selectedProvider}
        onProviderChange={handleProviderChange}
        providerOptions={providerOptions}
        modelOptions={modelOptions}
        tierOptions={tierOptions}
        selectedTool={selectedTool}
        onToolChange={setSelectedTool}
        toolOptions={toolOptions}
        showTierFilter
        showModelFilter
        showProviderFilter
        showToolFilter
      />

      {/* Heatmap */}
      <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-neutral-300">
            Daily Active Users
            {peakDAU.count > 0 && (
              <span className="ml-2 text-xs font-normal text-neutral-500">
                (Peak DAU: {peakDAU.count} at {peakDAU.date})
              </span>
            )}
          </h3>
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
        </div>
        <AdminHeatmap
          data={chartData}
          year={year}
          selectedDate={selectedDate}
          onDateClick={setSelectedDate}
          tooltipLabel="Active Users"
          colorScheme="blue"
          isLoading={loading}
          levelCount={4}
        />
      </div>

      {/* Rankings */}
      <div className="bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-700 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">
            User Rankings {selectedDate ? `(${selectedDate})` : `(${year})`}
          </h3>
          <div className="flex items-center gap-3">
            <select
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white"
            >
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
            </select>
            <input
              type="text"
              placeholder="Search user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white placeholder-neutral-500 w-36"
            />
          </div>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="min-w-full divide-y divide-neutral-700 text-sm">
            <thead className="bg-neutral-800 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-neutral-400">
                  #
                </th>
                <th className="px-4 py-2 text-left text-xs text-neutral-400">
                  User
                </th>
                <th className="px-4 py-2 text-left text-xs text-neutral-400">
                  Tier
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Tokens
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Input
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Output
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Credits
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Cost (USD)
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  LLM
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Tool
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {loadingTop ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-8 text-center text-neutral-500"
                  >
                    Loading...
                  </td>
                </tr>
              ) : topUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-8 text-center text-neutral-500"
                  >
                    No data
                  </td>
                </tr>
              ) : (
                topUsers.map((u, i) => (
                  <Fragment key={u.user_id}>
                    <tr
                      className={`hover:bg-neutral-800/50 cursor-pointer ${expandedUser === u.user_id ? "bg-indigo-900/10" : ""}`}
                      onClick={() =>
                        setExpandedUser(
                          expandedUser === u.user_id ? null : u.user_id,
                        )
                      }
                    >
                      <td className="px-4 py-2 text-neutral-500">{i + 1}</td>
                      <td className="px-4 py-2 text-neutral-300 truncate max-w-xs">
                        {u.user_id}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIER_BADGE_COLORS[u.subscription_tier] ?? TIER_BADGE_COLORS.unknown}`}
                        >
                          {TIER_DISPLAY_NAMES[u.subscription_tier] ??
                            u.subscription_tier}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-neutral-300">
                        {formatCompact(u.total_tokens)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-neutral-300">
                        {formatCompact(u.input_tokens ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-neutral-300">
                        {formatCompact(u.output_tokens ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-indigo-400">
                        {formatCompact(u.credits)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-neutral-300">
                        ${u.cost_usd.toFixed(4)}
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-300">
                        {u.llm_count ?? 0}
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-300">
                        {u.tool_call_count ?? 0}
                      </td>
                    </tr>
                    {expandedUser === u.user_id &&
                      u.by_tier &&
                      Object.keys(u.by_tier).length > 0 &&
                      Object.entries(u.by_tier).map(([tier, data]) => (
                        <tr
                          key={`${u.user_id}-${tier}`}
                          className="bg-neutral-900/50"
                        >
                          <td className="px-4 py-1.5" />
                          <td className="px-4 py-1.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIER_BADGE_COLORS[tier] ?? TIER_BADGE_COLORS.unknown}`}
                            >
                              {TIER_DISPLAY_NAMES[tier] ?? tier}
                            </span>
                          </td>
                          <td className="px-4 py-1.5 text-right text-neutral-500 text-xs">
                            -
                          </td>
                          <td className="px-4 py-1.5 text-right font-mono text-neutral-500 text-xs">
                            {formatCompact(data.total_tokens ?? 0)}
                          </td>
                          <td className="px-4 py-1.5 text-right font-mono text-neutral-500 text-xs">
                            {formatCompact(data.input_tokens ?? 0)}
                          </td>
                          <td className="px-4 py-1.5 text-right font-mono text-neutral-500 text-xs">
                            {formatCompact(data.output_tokens ?? 0)}
                          </td>
                          <td className="px-4 py-1.5 text-right text-indigo-400/70 text-xs">
                            {formatCompact(data.credits ?? 0)}
                          </td>
                          <td className="px-4 py-1.5 text-right font-mono text-neutral-500 text-xs">
                            ${(data.cost_usd ?? 0).toFixed(4)}
                          </td>
                          <td className="px-4 py-1.5 text-right text-neutral-500 text-xs">
                            {data.llm_count ?? 0}
                          </td>
                          <td className="px-4 py-1.5 text-right text-neutral-500 text-xs">
                            {data.tool_call_count ?? 0}
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
