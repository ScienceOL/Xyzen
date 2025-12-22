import type { DailyTokenStatsResponse } from "@/service/redemptionService";
import { redemptionService } from "@/service/redemptionService";
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";

interface DailyStatsTabProps {
  adminSecret: string;
  backendUrl: string;
}

export function DailyStatsTab({ adminSecret }: DailyStatsTabProps) {
  const [stats, setStats] = useState<DailyTokenStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );

  const fetchStats = useCallback(
    async (date?: string) => {
      setLoading(true);
      setError(null);

      try {
        const data = await redemptionService.getDailyTokenStats(
          adminSecret,
          date,
        );
        setStats(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch statistics",
        );
      } finally {
        setLoading(false);
      }
    },
    [adminSecret],
  );

  useEffect(() => {
    fetchStats(selectedDate);
  }, [selectedDate, fetchStats]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-neutral-500 dark:text-neutral-400">
          Loading statistics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Date Selector */}
      <div className="flex items-center gap-4">
        <label
          htmlFor="date-select"
          className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Select Date:
        </label>
        <input
          id="date-select"
          type="date"
          value={selectedDate}
          onChange={handleDateChange}
          max={new Date().toISOString().split("T")[0]}
          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Tokens */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500 dark:bg-blue-600 rounded-lg">
              <ChartBarIcon className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Total Tokens
            </h3>
          </div>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-50">
            {formatNumber(stats.total_tokens)}
          </p>
          <div className="mt-3 flex gap-4 text-xs text-blue-700 dark:text-blue-300">
            <div>
              <span className="font-medium">Input:</span>{" "}
              {formatNumber(stats.input_tokens)}
            </div>
            <div>
              <span className="font-medium">Output:</span>{" "}
              {formatNumber(stats.output_tokens)}
            </div>
          </div>
        </div>

        {/* Total Amount */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30 rounded-lg p-6 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500 dark:bg-green-600 rounded-lg">
              <CurrencyDollarIcon className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-sm font-medium text-green-900 dark:text-green-100">
              Total Consumption
            </h3>
          </div>
          <p className="text-3xl font-bold text-green-900 dark:text-green-50">
            {formatNumber(stats.total_amount)}
          </p>
          <p className="mt-2 text-xs text-green-700 dark:text-green-300">
            Virtual balance units consumed
          </p>
        </div>

        {/* Record Count */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500 dark:bg-purple-600 rounded-lg">
              <DocumentTextIcon className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-sm font-medium text-purple-900 dark:text-purple-100">
              Total Records
            </h3>
          </div>
          <p className="text-3xl font-bold text-purple-900 dark:text-purple-50">
            {formatNumber(stats.record_count)}
          </p>
          <p className="mt-2 text-xs text-purple-700 dark:text-purple-300">
            API calls recorded
          </p>
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
        <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Statistics for {stats.date}
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">
              Avg per Record:
            </span>
            <p className="font-medium text-neutral-900 dark:text-white">
              {stats.record_count > 0
                ? formatNumber(
                    Math.round(stats.total_tokens / stats.record_count),
                  )
                : 0}{" "}
              tokens
            </p>
          </div>
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">
              Input/Output Ratio:
            </span>
            <p className="font-medium text-neutral-900 dark:text-white">
              {stats.output_tokens > 0
                ? (stats.input_tokens / stats.output_tokens).toFixed(2)
                : "N/A"}
            </p>
          </div>
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">
              Avg Cost per Record:
            </span>
            <p className="font-medium text-neutral-900 dark:text-white">
              {stats.record_count > 0
                ? formatNumber(
                    Math.round(stats.total_amount / stats.record_count),
                  )
                : 0}{" "}
              units
            </p>
          </div>
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">
              Cost per 1K Tokens:
            </span>
            <p className="font-medium text-neutral-900 dark:text-white">
              {stats.total_tokens > 0
                ? ((stats.total_amount / stats.total_tokens) * 1000).toFixed(2)
                : 0}{" "}
              units
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
