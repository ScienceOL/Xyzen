"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { DEFAULT_TIMEZONE } from "@/configs/common";
import { echarts } from "@/lib/echarts";
import {
  checkInService,
  type ConsumptionRangeResponse,
} from "@/service/checkinService";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react/lib/core";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const PAGE_SIZE = 10;
const MIN_YEAR = 2026;
const MAX_YEAR = 2030;

const tierColors: Record<string, string> = {
  ultra: "#8b5cf6",
  pro: "#3b82f6",
  standard: "#22c55e",
  lite: "#f97316",
  unknown: "#9ca3af",
};

const tierLabels: Record<string, string> = {
  ultra: "Ultra",
  pro: "Pro",
  standard: "Standard",
  lite: "Lite",
};

const tierLegendOrder = ["lite", "standard", "pro", "ultra"];

function makeTierDonut(
  entries: [string, number][],
  isDark: boolean,
  emptyLabel: string,
) {
  const pieData = entries
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      name: tierLabels[k] || k,
      value: v,
      itemStyle: { color: tierColors[k] || "#9ca3af" },
    }));

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item", formatter: "{b}: {d}%" },
    series: [
      {
        type: "pie",
        radius: ["50%", "78%"],
        center: ["50%", "50%"],
        data:
          pieData.length > 0
            ? pieData
            : [
                {
                  name: emptyLabel,
                  value: 1,
                  itemStyle: {
                    color: isDark ? "#374151" : "#e5e7eb",
                  },
                },
              ],
        label: { show: false },
        emphasis: { label: { show: false } },
      },
    ],
  };
}

interface ConsumptionAnalyticsProps {
  onClose?: () => void;
}

export function ConsumptionAnalytics({ onClose }: ConsumptionAnalyticsProps) {
  const { t } = useTranslation();
  const [yearToShow, setYearToShow] = useState(() => new Date().getFullYear());
  const [dailyPage, setDailyPage] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [monthToShow, setMonthToShow] = useState(() => new Date().getMonth());
  const isDark = true;
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const updateMobile = () => setIsMobile(media.matches);
    updateMobile();
    media.addEventListener("change", updateMobile);
    return () => media.removeEventListener("change", updateMobile);
  }, []);

  useEffect(() => {
    if (expandedDate && tableRef.current) {
      requestAnimationFrame(() => {
        const row = tableRef.current?.querySelector(
          `tr[data-date="${expandedDate}"]`,
        );
        row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [expandedDate, dailyPage]);

  const startDate = `${yearToShow}-01-01`;
  const endDate = `${yearToShow}-12-31`;

  const rangeQuery = useQuery({
    queryKey: ["consumption", "range", yearToShow],
    queryFn: () =>
      checkInService.getConsumptionRange(startDate, endDate, DEFAULT_TIMEZONE),
  });

  const data = rangeQuery.data as ConsumptionRangeResponse | undefined;
  const isLoading = rangeQuery.isLoading;

  const displayData = useMemo(() => {
    if (!data) {
      return {
        totalAmount: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCount: 0,
        totalToolCallCount: 0,
        byTier: {} as Record<
          string,
          {
            total_tokens: number;
            input_tokens: number;
            output_tokens: number;
            total_amount: number;
            record_count: number;
            tool_call_count: number;
          }
        >,
      };
    }
    if (selectedDate !== null) {
      const day = data.daily.find((d) => d.date === selectedDate);
      return {
        totalAmount: day?.total_amount ?? 0,
        totalTokens: day?.total_tokens ?? 0,
        totalInputTokens: day?.input_tokens ?? 0,
        totalOutputTokens: day?.output_tokens ?? 0,
        totalCount: day?.record_count ?? 0,
        totalToolCallCount: day?.tool_call_count ?? 0,
        byTier: day?.by_tier ?? {},
      };
    }
    const agg = data.daily.reduce(
      (acc, d) => ({
        totalAmount: acc.totalAmount + d.total_amount,
        totalTokens: acc.totalTokens + d.total_tokens,
        totalInputTokens: acc.totalInputTokens + d.input_tokens,
        totalOutputTokens: acc.totalOutputTokens + d.output_tokens,
        totalCount: acc.totalCount + d.record_count,
        totalToolCallCount: acc.totalToolCallCount + d.tool_call_count,
      }),
      {
        totalAmount: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCount: 0,
        totalToolCallCount: 0,
      },
    );
    return { ...agg, byTier: data.by_tier };
  }, [data, selectedDate]);

  const donutEmptyLabel = t("app.consumption.donutEmpty");

  // Consolidated tier metrics calculation
  const tierMetrics = useMemo(() => {
    const knownTierEntries = Object.entries(displayData.byTier).filter(
      ([k]) => k !== "unknown",
    );

    return {
      amount: knownTierEntries.map(
        ([k, v]) => [k, v.total_amount] as [string, number],
      ),
      tokens: knownTierEntries.map(
        ([k, v]) => [k, v.total_tokens] as [string, number],
      ),
      inputTokens: knownTierEntries.map(
        ([k, v]) => [k, v.input_tokens] as [string, number],
      ),
      outputTokens: knownTierEntries.map(
        ([k, v]) => [k, v.output_tokens] as [string, number],
      ),
      count: knownTierEntries.map(
        ([k, v]) => [k, v.record_count] as [string, number],
      ),
      toolCalls: knownTierEntries.map(
        ([k, v]) => [k, v.tool_call_count] as [string, number],
      ),
    };
  }, [displayData]);

  // Consolidated donut options
  const donutOptions = useMemo(
    () => ({
      amount: makeTierDonut(tierMetrics.amount, isDark, donutEmptyLabel),
      tokens: makeTierDonut(tierMetrics.tokens, isDark, donutEmptyLabel),
      inputTokens: makeTierDonut(
        tierMetrics.inputTokens,
        isDark,
        donutEmptyLabel,
      ),
      outputTokens: makeTierDonut(
        tierMetrics.outputTokens,
        isDark,
        donutEmptyLabel,
      ),
      count: makeTierDonut(tierMetrics.count, isDark, donutEmptyLabel),
      toolCalls: makeTierDonut(tierMetrics.toolCalls, isDark, donutEmptyLabel),
    }),
    [tierMetrics, isDark, donutEmptyLabel],
  );

  // Heatmap chart options
  const heatmapOption = useMemo(() => {
    const heatData =
      data?.daily
        .filter((d) => d.total_amount > 0)
        .map((d) => [d.date, d.total_amount]) ?? [];
    const maxVal = Math.max(...(heatData.map((d) => d[1] as number) || [1]), 1);

    const levels = isDark
      ? ["#0b2a1f", "#14532d", "#16a34a", "#4ade80"]
      : ["#ecfdf5", "#bbf7d0", "#4ade80", "#15803d"];
    const emptyColor = isDark ? "#161b22" : "#ebedf0";
    const borderColor = isDark ? "#1b1f23" : "#fff";
    const seg = maxVal / 4;
    const pieces = [
      { min: 0, max: 0, color: emptyColor },
      ...levels.map((color, i) => ({
        min: i === 0 ? 1 : Math.round(i * seg) + 1,
        max: i === 3 ? maxVal : Math.round((i + 1) * seg),
        color,
      })),
    ];

    const tooltipLabel = t("app.consumption.heatmapTooltip", {
      amount: "{{amount}}",
    });

    // Mobile: monthly range; Desktop: full year
    let calendarRange: string | [string, string] = String(yearToShow);
    if (isMobile) {
      const mStart = new Date(yearToShow, monthToShow, 1);
      const mEnd = new Date(yearToShow, monthToShow + 1, 0);
      const pad = (n: number) => String(n).padStart(2, "0");
      calendarRange = [
        `${yearToShow}-${pad(monthToShow + 1)}-01`,
        `${yearToShow}-${pad(monthToShow + 1)}-${pad(mEnd.getDate())}`,
      ];
      // suppress unused var
      void mStart;
    }

    return {
      backgroundColor: "transparent",
      tooltip: {
        formatter: (params: { value: [string, number] }) => {
          const [date, amount] = params.value;
          return `<strong>${date}</strong><br/>${tooltipLabel.replace("{{amount}}", amount.toLocaleString())}`;
        },
      },
      visualMap: {
        type: "piecewise",
        show: true,
        orient: "vertical",
        right: 0,
        top: "middle",
        itemWidth: isMobile ? 10 : 12,
        itemHeight: isMobile ? 10 : 12,
        itemGap: 3,
        padding: 0,
        showLabel: false,
        text: ["High", "Low"],
        textGap: 5,
        textStyle: {
          color: isDark ? "#8b949e" : "#57606a",
          fontSize: isMobile ? 10 : 12,
        },
        pieces,
        itemSymbol: "roundRect",
      },
      calendar: {
        range: calendarRange,
        cellSize: isMobile ? ["auto", 18] : ["auto", 13],
        top: isMobile ? 8 : 24,
        left: isMobile ? 36 : 40,
        right: isMobile ? 40 : 50,
        bottom: isMobile ? 4 : 0,
        dayLabel: isMobile
          ? {
              nameMap: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
              color: isDark ? "#8b949e" : "#57606a",
              fontSize: 10,
            }
          : {
              nameMap: ["", "Mon", "", "Wed", "", "Fri", ""],
              color: isDark ? "#8b949e" : "#57606a",
              fontSize: 12,
            },
        monthLabel: isMobile
          ? { show: false }
          : {
              color: isDark ? "#8b949e" : "#57606a",
              fontSize: 12,
            },
        yearLabel: { show: false },
        itemStyle: {
          borderColor,
          borderWidth: isMobile ? 4 : 3,
          borderRadius: 2,
          color: emptyColor,
        },
        splitLine: { show: false },
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data: heatData,
          itemStyle: { borderRadius: 2 },
        },
      ],
    };
  }, [data, isDark, yearToShow, monthToShow, t, isMobile]);

  // Daily table — only days with activity, descending order, client-side paged (desktop only)
  const dailyRows = useMemo(
    () =>
      (data?.daily ?? [])
        .filter((d) => d.record_count > 0)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data],
  );

  const totalDailyPages = Math.ceil(dailyRows.length / PAGE_SIZE);
  const pagedRows = dailyRows.slice(
    dailyPage * PAGE_SIZE,
    (dailyPage + 1) * PAGE_SIZE,
  );

  // Optimization 2: Stable heatmap event handler using ref
  const heatmapClickRef = useRef<
    (params: { componentType: string; value: [string, number] }) => void
  >(() => {});
  heatmapClickRef.current = (params) => {
    if (params.componentType === "series") {
      const clickedDate = params.value[0];
      const isDeselect = selectedDate === clickedDate;
      setSelectedDate(isDeselect ? null : clickedDate);
      setExpandedDate(isDeselect ? null : clickedDate);
      if (!isDeselect) {
        if (isMobile) {
          // Mobile: filtered to single date, always page 0
          setDailyPage(0);
        } else {
          const idx = dailyRows.findIndex((r) => r.date === clickedDate);
          if (idx >= 0) {
            setDailyPage(Math.floor(idx / PAGE_SIZE));
          }
        }
      }
    }
  };

  const heatmapEvents = useMemo(
    () => ({
      click: (params: { componentType: string; value: [string, number] }) =>
        heatmapClickRef.current(params),
    }),
    [],
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          {t("app.consumption.title")}
        </h2>
        <div className="flex items-center gap-2">
          {onClose && (
            <Button
              variant="outline"
              size="icon"
              onClick={onClose}
              aria-label={t("app.consumption.close")}
              className="h-8 w-8 border-neutral-200/70 bg-white/70 text-neutral-600 hover:bg-white dark:border-neutral-700/60 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setYearToShow((y) => y - 1);
              setMonthToShow(0);
              setDailyPage(0);
              setSelectedDate(null);
              setExpandedDate(null);
            }}
            disabled={yearToShow <= MIN_YEAR}
            className="h-8 w-8"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <span className="min-w-12 text-center text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            {yearToShow}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setYearToShow((y) => y + 1);
              setMonthToShow(0);
              setDailyPage(0);
              setSelectedDate(null);
              setExpandedDate(null);
            }}
            disabled={yearToShow >= MAX_YEAR}
            className="h-8 w-8"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Section: Left cards + Right heatmap and daily details */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-3">
        <div className="flex flex-col gap-3">
          <div className="shrink-0 rounded-md border border-neutral-200/60 dark:border-neutral-700/60 bg-white/60 dark:bg-neutral-900/50 px-2.5 py-1.5">
            <div className="flex items-center justify-center gap-3 overflow-x-auto">
              {tierLegendOrder.map((tier) => (
                <div
                  key={tier}
                  className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-neutral-600 dark:text-neutral-300"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tierColors[tier] }}
                  />
                  <span>{tierLabels[tier]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 lg:grid-cols-2 gap-1.5 sm:gap-3">
            <Card className="col-span-1 order-1 lg:order-0 backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg py-1 gap-0 sm:py-6 sm:gap-6">
              <CardContent className="py-0.5 px-2 sm:p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 text-center">
                  {t("app.consumption.totalToken")}
                </div>
                <div className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-bold text-neutral-900 dark:text-white text-center">
                  {isLoading ? (
                    <div className="h-7 w-14 mx-auto animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                  ) : (
                    displayData.totalTokens.toLocaleString()
                  )}
                </div>
                {isLoading ? (
                  <div className="h-16 sm:h-20 mt-0.5 sm:mt-1 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <ReactECharts
                    echarts={echarts}
                    option={donutOptions.tokens}
                    style={{ height: isMobile ? "64px" : "80px" }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="col-span-1 order-4 lg:order-0 backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg py-1 gap-0 sm:py-6 sm:gap-6">
              <CardContent className="py-0.5 px-2 sm:p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 text-center">
                  {t("app.consumption.totalCredits")}
                </div>
                <div className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-bold text-neutral-900 dark:text-white text-center">
                  {isLoading ? (
                    <div className="h-7 w-14 mx-auto animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                  ) : (
                    displayData.totalAmount.toLocaleString()
                  )}
                </div>
                {isLoading ? (
                  <div className="h-16 sm:h-20 mt-0.5 sm:mt-1 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <ReactECharts
                    echarts={echarts}
                    option={donutOptions.amount}
                    style={{ height: isMobile ? "64px" : "80px" }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="col-span-1 order-2 lg:order-0 backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg py-1 gap-0 sm:py-6 sm:gap-6">
              <CardContent className="py-0.5 px-2 sm:p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 text-center">
                  {t("app.consumption.inputToken")}
                </div>
                <div className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-bold text-neutral-900 dark:text-white text-center">
                  {isLoading ? (
                    <div className="h-7 w-14 mx-auto animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                  ) : (
                    displayData.totalInputTokens.toLocaleString()
                  )}
                </div>
                {isLoading ? (
                  <div className="h-16 sm:h-20 mt-0.5 sm:mt-1 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <ReactECharts
                    echarts={echarts}
                    option={donutOptions.inputTokens}
                    style={{ height: isMobile ? "64px" : "80px" }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="col-span-1 order-5 lg:order-0 backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg py-1 gap-0 sm:py-6 sm:gap-6">
              <CardContent className="py-0.5 px-2 sm:p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 text-center">
                  {t("app.consumption.conversations")}
                </div>
                <div className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-bold text-neutral-900 dark:text-white text-center">
                  {isLoading ? (
                    <div className="h-7 w-14 mx-auto animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                  ) : (
                    displayData.totalCount.toLocaleString()
                  )}
                </div>
                {isLoading ? (
                  <div className="h-16 sm:h-20 mt-0.5 sm:mt-1 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <ReactECharts
                    echarts={echarts}
                    option={donutOptions.count}
                    style={{ height: isMobile ? "64px" : "80px" }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="col-span-1 order-3 lg:order-0 backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg py-1 gap-0 sm:py-6 sm:gap-6">
              <CardContent className="py-0.5 px-2 sm:p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 text-center">
                  {t("app.consumption.outputToken")}
                </div>
                <div className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-bold text-neutral-900 dark:text-white text-center">
                  {isLoading ? (
                    <div className="h-7 w-14 mx-auto animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                  ) : (
                    displayData.totalOutputTokens.toLocaleString()
                  )}
                </div>
                {isLoading ? (
                  <div className="h-16 sm:h-20 mt-0.5 sm:mt-1 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <ReactECharts
                    echarts={echarts}
                    option={donutOptions.outputTokens}
                    style={{ height: isMobile ? "64px" : "80px" }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="col-span-1 order-6 lg:order-0 backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg py-1 gap-0 sm:py-6 sm:gap-6">
              <CardContent className="py-0.5 px-2 sm:p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 text-center">
                  {t("app.consumption.toolCalls")}
                </div>
                <div className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-bold text-neutral-900 dark:text-white text-center">
                  {isLoading ? (
                    <div className="h-7 w-14 mx-auto animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                  ) : (
                    displayData.totalToolCallCount.toLocaleString()
                  )}
                </div>
                {isLoading ? (
                  <div className="h-16 sm:h-20 mt-0.5 sm:mt-1 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <ReactECharts
                    echarts={echarts}
                    option={donutOptions.toolCalls}
                    style={{ height: isMobile ? "64px" : "80px" }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          {/* Heatmap */}
          <Card className="backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg">
            <CardContent className="h-full px-8 py-0">
              <div className="mb-0.5 flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  {t("app.consumption.heatmapTitle")}
                  {isMobile && (
                    <div className="flex items-center gap-0.5 ml-1">
                      <button
                        onClick={() => {
                          setMonthToShow((m) => m - 1);
                          setSelectedDate(null);
                          setExpandedDate(null);
                        }}
                        disabled={monthToShow <= 0}
                        className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-30"
                      >
                        <ChevronLeftIcon className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-16 text-center text-xs font-medium">
                        {new Date(yearToShow, monthToShow).toLocaleDateString(
                          undefined,
                          { month: "long" },
                        )}
                      </span>
                      <button
                        onClick={() => {
                          setMonthToShow((m) => m + 1);
                          setSelectedDate(null);
                          setExpandedDate(null);
                        }}
                        disabled={monthToShow >= 11}
                        className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-30"
                      >
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {selectedDate && (
                  <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400">
                    <span>
                      {t("app.consumption.selectedDate", {
                        date: selectedDate,
                      })}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedDate(null);
                        setExpandedDate(null);
                      }}
                      className="rounded-full px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-200 dark:hover:bg-indigo-800/60 transition-colors leading-none"
                      aria-label={t("app.consumption.clearDate")}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              {isLoading ? (
                <div className="h-35 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              ) : (
                <ReactECharts
                  echarts={echarts}
                  option={heatmapOption}
                  style={{ height: isMobile ? "155px" : "140px" }}
                  opts={{ renderer: "svg" }}
                  onEvents={heatmapEvents}
                />
              )}
            </CardContent>
          </Card>

          {/* Hint text for mobile when no date selected */}
          {isMobile && !selectedDate && !isLoading && (
            <div className="text-center text-xs text-neutral-400 dark:text-neutral-500 py-1">
              {t("app.consumption.clickDateHint")}
            </div>
          )}

          {/* Daily Summary — mobile: card-based detail for selected date; desktop: paginated table */}
          {isMobile &&
            selectedDate &&
            (() => {
              const dayData = data?.daily.find((d) => d.date === selectedDate);
              if (!dayData) return null;
              const tierEntries = Object.entries(dayData.by_tier)
                .filter(([k, v]) => k !== "unknown" && v.record_count > 0)
                .sort((a, b) => b[1].total_amount - a[1].total_amount);
              return (
                <Card className="backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg py-3 gap-0">
                  <CardContent className="px-4 py-0">
                    {/* Date header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                        {selectedDate}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedDate(null);
                          setExpandedDate(null);
                        }}
                        className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Tier breakdown */}
                    {tierEntries.length > 0 ? (
                      <div className="space-y-1.5">
                        {tierEntries.map(([tier, stats]) => (
                          <div
                            key={tier}
                            className="rounded-md bg-neutral-50/60 dark:bg-neutral-800/40 px-3 py-1.5"
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor:
                                    tierColors[tier] || "#9ca3af",
                                }}
                              />
                              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                                {tierLabels[tier] || tier}
                              </span>
                              <span className="ml-auto text-xs font-semibold text-indigo-500 dark:text-indigo-400">
                                {stats.total_amount.toLocaleString()}{" "}
                                {t("app.consumption.colCredits").toLowerCase()}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1 text-[10px]">
                              <div className="text-center">
                                <div className="text-neutral-400">
                                  {t("app.consumption.colToken")}
                                </div>
                                <div className="font-mono text-neutral-600 dark:text-neutral-300">
                                  {stats.total_tokens.toLocaleString()}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-neutral-400">
                                  {t("app.consumption.colInput")}
                                </div>
                                <div className="font-mono text-neutral-600 dark:text-neutral-300">
                                  {stats.input_tokens.toLocaleString()}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-neutral-400">
                                  {t("app.consumption.colOutput")}
                                </div>
                                <div className="font-mono text-neutral-600 dark:text-neutral-300">
                                  {stats.output_tokens.toLocaleString()}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-neutral-400">
                                  {t("app.consumption.colToolCalls")}
                                </div>
                                <div className="font-mono text-neutral-600 dark:text-neutral-300">
                                  {stats.tool_call_count}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-xs text-neutral-400 py-2">
                        {t("app.consumption.noRecords")}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

          {!isMobile && (
            <Card className="flex-1 min-h-0 flex flex-col backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg">
              <CardContent className="px-8 py-0 flex flex-col flex-1 min-h-0">
                <div className="mb-2 shrink-0 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  {t("app.consumption.tableTitle")}
                  {!isLoading && (
                    <span className="ml-2 text-xs font-normal text-neutral-500">
                      {t("app.consumption.tableDayCount", {
                        count: dailyRows.length,
                      })}
                    </span>
                  )}
                </div>

                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-9 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <table
                      ref={tableRef}
                      className="w-full text-sm table-fixed"
                    >
                      <thead className="sticky top-0 bg-white/90 dark:bg-neutral-900/90">
                        <tr className="border-b border-neutral-200/60 dark:border-neutral-700/60 text-center text-xs text-neutral-500 dark:text-neutral-400">
                          <th className="pb-2 px-2 font-medium">
                            {t("app.consumption.colDate")}
                          </th>
                          <th className="pb-2 px-2 font-medium">
                            {t("app.consumption.colToken")}
                          </th>
                          <th className="pb-2 px-2 font-medium">
                            {t("app.consumption.colInput")}
                          </th>
                          <th className="pb-2 px-2 font-medium">
                            {t("app.consumption.colOutput")}
                          </th>
                          <th className="pb-2 px-2 font-medium">
                            {t("app.consumption.colCredits")}
                          </th>
                          <th className="pb-2 px-2 font-medium">
                            {t("app.consumption.conversations")}
                          </th>
                          <th className="pb-2 px-2 font-medium">
                            {t("app.consumption.colToolCalls")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {pagedRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="py-8 text-center text-neutral-400"
                            >
                              {t("app.consumption.noRecords")}
                            </td>
                          </tr>
                        ) : (
                          pagedRows.map((d) => {
                            const isExpanded = expandedDate === d.date;
                            const tierEntries = Object.entries(d.by_tier)
                              .filter(
                                ([k, v]) =>
                                  k !== "unknown" && v.record_count > 0,
                              )
                              .sort(
                                (a, b) => b[1].total_amount - a[1].total_amount,
                              );
                            return (
                              <Fragment key={d.date}>
                                <tr
                                  data-date={d.date}
                                  className={`cursor-pointer transition-colors ${
                                    isExpanded
                                      ? "bg-indigo-50/60 dark:bg-indigo-900/20"
                                      : "hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40"
                                  } ${
                                    selectedDate === d.date
                                      ? "ring-1 ring-inset ring-indigo-400/50"
                                      : ""
                                  }`}
                                  onClick={() => {
                                    setExpandedDate((prev) =>
                                      prev === d.date ? null : d.date,
                                    );
                                    setSelectedDate((prev) =>
                                      prev === d.date ? null : d.date,
                                    );
                                  }}
                                >
                                  <td className="py-2 px-2 text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">
                                      <span
                                        className={`inline-block w-3 text-[10px] text-neutral-400 transition-transform ${
                                          isExpanded ? "rotate-90" : ""
                                        }`}
                                      >
                                        ▸
                                      </span>
                                      {d.date}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-center font-mono text-neutral-700 dark:text-neutral-300">
                                    {d.total_tokens.toLocaleString()}
                                  </td>
                                  <td className="py-2 px-2 text-center font-mono text-neutral-500 dark:text-neutral-500">
                                    {d.input_tokens.toLocaleString()}
                                  </td>
                                  <td className="py-2 px-2 text-center font-mono text-neutral-500 dark:text-neutral-500">
                                    {d.output_tokens.toLocaleString()}
                                  </td>
                                  <td className="py-2 px-2 text-center font-semibold text-indigo-600 dark:text-indigo-400">
                                    {d.total_amount.toLocaleString()}
                                  </td>
                                  <td className="py-2 px-2 text-center text-neutral-700 dark:text-neutral-300">
                                    {d.record_count}
                                  </td>
                                  <td className="py-2 px-2 text-center text-neutral-700 dark:text-neutral-300">
                                    {d.tool_call_count}
                                  </td>
                                </tr>
                                {isExpanded &&
                                  tierEntries.map(([tier, stats]) => (
                                    <tr
                                      key={`${d.date}-${tier}`}
                                      className="bg-neutral-50/40 dark:bg-neutral-800/30"
                                    >
                                      <td className="py-1.5 px-2 text-xs whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1.5">
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{
                                              backgroundColor:
                                                tierColors[tier] || "#9ca3af",
                                            }}
                                          />
                                          <span className="text-neutral-500 dark:text-neutral-400">
                                            {tierLabels[tier] || tier}
                                          </span>
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-2 text-center font-mono text-xs text-neutral-600 dark:text-neutral-400">
                                        {stats.total_tokens.toLocaleString()}
                                      </td>
                                      <td className="py-1.5 px-2 text-center font-mono text-xs text-neutral-500 dark:text-neutral-500">
                                        {stats.input_tokens.toLocaleString()}
                                      </td>
                                      <td className="py-1.5 px-2 text-center font-mono text-xs text-neutral-500 dark:text-neutral-500">
                                        {stats.output_tokens.toLocaleString()}
                                      </td>
                                      <td className="py-1.5 px-2 text-center text-xs font-semibold text-indigo-500 dark:text-indigo-400">
                                        {stats.total_amount.toLocaleString()}
                                      </td>
                                      <td className="py-1.5 px-2 text-center text-xs text-neutral-600 dark:text-neutral-400">
                                        {stats.record_count}
                                      </td>
                                      <td className="py-1.5 px-2 text-center text-xs text-neutral-600 dark:text-neutral-400">
                                        {stats.tool_call_count}
                                      </td>
                                    </tr>
                                  ))}
                              </Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {totalDailyPages > 1 && (
                  <div className="mt-2 shrink-0">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() =>
                              setDailyPage((p) => Math.max(0, p - 1))
                            }
                            aria-disabled={dailyPage === 0}
                            className={
                              dailyPage === 0
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <span className="px-3 py-1 text-sm text-neutral-600 dark:text-neutral-400">
                            {dailyPage + 1} / {totalDailyPages}
                          </span>
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext
                            onClick={() =>
                              setDailyPage((p) =>
                                Math.min(totalDailyPages - 1, p + 1),
                              )
                            }
                            aria-disabled={dailyPage >= totalDailyPages - 1}
                            className={
                              dailyPage >= totalDailyPages - 1
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
