import { DEFAULT_TIMEZONE } from "@/configs/common";
import type { DailyUserActivityResponse } from "@/service/redemptionService";
import { redemptionService } from "@/service/redemptionService";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface UserActivityTabProps {
  adminSecret: string;
  backendUrl: string;
}

export function UserActivityTab({ adminSecret }: UserActivityTabProps) {
  const [daysToShow, setDaysToShow] = useState(30);
  const [data, setData] = useState<DailyUserActivityResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDark(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const end = new Date();
      const start = subDays(end, Math.max(daysToShow - 1, 0));
      const startDate = formatInTimeZone(start, DEFAULT_TIMEZONE, "yyyy-MM-dd");
      const endDate = formatInTimeZone(end, DEFAULT_TIMEZONE, "yyyy-MM-dd");

      const res = await redemptionService.getUserActivityStats(
        adminSecret,
        startDate,
        endDate,
        DEFAULT_TIMEZONE,
      );
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch user activity stats",
      );
    } finally {
      setLoading(false);
    }
  }, [adminSecret, daysToShow]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const chart = useMemo(() => {
    const dates = data.map((d) => {
      const [, m, day] = d.date.split("-");
      return `${Number(m)}/${Number(day)}`;
    });
    const newUsers = data.map((d) => d.new_users);
    const activeUsers = data.map((d) => d.active_users);

    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["New Users", "Active Users"] },
      grid: { left: 40, right: 20, top: 40, bottom: 30 },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { interval: "auto" },
      },
      yAxis: { type: "value" },
      series: [
        {
          name: "New Users",
          type: "bar",
          data: newUsers,
          barMaxWidth: 28,
        },
        {
          name: "Active Users",
          type: "line",
          data: activeUsers,
          smooth: true,
        },
      ],
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-neutral-500 dark:text-neutral-400">
          Loading user activity...
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
          onClick={fetchStats}
          className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-sm hover:bg-red-200 dark:hover:bg-red-900/50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
        No user activity data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label
            htmlFor="activity-days-select"
            className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Show last:
          </label>
          <select
            id="activity-days-select"
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
          Total {data.length} days
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
          Daily New Users & Active Users
        </h3>
        <div style={{ height: 360 }}>
          <ReactECharts
            option={chart}
            theme={isDark ? "dark" : undefined}
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}
