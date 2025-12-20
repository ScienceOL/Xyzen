import type { ConsumeRecordResponse } from "@/service/redemptionService";
import { redemptionService } from "@/service/redemptionService";
import { ArrowTrendingUpIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";

interface TrendChartTabProps {
  adminSecret: string;
  backendUrl: string;
}

interface DailyData {
  date: string;
  amount: number;
  tokens: number;
  count: number;
}

export function TrendChartTab({ adminSecret }: TrendChartTabProps) {
  const [records, setRecords] = useState<ConsumeRecordResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysToShow, setDaysToShow] = useState(30);

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log(
        "Fetching consume records for trend chart with adminSecret:",
        adminSecret ? "***" : "missing",
      );
      const data = await redemptionService.getConsumeRecords(adminSecret);
      console.log("Fetched consume records for trend:", data.length, "records");
      setRecords(data);
    } catch (err) {
      console.error("Error fetching consume records for trend:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch consume records",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [adminSecret]);

  // Aggregate data by day
  const dailyData = useMemo(() => {
    const dataMap = new Map<string, DailyData>();

    records.forEach((record) => {
      const date = new Date(record.created_at).toISOString().split("T")[0];
      const existing = dataMap.get(date) || {
        date,
        amount: 0,
        tokens: 0,
        count: 0,
      };

      dataMap.set(date, {
        date,
        amount: existing.amount + record.amount,
        tokens: existing.tokens + (record.total_tokens || 0),
        count: existing.count + 1,
      });
    });

    // Sort by date and get last N days
    const sorted = Array.from(dataMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-daysToShow);

    return sorted;
  }, [records, daysToShow]);

  const maxAmount = useMemo(
    () => Math.max(...dailyData.map((d) => d.amount), 1),
    [dailyData],
  );

  const maxTokens = useMemo(
    () => Math.max(...dailyData.map((d) => d.tokens), 1),
    [dailyData],
  );

  const totalStats = useMemo(() => {
    return dailyData.reduce(
      (acc, day) => ({
        amount: acc.amount + day.amount,
        tokens: acc.tokens + day.tokens,
        count: acc.count + day.count,
      }),
      { amount: 0, tokens: 0, count: 0 },
    );
  }, [dailyData]);

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <div className="text-neutral-500 dark:text-neutral-400">
          Loading consumption trend data...
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

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="text-neutral-400 dark:text-neutral-500">
          <ArrowTrendingUpIcon className="h-16 w-16 mx-auto mb-4" />
        </div>
        <div className="text-neutral-700 dark:text-neutral-300 font-medium">
          No consumption data available
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Consumption trends will appear here once users start using the system
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <CalendarIcon className="h-5 w-5" />
            <span className="text-sm font-medium">
              {records.length.toLocaleString()} total records •{" "}
              {dailyData.length} days with data
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

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label
            htmlFor="days-select"
            className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Show last:
          </label>
          <select
            id="days-select"
            value={daysToShow}
            onChange={(e) => setDaysToShow(Number(e.target.value))}
            className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>

        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          Total {dailyData.length} days of data
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-2 mb-1">
            <ArrowTrendingUpIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <h3 className="text-sm font-medium text-purple-900 dark:text-purple-100">
              Total Consumption
            </h3>
          </div>
          <p className="text-2xl font-bold text-purple-900 dark:text-purple-50">
            {formatNumber(totalStats.amount)}
          </p>
          <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
            Average:{" "}
            {formatNumber(
              Math.round(totalStats.amount / dailyData.length || 0),
            )}
            /day
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-1">
            <CalendarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Total Tokens
            </h3>
          </div>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-50">
            {formatNumber(totalStats.tokens)}
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
            Average:{" "}
            {formatNumber(
              Math.round(totalStats.tokens / dailyData.length || 0),
            )}
            /day
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 mb-1">
            <CalendarIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h3 className="text-sm font-medium text-green-900 dark:text-green-100">
              Total Requests
            </h3>
          </div>
          <p className="text-2xl font-bold text-green-900 dark:text-green-50">
            {formatNumber(totalStats.count)}
          </p>
          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
            Average:{" "}
            {formatNumber(Math.round(totalStats.count / dailyData.length || 0))}
            /day
          </p>
        </div>
      </div>

      {/* Consumption Amount Chart */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
          Daily Consumption Trend
        </h3>
        <div className="space-y-2">
          {dailyData.map((day) => (
            <div key={day.date} className="flex items-center gap-3">
              <div className="w-20 text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                {formatDate(day.date)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-8 bg-neutral-100 dark:bg-neutral-800 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 rounded-md transition-all duration-300"
                      style={{
                        width: `${(day.amount / maxAmount) * 100}%`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center px-2">
                      <span className="text-xs font-medium text-white drop-shadow-md">
                        {formatNumber(day.amount)}
                      </span>
                    </div>
                  </div>
                  <div className="w-16 text-xs text-neutral-500 dark:text-neutral-400 text-right">
                    {day.count} reqs
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Token Usage Chart */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
          Daily Token Usage Trend
        </h3>
        <div className="space-y-2">
          {dailyData.map((day) => (
            <div key={day.date} className="flex items-center gap-3">
              <div className="w-20 text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                {formatDate(day.date)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-8 bg-neutral-100 dark:bg-neutral-800 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-600 dark:from-blue-600 dark:to-cyan-700 rounded-md transition-all duration-300"
                      style={{
                        width: `${(day.tokens / maxTokens) * 100}%`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center px-2">
                      <span className="text-xs font-medium text-white drop-shadow-md">
                        {formatNumber(day.tokens)} tokens
                      </span>
                    </div>
                  </div>
                  <div className="w-16 text-xs text-neutral-500 dark:text-neutral-400 text-right">
                    {day.count > 0
                      ? formatNumber(Math.round(day.tokens / day.count))
                      : 0}
                    /req
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {dailyData.length === 0 && (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          No consumption data available
        </div>
      )}
    </div>
  );
}
