import { DEFAULT_TIMEZONE } from "@/configs/common";
import {
  redemptionService,
  type CreditHeatmapEntry,
  type CreditRankingEntry,
} from "@/service/redemptionService";
import { subscriptionService } from "@/service/subscriptionService";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminFilterBar } from "./shared/AdminFilterBar";
import { AdminHeatmap } from "./shared/AdminHeatmap";
import { AdminStatCards } from "./shared/AdminStatCards";
import { formatCompact } from "./shared/constants";

const SOURCE_OPTIONS = [
  { value: "", label: "All" },
  { value: "welcome_bonus", label: "Welcome Bonus" },
  { value: "redemption_code", label: "Redemption Code" },
  { value: "subscription_monthly", label: "Subscription Monthly" },
  { value: "daily_checkin", label: "Daily Check-in" },
];

const LIMIT_OPTIONS = [10, 20, 50, 100];

interface RevenueAnalyticsTabProps {
  adminSecret: string;
}

export function RevenueAnalyticsTab({ adminSecret }: RevenueAnalyticsTabProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedTier, setSelectedTier] = useState("");
  const [selectedLimit, setSelectedLimit] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [heatmapData, setHeatmapData] = useState<CreditHeatmapEntry[]>([]);
  const [rankings, setRankings] = useState<CreditRankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tierOptions, setTierOptions] = useState<
    { value: string; label: string }[]
  >([]);

  // Load tier options from plans API
  useEffect(() => {
    subscriptionService
      .getPlans()
      .then((res) => {
        setTierOptions(
          res.plans.map((p) => ({ value: p.name, label: p.display_name })),
        );
      })
      .catch(() => {});
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchHeatmap = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const data = await redemptionService.getCreditHeatmap(
          adminSecret,
          year,
          DEFAULT_TIMEZONE,
          undefined,
          selectedTier || undefined,
        );
        if (!signal?.aborted) setHeatmapData(data);
      } catch (err) {
        if (!signal?.aborted)
          setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [adminSecret, year, selectedTier],
  );

  const fetchRankings = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingRankings(true);
      try {
        const data = await redemptionService.getCreditRankings(
          adminSecret,
          year,
          DEFAULT_TIMEZONE,
          undefined,
          selectedTier || undefined,
          selectedDate ?? undefined,
          selectedLimit,
          debouncedSearch || undefined,
        );
        if (!signal?.aborted) setRankings(data);
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error ? err.message : "Failed to fetch rankings",
          );
      } finally {
        if (!signal?.aborted) setLoadingRankings(false);
      }
    },
    [
      adminSecret,
      year,
      selectedTier,
      selectedDate,
      selectedLimit,
      debouncedSearch,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchHeatmap(controller.signal);
    return () => controller.abort();
  }, [fetchHeatmap]);

  useEffect(() => {
    const controller = new AbortController();
    fetchRankings(controller.signal);
    return () => controller.abort();
  }, [fetchRankings]);

  const chartData = useMemo<[string, number][]>(() => {
    const fieldMap: Record<string, keyof CreditHeatmapEntry> = {
      "": "total_credits",
      welcome_bonus: "welcome_bonus_credits",
      redemption_code: "redemption_code_credits",
      subscription_monthly: "subscription_monthly_credits",
      daily_checkin: "daily_checkin_credits",
    };
    const field = fieldMap[selectedSource] || "total_credits";
    return heatmapData.map((d) => [d.date, d[field] as number]);
  }, [heatmapData, selectedSource]);

  const summaryStats = useMemo(() => {
    const source = selectedDate
      ? heatmapData.filter((d) => d.date === selectedDate)
      : heatmapData;
    return source.reduce(
      (acc, d) => ({
        total_credits: acc.total_credits + d.total_credits,
        welcome_bonus_credits:
          acc.welcome_bonus_credits + d.welcome_bonus_credits,
        redemption_code_credits:
          acc.redemption_code_credits + d.redemption_code_credits,
        subscription_monthly_credits:
          acc.subscription_monthly_credits + d.subscription_monthly_credits,
        daily_checkin_credits:
          acc.daily_checkin_credits + d.daily_checkin_credits,
        transaction_count: acc.transaction_count + d.transaction_count,
        unique_users: acc.unique_users + d.unique_users,
      }),
      {
        total_credits: 0,
        welcome_bonus_credits: 0,
        redemption_code_credits: 0,
        subscription_monthly_credits: 0,
        daily_checkin_credits: 0,
        transaction_count: 0,
        unique_users: 0,
      },
    );
  }, [heatmapData, selectedDate]);

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
      <div className="flex flex-wrap items-center gap-3">
        <AdminFilterBar
          year={year}
          onYearChange={(y) => {
            setYear(y);
            setSelectedDate(null);
          }}
        />
        {/* Tier filter */}
        <select
          value={selectedTier}
          onChange={(e) => setSelectedTier(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Tiers</option>
          {tierOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {/* Source filter */}
        <select
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Stat Cards */}
      <AdminStatCards
        isLoading={loading}
        columns={7}
        cards={[
          {
            label: "Total Credits",
            value: summaryStats.total_credits,
            colorClass: "from-orange-950/30 to-orange-900/30 border-orange-800",
          },
          {
            label: "Welcome Bonus",
            value: summaryStats.welcome_bonus_credits,
            colorClass: "from-amber-950/30 to-amber-900/30 border-amber-800",
          },
          {
            label: "Redemption Code",
            value: summaryStats.redemption_code_credits,
            colorClass: "from-yellow-950/30 to-yellow-900/30 border-yellow-800",
          },
          {
            label: "Subscription",
            value: summaryStats.subscription_monthly_credits,
            colorClass: "from-lime-950/30 to-lime-900/30 border-lime-800",
          },
          {
            label: "Check-in",
            value: summaryStats.daily_checkin_credits,
            colorClass: "from-green-950/30 to-green-900/30 border-green-800",
          },
          {
            label: "Transactions",
            value: summaryStats.transaction_count,
            colorClass: "from-blue-950/30 to-blue-900/30 border-blue-800",
          },
          {
            label: selectedDate ? "Users" : "Unique Users",
            value: summaryStats.unique_users,
            colorClass: "from-purple-950/30 to-purple-900/30 border-purple-800",
          },
        ]}
      />

      {/* Heatmap */}
      <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-neutral-300">
            Daily Credit Inflow
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
          tooltipLabel="Credits"
          colorScheme="orange"
          isLoading={loading}
          levelCount={4}
        />
      </div>

      {/* Rankings */}
      <div className="bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-700 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">
            User Credit Rankings{" "}
            {selectedDate ? `(${selectedDate})` : `(${year})`}
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={selectedLimit}
              onChange={(e) => setSelectedLimit(Number(e.target.value))}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
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
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Total Credits
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Welcome Bonus
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Redemption Code
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Subscription
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Check-in
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Transactions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {loadingRankings ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-500">
                    Loading...
                  </td>
                </tr>
              ) : rankings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-500">
                    No data
                  </td>
                </tr>
              ) : (
                rankings.map((r, i) => (
                  <tr key={r.user_id} className="hover:bg-neutral-800/50">
                    <td className="px-4 py-2 text-neutral-500">{i + 1}</td>
                    <td className="px-4 py-2 text-neutral-300 truncate max-w-xs">
                      {r.user_id}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-orange-400">
                      {formatCompact(r.total_credits)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {formatCompact(r.welcome_bonus_credits)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {formatCompact(r.redemption_code_credits)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {formatCompact(r.subscription_monthly_credits)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {formatCompact(r.daily_checkin_credits)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {r.transaction_count}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
