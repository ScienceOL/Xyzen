import { DEFAULT_TIMEZONE } from "@/configs/common";
import {
  redemptionService,
  type NewUsersHeatmapEntry,
} from "@/service/redemptionService";
import {
  subscriptionService,
  type AdminSubscriptionEntry,
  type SubscriptionRoleRead,
} from "@/service/subscriptionService";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminFilterBar } from "./shared/AdminFilterBar";
import { AdminHeatmap } from "./shared/AdminHeatmap";
import {
  formatBytes,
  formatDate,
  isExpired,
  TIER_COLORS,
} from "./shared/constants";

interface SubscriptionManagementTabProps {
  adminSecret: string;
}

export function SubscriptionManagementTab({
  adminSecret,
}: SubscriptionManagementTabProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [selectedTierFilter, setSelectedTierFilter] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [heatmapData, setHeatmapData] = useState<NewUsersHeatmapEntry[]>([]);
  const [entries, setEntries] = useState<AdminSubscriptionEntry[]>([]);
  const [plans, setPlans] = useState<SubscriptionRoleRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHeatmap, setLoadingHeatmap] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, planRes] = await Promise.all([
        subscriptionService.adminListSubscriptions(adminSecret),
        subscriptionService.getPlans(),
      ]);
      setEntries(subRes.subscriptions);
      setPlans(planRes.plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  const fetchHeatmap = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingHeatmap(true);
      try {
        const data = await redemptionService.getNewUsersHeatmap(
          adminSecret,
          year,
          DEFAULT_TIMEZONE,
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
    [adminSecret, year],
  );

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  useEffect(() => {
    const controller = new AbortController();
    fetchHeatmap(controller.signal);
    return () => controller.abort();
  }, [fetchHeatmap]);

  const handleAssignRole = async (userId: string, roleId: string) => {
    setAssigning(userId);
    try {
      await subscriptionService.adminAssignRole(adminSecret, {
        user_id: userId,
        role_id: roleId,
      });
      await fetchSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign role");
    } finally {
      setAssigning(null);
    }
  };

  const tierCounts = useMemo(() => {
    return entries.reduce<Record<string, number>>((acc, e) => {
      const name = e.role_name ?? "unknown";
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
  }, [entries]);

  const chartData = useMemo<[string, number][]>(
    () => heatmapData.map((d) => [d.date, d.new_users]),
    [heatmapData],
  );

  const filteredEntries = useMemo(() => {
    let filtered = entries;
    if (selectedTierFilter) {
      filtered = filtered.filter((e) => e.role_name === selectedTierFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      filtered = filtered.filter((e) =>
        e.subscription.user_id.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [entries, selectedTierFilter, debouncedSearch]);

  if (error) {
    return (
      <div className="rounded-md bg-red-950/30 p-4">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* New Users Heatmap */}
      <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-neutral-300">
            Daily New Users
          </h3>
          <AdminFilterBar year={year} onYearChange={setYear} />
        </div>
        <AdminHeatmap
          data={chartData}
          year={year}
          selectedDate={null}
          onDateClick={() => {}}
          tooltipLabel="New Users"
          colorScheme="purple"
          isLoading={loadingHeatmap}
          levelCount={5}
        />
      </div>

      {/* Tier Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          onClick={() => setSelectedTierFilter(null)}
          className={`rounded-lg p-4 border text-left transition-colors ${
            selectedTierFilter === null
              ? "border-indigo-500 bg-indigo-950/30"
              : "border-neutral-700 bg-neutral-900 hover:bg-neutral-800"
          }`}
        >
          <h3 className="text-xs font-medium text-neutral-400">All Users</h3>
          <p className="text-2xl font-bold text-white mt-1">
            {loading ? "..." : entries.length}
          </p>
        </button>
        {plans.map((plan) => (
          <button
            key={plan.id}
            onClick={() =>
              setSelectedTierFilter(
                selectedTierFilter === plan.name ? null : plan.name,
              )
            }
            className={`rounded-lg p-4 border text-left transition-colors ${
              selectedTierFilter === plan.name
                ? "border-indigo-500 bg-indigo-950/30"
                : "border-neutral-700 bg-neutral-900 hover:bg-neutral-800"
            }`}
          >
            <h3 className="text-xs font-medium text-neutral-400">
              {plan.display_name}
            </h3>
            <p className="text-2xl font-bold text-white mt-1">
              {loading ? "..." : tierCounts[plan.name] || 0}
            </p>
          </button>
        ))}
      </div>

      {/* User List */}
      <div className="bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-700 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">
            Users{" "}
            {selectedTierFilter && (
              <span className="text-xs text-neutral-400">
                — {selectedTierFilter}
              </span>
            )}
          </h3>
          <input
            type="text"
            placeholder="Search user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white placeholder-neutral-500 w-40"
          />
        </div>
        {loading ? (
          <div className="py-12 text-center text-neutral-500">Loading...</div>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <table className="min-w-full divide-y divide-neutral-700 text-sm">
              <thead className="bg-neutral-800 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-neutral-400">
                    User
                  </th>
                  <th className="px-4 py-2 text-left text-xs text-neutral-400">
                    Plan
                  </th>
                  <th className="px-4 py-2 text-left text-xs text-neutral-400">
                    Expires
                  </th>
                  <th className="px-4 py-2 text-left text-xs text-neutral-400">
                    Created
                  </th>
                  <th className="px-4 py-2 text-left text-xs text-neutral-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-neutral-500"
                    >
                      No users found
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const expired = isExpired(entry.subscription.expires_at);
                    return (
                      <tr
                        key={entry.subscription.id}
                        className={`hover:bg-neutral-800/50 ${expired ? "opacity-60" : ""}`}
                      >
                        <td className="px-4 py-2 text-neutral-300 truncate max-w-xs">
                          {entry.subscription.user_id}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              TIER_COLORS[entry.role_name ?? ""] ??
                              TIER_COLORS.free
                            }`}
                          >
                            {entry.role_display_name ?? "Unknown"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span
                            className={
                              expired
                                ? "text-red-400 font-medium"
                                : "text-neutral-300"
                            }
                          >
                            {formatDate(entry.subscription.expires_at)}
                            {expired && " (expired)"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-neutral-400 text-sm">
                          {formatDate(entry.subscription.created_at)}
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={entry.subscription.role_id}
                            disabled={assigning === entry.subscription.user_id}
                            onChange={(e) =>
                              handleAssignRole(
                                entry.subscription.user_id,
                                e.target.value,
                              )
                            }
                            className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white disabled:opacity-50"
                          >
                            {plans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.display_name} (
                                {formatBytes(plan.storage_limit_bytes)})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
