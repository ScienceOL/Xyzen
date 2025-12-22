import type { ConsumeRecordResponse } from "@/service/redemptionService";
import { redemptionService } from "@/service/redemptionService";
import {
  ChartBarIcon,
  TrophyIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";

interface UserRankingsTabProps {
  adminSecret: string;
  backendUrl: string;
}

type TimeRange = "today" | "week" | "month" | "all";

interface UserRanking {
  user_id: string;
  username: string;
  auth_provider: string;
  total_amount: number;
  total_count: number;
  total_tokens: number;
}

export function UserRankingsTab({ adminSecret }: UserRankingsTabProps) {
  const [records, setRecords] = useState<ConsumeRecordResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all"); // Changed default from "today" to "all"

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log(
        "Fetching consume records with adminSecret:",
        adminSecret ? "***" : "missing",
      );
      const data = await redemptionService.getConsumeRecords(adminSecret);
      console.log("Fetched consume records:", data.length, "records");
      setRecords(data);
    } catch (err) {
      console.error("Error fetching consume records:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch consume records",
      );
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Helper function to extract username from user_id
  const extractUsername = (userId: string): string => {
    if (userId.includes("@")) {
      return userId.split("@")[0];
    }
    if (userId.includes("/")) {
      return userId.split("/").pop() || userId;
    }
    return userId;
  };

  // Calculate date range
  const getDateRange = (range: TimeRange): Date => {
    const now = new Date();
    switch (range) {
      case "today":
        return new Date(now.setHours(0, 0, 0, 0));
      case "week": {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo;
      }
      case "month": {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return monthAgo;
      }
      case "all":
      default:
        return new Date(0); // Beginning of time
    }
  };

  // Aggregate and rank users
  const userRankings = useMemo(() => {
    const startDate = getDateRange(timeRange);
    const userMap = new Map<string, UserRanking>();

    console.log(
      `Processing ${records.length} records for time range: ${timeRange}`,
    );
    console.log(`Start date for filtering:`, startDate);

    records.forEach((record) => {
      const recordDate = new Date(record.created_at);
      if (recordDate < startDate) {
        return;
      }

      const existing = userMap.get(record.user_id) || {
        user_id: record.user_id,
        username: extractUsername(record.user_id),
        auth_provider: record.auth_provider,
        total_amount: 0,
        total_count: 0,
        total_tokens: 0,
      };

      userMap.set(record.user_id, {
        ...existing,
        total_amount: existing.total_amount + record.amount,
        total_count: existing.total_count + 1,
        total_tokens: existing.total_tokens + (record.total_tokens || 0),
      });
    });

    console.log(`Aggregated ${userMap.size} users after filtering`);

    // Sort by total amount descending
    const sorted = Array.from(userMap.values()).sort(
      (a, b) => b.total_amount - a.total_amount,
    );

    console.log(`Top 3 users:`, sorted.slice(0, 3));

    return sorted;
  }, [records, timeRange]);

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const getTimeRangeLabel = (range: TimeRange): string => {
    switch (range) {
      case "today":
        return "Today";
      case "week":
        return "Last 7 Days";
      case "month":
        return "Last 30 Days";
      case "all":
        return "All Time";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <div className="text-neutral-500 dark:text-neutral-400">
          Loading consumption records...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-4">
        <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
          Error loading data
        </p>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={fetchRecords}
          className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-sm hover:bg-red-200 dark:hover:bg-red-900/50"
        >
          Retry
        </button>
      </div>
    );
  }

  // Show info about total records fetched
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="text-neutral-400 dark:text-neutral-500">
          <ChartBarIcon className="h-16 w-16 mx-auto mb-4" />
        </div>
        <div className="text-neutral-700 dark:text-neutral-300 font-medium">
          No consumption records found
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Consumption data will appear here once users start using the system
        </p>
      </div>
    );
  }

  const totalStats = userRankings.reduce(
    (acc, user) => ({
      amount: acc.amount + user.total_amount,
      tokens: acc.tokens + user.total_tokens,
      count: acc.count + user.total_count,
    }),
    { amount: 0, tokens: 0, count: 0 },
  );

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <ChartBarIcon className="h-5 w-5" />
            <span className="text-sm font-medium">
              {records.length.toLocaleString()} total consumption records loaded
            </span>
          </div>
          <button
            onClick={fetchRecords}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Refresh Data
          </button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["today", "week", "month", "all"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                timeRange === range
                  ? "bg-blue-500 text-white"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              {getTimeRangeLabel(range)}
            </button>
          ))}
        </div>

        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          {userRankings.length} users
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/30 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-1">
            <TrophyIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Total Consumption
            </h3>
          </div>
          <p className="text-2xl font-bold text-amber-900 dark:text-amber-50">
            {formatNumber(totalStats.amount)}
          </p>
        </div>

        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950/30 dark:to-cyan-900/30 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
          <div className="flex items-center gap-2 mb-1">
            <ChartBarIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-sm font-medium text-cyan-900 dark:text-cyan-100">
              Total Tokens
            </h3>
          </div>
          <p className="text-2xl font-bold text-cyan-900 dark:text-cyan-50">
            {formatNumber(totalStats.tokens)}
          </p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/30 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-2 mb-1">
            <UserIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              Total Requests
            </h3>
          </div>
          <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-50">
            {formatNumber(totalStats.count)}
          </p>
        </div>
      </div>

      {/* Rankings Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            User Rankings - {getTimeRangeLabel(timeRange)}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
            <thead className="bg-neutral-50 dark:bg-neutral-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Consumption
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Requests
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Avg/Request
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-700">
              {userRankings.map((user, index) => (
                <tr
                  key={user.user_id}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm ${
                        index === 0
                          ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-white shadow-lg"
                          : index === 1
                            ? "bg-gradient-to-br from-gray-300 to-gray-500 text-white shadow-md"
                            : index === 2
                              ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md"
                              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                      }`}
                    >
                      {index === 0 && "🥇"}
                      {index === 1 && "🥈"}
                      {index === 2 && "🥉"}
                      {index > 2 && index + 1}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-5 w-5 text-neutral-400" />
                      <div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-white">
                          {user.username}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                          {user.user_id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200">
                      {user.auth_provider}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-neutral-900 dark:text-white">
                    {formatNumber(user.total_amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-700 dark:text-neutral-300">
                    {formatNumber(user.total_tokens)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-700 dark:text-neutral-300">
                    {formatNumber(user.total_count)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-600 dark:text-neutral-400">
                    {formatNumber(
                      Math.round(user.total_amount / user.total_count),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {userRankings.length === 0 && (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          No consumption data for the selected time range
        </div>
      )}
    </div>
  );
}
