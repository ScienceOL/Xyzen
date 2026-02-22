"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  checkInService,
  type CheckInRecordResponse,
  type CheckInResponse,
  type DayConsumptionResponse,
} from "@/service/checkinService";
import {
  CalendarIcon,
  ChartBarIcon,
  CheckCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import React, { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const ConsumptionAnalyticsModal = React.lazy(() =>
  import("@/components/modals/ConsumptionAnalyticsModal").then((m) => ({
    default: m.ConsumptionAnalyticsModal,
  })),
);

// --- Pure utility functions (no component state dependency) ---

/** Format a Date to YYYY-MM-DD in check-in timezone (Asia/Shanghai) */
function formatDateInCheckinTZ(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return `${year}-${month}-${day}`;
}

/** Format date to YYYY-MM-DD (local timezone) */
function formatDateForAPI(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Static animation variants — no need to recreate per render */
const calendarVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 20 : -20,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -20 : 20,
    opacity: 0,
  }),
};

// Module-level Calendar static props (2.4)
const CALENDAR_CLASS_NAMES = {
  root: "w-full",
  months: "w-full flex flex-col",
  month: "w-full flex flex-col gap-4",
  table: "w-full",
  weekdays: "flex gap-0.5 sm:gap-1 w-full",
  weekday: "flex-1 text-center",
  week: "flex w-full mt-2 gap-0.5 sm:gap-1",
  day: "flex-1 p-0",
  day_outside:
    "opacity-40 aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
  day_button:
    "w-full h-auto aspect-square rounded-md transition-[transform,background-color,box-shadow] duration-150 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-neutral-900 dark:text-white hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:shadow-sm data-[selected-single=true]:bg-transparent data-[selected-single=true]:shadow-none data-[selected-single=true]:ring-2 data-[selected-single=true]:ring-white data-[selected-single=true]:shadow-sm",
} as const;

const CALENDAR_MODIFIERS_CLASS_NAMES = {
  checkedIn:
    "[&>button]:bg-linear-to-br [&>button]:from-indigo-500 [&>button]:to-purple-600 [&>button]:text-white [&>button]:font-semibold [&>button]:shadow-md [&>button]:transition-[transform,filter,box-shadow] [&>button:hover]:-translate-y-px [&>button:hover]:brightness-110 [&>button:hover]:shadow-lg dark:[&>button]:from-indigo-600 dark:[&>button]:to-purple-700 [&>button[data-selected-single=true]]:ring-2 [&>button[data-selected-single=true]]:ring-white/60 [&>button[data-selected-single=true]]:shadow-lg [&:has(>button.day-outside)>button]:opacity-60 [&:has(>button.day-outside)>button]:bg-none [&:has(>button.day-outside)>button]:bg-indigo-500/20 [&:has(>button.day-outside)>button]:text-indigo-700 dark:[&:has(>button.day-outside)>button]:text-indigo-300",
} as const;

// --- Extracted sub-components ---

const TokenDonut = React.memo(function TokenDonut({
  input,
  output,
  tokenLabel,
  locale,
}: {
  input: number;
  output: number;
  tokenLabel: string;
  locale: string;
}) {
  const total = Math.max(0, input) + Math.max(0, output);
  const safeTotal = total > 0 ? total : 1;

  const size = 92;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const inputRatio = Math.max(0, input) / safeTotal;
  const outputRatio = Math.max(0, output) / safeTotal;

  const inputDash = circumference * inputRatio;
  const outputDash = circumference * outputRatio;
  const outputDashOffset = circumference - inputDash;

  return (
    <div className="relative h-23 w-23 shrink-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-neutral-200/70 dark:text-white/10"
          strokeWidth={strokeWidth}
        />

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${inputDash} ${circumference - inputDash}`}
          strokeDashoffset={0}
          strokeWidth={strokeWidth}
          className="text-indigo-500 dark:text-indigo-400"
        />

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${outputDash} ${circumference - outputDash}`}
          strokeDashoffset={outputDashOffset}
          strokeWidth={strokeWidth}
          className="text-pink-500 dark:text-pink-400"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {tokenLabel}
        </div>
        <div className="text-sm font-bold text-neutral-900 dark:text-white">
          {total.toLocaleString(locale)}
        </div>
      </div>
    </div>
  );
});

// 2.7: Extracted SelectedDateDetails as React.memo
interface SelectedDateDetailsProps {
  selectedDate: Date | undefined;
  selectedDateLabel: string | undefined;
  selectedWeekday: string | undefined;
  selectedIsToday: boolean;
  checkInRecord: CheckInRecordResponse | null;
  consumption: DayConsumptionResponse | null | undefined;
  isConsumptionLoading: boolean;
  currentLocale: string;
  today: Date;
  onShowAnalytics: () => void;
}

const SelectedDateDetails = React.memo(function SelectedDateDetails({
  selectedDate,
  selectedDateLabel,
  selectedWeekday,
  selectedIsToday,
  checkInRecord,
  consumption,
  isConsumptionLoading,
  currentLocale,
  today,
  onShowAnalytics,
}: SelectedDateDetailsProps) {
  const { t } = useTranslation();
  return (
    <Card className="backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg flex-1 flex flex-col">
      <CardContent className="p-6 flex-1 flex flex-col">
        <motion.div
          key={selectedDate?.toDateString() ?? "none"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="mb-5 flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-sm border border-white/20 bg-white/70 p-2 shadow-sm backdrop-blur-sm dark:border-neutral-700/40 dark:bg-neutral-900/50">
              <ChartBarIcon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {selectedWeekday}
              </div>
              <div className="text-sm font-bold text-neutral-900 dark:text-white">
                {selectedDateLabel}
              </div>
            </div>
          </div>

          {selectedIsToday ? (
            <div className="rounded-full bg-linear-to-r from-indigo-500/90 to-purple-600/90 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-indigo-500/20">
              {t("app.checkInCalendar.today")}
            </div>
          ) : null}
        </motion.div>

        <div className="mb-5 h-px bg-linear-to-r from-transparent via-neutral-200/70 to-transparent dark:via-white/10 shrink-0" />

        <div className="space-y-4 flex-1 flex flex-col">
          {checkInRecord && (
            <div className="animate-in fade-in duration-300 group relative overflow-hidden rounded-sm border border-indigo-200/60 bg-linear-to-br from-indigo-50/90 to-purple-50/90 p-5 shadow-sm transition-all hover:shadow-md dark:border-indigo-700/60 dark:from-indigo-950/50 dark:to-purple-950/50 shrink-0">
              <div className="absolute inset-y-4 left-4 w-1 rounded-full bg-linear-to-b from-indigo-500 to-purple-600 shadow-sm transition-all group-hover:w-1.5" />
              <div className="pl-4">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <div className="font-bold text-indigo-900 dark:text-indigo-100">
                    {t("app.checkInCalendar.rewardTitle")}
                  </div>
                </div>
                <div className="mt-3 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                  {t("app.checkInCalendar.rewardEarned")}{" "}
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {checkInRecord.points_awarded}
                  </span>{" "}
                  {t("app.account.credits")} ·{" "}
                  {t("app.checkInCalendar.rewardStreak")}{" "}
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {checkInRecord.consecutive_days}
                  </span>{" "}
                  {t("app.checkInCalendar.dayUnit")}
                </div>
              </div>
            </div>
          )}

          {consumption && (
            <div className="animate-in fade-in duration-300 group relative overflow-hidden rounded-sm border border-neutral-200/60 bg-white/90 p-5 shadow-sm backdrop-blur-sm transition-all hover:shadow-md dark:border-neutral-700/60 dark:bg-neutral-800/90 shrink-0">
              <div className="absolute inset-y-4 left-4 w-1 rounded-full bg-linear-to-b from-neutral-400 to-neutral-500 shadow-sm transition-all group-hover:w-1.5 dark:from-neutral-600 dark:to-neutral-700" />
              <div className="pl-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-neutral-900 dark:text-neutral-100">
                    {t("app.consumption.usageStats")}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onShowAnalytics}
                    className="h-7 px-2 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                  >
                    <ChartBarIcon className="h-3.5 w-3.5 mr-1" />
                    {t("app.consumption.detailedAnalysis")}
                  </Button>
                </div>
                <div className="mt-4">
                  {consumption.record_count > 0 ? (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <TokenDonut
                        input={consumption.input_tokens}
                        output={consumption.output_tokens}
                        tokenLabel={t("app.consumption.colToken")}
                        locale={currentLocale}
                      />

                      <div className="flex-1 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                        <div className="flex items-center justify-between">
                          <span>{t("app.consumption.colCredits")}</span>
                          <span className="font-bold text-neutral-900 dark:text-white">
                            {consumption.total_amount}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t("app.consumption.conversations")}</span>
                          <span className="font-semibold text-neutral-900 dark:text-white">
                            {consumption.record_count}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t("app.consumption.inputToken")}</span>
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {consumption.input_tokens.toLocaleString(
                              currentLocale,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t("app.consumption.outputToken")}</span>
                          <span className="font-semibold text-pink-600 dark:text-pink-400">
                            {consumption.output_tokens.toLocaleString(
                              currentLocale,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="italic text-neutral-500">
                      {consumption.message || t("app.consumption.noRecords")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!checkInRecord && !consumption && isConsumptionLoading && (
            <>
              {/* Skeleton: 签到奖励 */}
              <div className="rounded-sm border border-neutral-200/60 bg-white/90 p-5 backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-800/90 shrink-0">
                <div className="pl-4 space-y-3">
                  <div className="h-4 w-20 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
                  <div className="h-4 w-40 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
                </div>
              </div>
              {/* Skeleton: 使用统计 */}
              <div className="rounded-sm border border-neutral-200/60 bg-white/90 p-5 backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-800/90 shrink-0">
                <div className="pl-4 space-y-4">
                  <div className="h-4 w-20 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="h-23 w-23 shrink-0 animate-pulse rounded-full bg-neutral-200/80 dark:bg-neutral-700/60" />
                    <div className="flex-1 space-y-2.5">
                      <div className="h-3.5 w-full animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
                      <div className="h-3.5 w-full animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {!checkInRecord &&
            !consumption &&
            !isConsumptionLoading &&
            selectedDate && (
              <div className="flex-1 flex items-center justify-center animate-in fade-in duration-500 rounded-sm border border-dashed border-neutral-300/60 bg-neutral-50/90 p-8 text-center backdrop-blur-sm dark:border-neutral-600/60 dark:bg-neutral-800/90">
                <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                  {formatDateForAPI(selectedDate) === formatDateForAPI(today)
                    ? t("app.checkInCalendar.noCheckInToday")
                    : t("app.checkInCalendar.noRecordForDay")}
                </div>
              </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
});

// --- Main component ---

interface CheckInCalendarProps {
  onCheckInSuccess?: (response: CheckInResponse) => void;
}

export function CheckInCalendar({ onCheckInSuccess }: CheckInCalendarProps) {
  const { t, i18n } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );
  const [displayMonth, setDisplayMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const queryClient = useQueryClient();

  const [today] = useState(() => new Date());
  const displayYear = displayMonth.getFullYear();
  const displayMonthNumber = displayMonth.getMonth() + 1;

  // Calculate prev and next month for fetching data
  const { prevMonthDate, nextMonthDate } = useMemo(
    () => ({
      prevMonthDate: new Date(displayYear, displayMonthNumber - 2, 1),
      nextMonthDate: new Date(displayYear, displayMonthNumber, 1),
    }),
    [displayYear, displayMonthNumber],
  );

  // Get check-in status
  const statusQuery = useQuery({
    queryKey: ["check-in", "status"],
    queryFn: () => checkInService.getStatus(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Get monthly check-in records (current, prev, next)
  const monthlyQueries = useQueries({
    queries: [
      {
        queryKey: [
          "check-in",
          "monthly",
          prevMonthDate.getFullYear(),
          prevMonthDate.getMonth() + 1,
        ],
        queryFn: () =>
          checkInService.getMonthlyCheckIns(
            prevMonthDate.getFullYear(),
            prevMonthDate.getMonth() + 1,
          ),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: ["check-in", "monthly", displayYear, displayMonthNumber],
        queryFn: () =>
          checkInService.getMonthlyCheckIns(displayYear, displayMonthNumber),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: [
          "check-in",
          "monthly",
          nextMonthDate.getFullYear(),
          nextMonthDate.getMonth() + 1,
        ],
        queryFn: () =>
          checkInService.getMonthlyCheckIns(
            nextMonthDate.getFullYear(),
            nextMonthDate.getMonth() + 1,
          ),
        staleTime: 5 * 60 * 1000,
      },
    ],
  });

  const prevMonthData = monthlyQueries[0].data;
  const currMonthData = monthlyQueries[1].data;
  const nextMonthData = monthlyQueries[2].data;
  const monthlyData = useMemo(
    () => [prevMonthData, currMonthData, nextMonthData].flatMap((d) => d || []),
    [prevMonthData, currMonthData, nextMonthData],
  );
  const isMonthlyLoading = monthlyQueries.some((q) => q.isLoading);

  // Pre-compute O(1) lookup structures for calendar day rendering
  const { checkedInDates, checkInByDate } = useMemo(() => {
    const dates = new Set<string>();
    const byDate = new Map<string, CheckInRecordResponse>();
    for (const record of monthlyData) {
      const key = formatDateInCheckinTZ(new Date(record.check_in_date));
      dates.add(key);
      byDate.set(key, record);
    }
    return { checkedInDates: dates, checkInByDate: byDate };
  }, [monthlyData]);

  // Get day consumption when date changes
  // Use YYYY-MM-DD as cache key so the same calendar day always hits cache
  const selectedDateKey = selectedDate
    ? formatDateInCheckinTZ(selectedDate)
    : null;
  const dayConsumptionQuery = useQuery({
    queryKey: ["check-in", "consumption", selectedDateKey],
    queryFn: () => {
      if (!selectedDateKey) return null;
      return checkInService.getDayConsumption(selectedDateKey);
    },
    enabled: !!selectedDateKey,
    staleTime: 60_000,
  });

  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [direction, setDirection] = useState(0);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const currentLocale = i18n.resolvedLanguage ?? i18n.language ?? "zh-CN";

  // O(1) lookup helpers using pre-computed Set/Map
  const getCheckInForDate = useCallback(
    (date: Date): CheckInRecordResponse | undefined => {
      return checkInByDate.get(formatDateInCheckinTZ(date));
    },
    [checkInByDate],
  );

  // Stable references for Calendar props to prevent unnecessary re-renders
  const calendarModifiers = useMemo(
    () => ({
      checkedIn: (date: Date) =>
        checkedInDates.has(formatDateInCheckinTZ(date)),
    }),
    [checkedInDates],
  );

  const calendarDisabled = useCallback((date: Date) => date > today, [today]);

  // 2.8: Stabilized callbacks with useCallback + ref pattern
  const displayMonthRef = useRef(displayMonth);
  displayMonthRef.current = displayMonth;

  const handleMonthChange = useCallback((date: Date) => {
    if (date > displayMonthRef.current) setDirection(1);
    else if (date < displayMonthRef.current) setDirection(-1);
    setDisplayMonth(date);
  }, []);

  const handleSelect = useCallback((date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      const newMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      if (newMonth.getTime() !== displayMonthRef.current.getTime()) {
        if (newMonth > displayMonthRef.current) setDirection(1);
        else setDirection(-1);
        setDisplayMonth(newMonth);
      }
    }
  }, []);

  // Stable callback for SelectedDateDetails
  const handleShowAnalytics = useCallback(() => setShowAnalytics(true), []);

  // Handle check-in
  async function handleCheckIn() {
    setIsCheckingIn(true);
    try {
      const response = await checkInService.checkIn();
      toast.success(response.message);

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["check-in"] });
      await queryClient.invalidateQueries({ queryKey: ["userWallet"] });

      onCheckInSuccess?.(response);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("app.checkInCalendar.checkInFailed");
      toast.error(message);
    } finally {
      setIsCheckingIn(false);
    }
  }

  const status = statusQuery.data;
  const todayCheckedIn = status?.checked_in_today ?? false;
  const consecutiveDays = status?.consecutive_days ?? 0;
  const nextPoints = status?.next_points ?? 10;

  const consumption = dayConsumptionQuery.data;
  const checkInRecord = selectedDate
    ? (getCheckInForDate(selectedDate) ?? null)
    : null;

  const selectedIsToday =
    !!selectedDate &&
    formatDateInCheckinTZ(selectedDate) === formatDateInCheckinTZ(today);

  // 2.3: useMemo for date formatting
  const selectedDateLabel = useMemo(
    () =>
      selectedDate?.toLocaleDateString(currentLocale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [selectedDate, currentLocale],
  );

  const selectedWeekday = useMemo(
    () =>
      selectedDate?.toLocaleDateString(currentLocale, {
        weekday: "long",
      }),
    [selectedDate, currentLocale],
  );

  // Loading state
  if (statusQuery.isLoading || isMonthlyLoading) {
    return (
      <div className="mx-auto w-full h-full p-6">
        <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
          {/* Left: Calendar */}
          <Card className="backdrop-blur-sm h-full">
            <CardContent className="p-6 h-full flex flex-col">
              <div className="mb-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
                  <div className="h-6 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                </div>
              </div>
              <div className="flex-1 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
            </CardContent>
          </Card>

          {/* Right: Stats & Details */}
          <div className="flex flex-col gap-6 h-full">
            <div className="grid grid-cols-3 gap-4 shrink-0">
              <div className="h-24 animate-pulse rounded-lg bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60" />
              <div className="h-24 animate-pulse rounded-lg bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60" />
              <div className="h-24 animate-pulse rounded-lg bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60" />
            </div>
            <div className="flex-1 animate-pulse rounded-lg bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full h-auto lg:h-full">
      <div className="grid h-auto lg:h-full grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        {/* Left Panel: Calendar */}
        <Card className="h-auto lg:h-full backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-xl">
          <CardContent className="flex h-auto lg:h-full flex-col p-4 sm:p-6">
            <div className="mb-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 p-2 shadow-lg shadow-indigo-500/30 transition-transform hover:scale-105">
                  <CalendarIcon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {t("app.checkInCalendar.title")}
                </h3>
              </div>
              {todayCheckedIn && (
                <div className="animate-in fade-in slide-in-from-right-5 duration-500 flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 shadow-sm dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircleIcon className="h-3.5 w-3.5 animate-pulse" />
                  <span>{t("app.checkInCalendar.checkedBadge")}</span>
                </div>
              )}
            </div>

            <div className="flex-1 rounded-sm border border-neutral-200/60 bg-white/80 p-2 shadow-sm backdrop-blur-sm sm:p-4 dark:border-neutral-700/60 dark:bg-neutral-800/80 overflow-hidden flex flex-col min-h-[320px]">
              {/* 2.10: popLayout for parallel enter/exit + optimized spring */}
              <AnimatePresence mode="popLayout" custom={direction}>
                <motion.div
                  key={displayMonth.toISOString()}
                  custom={direction}
                  variants={calendarVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: {
                      type: "spring",
                      stiffness: 300,
                      damping: 30,
                      restDelta: 0.5,
                      restSpeed: 10,
                    },
                    opacity: { duration: 0.2 },
                  }}
                  className="w-full"
                >
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    month={displayMonth}
                    onMonthChange={handleMonthChange}
                    showOutsideDays={true}
                    onSelect={handleSelect}
                    className="w-full rounded-lg mx-auto"
                    classNames={CALENDAR_CLASS_NAMES}
                    modifiers={calendarModifiers}
                    modifiersClassNames={CALENDAR_MODIFIERS_CLASS_NAMES}
                    disabled={calendarDisabled}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Check-in Button (height transition) */}
            <AnimatePresence initial={false}>
              {selectedIsToday && !todayCheckedIn ? (
                <motion.div
                  key="checkin-cta"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden shrink-0"
                >
                  <div className="pt-6">
                    <Button
                      onClick={handleCheckIn}
                      disabled={isCheckingIn}
                      className="group relative w-full overflow-hidden bg-linear-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-indigo-500/40 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 dark:from-indigo-500 dark:via-purple-500 dark:to-pink-500 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    >
                      <span className="absolute inset-0 bg-linear-to-r from-white/0 via-white/20 to-white/0 opacity-0 transition-opacity group-hover:animate-shimmer group-hover:opacity-100" />
                      <span className="relative flex items-center justify-center gap-2">
                        <SparklesIcon className="h-5 w-5 transition-transform group-hover:rotate-12" />
                        <span>
                          {isCheckingIn
                            ? t("app.checkInCalendar.checkingIn")
                            : t("app.checkInCalendar.checkInNow")}
                        </span>
                      </span>
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Right Panel: Stats & Details */}
        <div className="flex flex-col gap-6 h-auto lg:h-full">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            <Card className="group cursor-pointer backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg transition-all hover:scale-105 hover:shadow-xl">
              <CardContent className="p-5 text-center">
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {t("app.checkInCalendar.streak")}
                </div>
                <div className="mt-3 text-3xl font-bold text-neutral-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                  {consecutiveDays}
                </div>
                <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                  {t("app.checkInCalendar.dayUnit")}
                </div>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg transition-all hover:scale-105 hover:shadow-xl">
              <CardContent className="p-5 text-center">
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {t("app.checkInCalendar.totalCheckIns")}
                </div>
                <div className="mt-3 text-3xl font-bold text-neutral-900 transition-colors group-hover:text-purple-600 dark:text-white dark:group-hover:text-purple-400">
                  {status?.total_check_ins ?? 0}
                </div>
                <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                  {t("app.checkInCalendar.countUnit")}
                </div>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer backdrop-blur-md bg-linear-to-br from-indigo-500/20 to-purple-600/20 border-indigo-300/30 dark:border-indigo-600/30 shadow-lg transition-all hover:scale-105 hover:shadow-xl">
              <CardContent className="p-5 text-center">
                <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                  {t("app.checkInCalendar.tomorrowReward")}
                </div>
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  <SparklesIcon className="h-6 w-6 animate-pulse text-indigo-600 dark:text-indigo-400" />
                  <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                    {nextPoints}
                  </div>
                </div>
                <div className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
                  {t("app.account.credits")}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Selected Date Details */}
          <SelectedDateDetails
            selectedDate={selectedDate}
            selectedDateLabel={selectedDateLabel}
            selectedWeekday={selectedWeekday}
            selectedIsToday={selectedIsToday}
            checkInRecord={checkInRecord}
            consumption={consumption}
            isConsumptionLoading={dayConsumptionQuery.isLoading}
            currentLocale={currentLocale}
            today={today}
            onShowAnalytics={handleShowAnalytics}
          />
        </div>
      </div>

      <Suspense fallback={null}>
        <ConsumptionAnalyticsModal
          isOpen={showAnalytics}
          onClose={() => setShowAnalytics(false)}
        />
      </Suspense>
    </div>
  );
}
