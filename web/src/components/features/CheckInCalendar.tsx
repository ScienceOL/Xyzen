"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  checkInService,
  type CheckInRecordResponse,
  type CheckInResponse,
} from "@/service/checkinService";
import {
  CalendarIcon,
  ChartBarIcon,
  CheckCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

interface CheckInCalendarProps {
  onCheckInSuccess?: (response: CheckInResponse) => void;
}

export function CheckInCalendar({ onCheckInSuccess }: CheckInCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );
  const queryClient = useQueryClient();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  // Get check-in status
  const statusQuery = useQuery({
    queryKey: ["check-in", "status"],
    queryFn: () => checkInService.getStatus(),
    refetchOnWindowFocus: true,
  });

  // Get monthly check-in records
  const monthlyQuery = useQuery({
    queryKey: ["check-in", "monthly", currentYear, currentMonth],
    queryFn: () => checkInService.getMonthlyCheckIns(currentYear, currentMonth),
  });

  // Get day consumption when date changes
  const dayConsumptionQuery = useQuery({
    queryKey: ["check-in", "consumption", selectedDate?.toISOString()],
    queryFn: () => {
      if (!selectedDate) return null;
      const dateStr = formatDateForAPI(selectedDate);
      return checkInService.getDayConsumption(dateStr);
    },
    enabled: !!selectedDate,
  });

  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Format date to YYYY-MM-DD
  function formatDateForAPI(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Check if a date has been checked in
  function isDateCheckedIn(date: Date): boolean {
    if (!monthlyQuery.data) return false;
    const dateStr = formatDateForAPI(date);
    return monthlyQuery.data.some(
      (record: CheckInRecordResponse) =>
        formatDateForAPI(new Date(record.check_in_date)) === dateStr,
    );
  }

  // Get check-in record for a date
  function getCheckInForDate(date: Date): CheckInRecordResponse | undefined {
    if (!monthlyQuery.data) return undefined;
    const dateStr = formatDateForAPI(date);
    return monthlyQuery.data.find(
      (record: CheckInRecordResponse) =>
        formatDateForAPI(new Date(record.check_in_date)) === dateStr,
    );
  }

  // Handle check-in
  async function handleCheckIn() {
    setIsCheckingIn(true);
    try {
      const response = await checkInService.checkIn();
      toast.success(response.message);

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["check-in"] });
      await queryClient.invalidateQueries({ queryKey: ["wallet"] });

      onCheckInSuccess?.(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "签到失败，请稍后重试";
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
  const checkInRecord = selectedDate ? getCheckInForDate(selectedDate) : null;

  const selectedIsToday =
    !!selectedDate &&
    formatDateForAPI(selectedDate) === formatDateForAPI(today);

  const selectedDateLabel = selectedDate?.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const selectedWeekday = selectedDate?.toLocaleDateString("zh-CN", {
    weekday: "long",
  });

  function TokenDonut({ input, output }: { input: number; output: number }) {
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
      <div className="relative h-[92px] w-[92px] shrink-0">
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
            Token
          </div>
          <div className="text-sm font-bold text-neutral-900 dark:text-white">
            {total.toLocaleString()}
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (statusQuery.isLoading || monthlyQuery.isLoading) {
    return (
      <div className="mx-auto w-full p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
          {/* Left: Calendar */}
          <Card className="backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
                  <div className="h-6 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                </div>
              </div>
              <div className="h-[320px] animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
            </CardContent>
          </Card>

          {/* Right: Stats & Details */}
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="h-24 animate-pulse rounded-lg bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60" />
              <div className="h-24 animate-pulse rounded-lg bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60" />
              <div className="h-24 animate-pulse rounded-lg bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60" />
            </div>
            <div className="h-40 animate-pulse rounded-lg bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto w-full p-4 md:p-6 h-fit lg:max-h-[70vh]"
    >
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        className="grid h-full grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]"
      >
        {/* Left Panel: Calendar */}
        <Card className="h-fit backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-xl">
          <CardContent className="flex h-full flex-col p-6">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 p-2 shadow-lg shadow-indigo-500/30 transition-transform hover:scale-105">
                  <CalendarIcon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                  签到日历
                </h3>
              </div>
              {todayCheckedIn && (
                <div className="animate-in fade-in slide-in-from-right-5 duration-500 flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 shadow-sm dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircleIcon className="h-3.5 w-3.5 animate-pulse" />
                  <span>已签</span>
                </div>
              )}
            </div>

            <motion.div
              layout
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
              className="flex-1 rounded-xl border border-neutral-200/60 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-800/80"
            >
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="w-full rounded-lg"
                classNames={{
                  weekdays: "flex gap-1",
                  week: "flex w-full mt-2 gap-1",
                  day_button:
                    "focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white data-[selected-single=true]:bg-neutral-900/10 dark:data-[selected-single=true]:bg-white/10 data-[selected-single=true]:text-neutral-900 dark:data-[selected-single=true]:text-white",
                }}
                modifiers={{
                  checkedIn: (date) => isDateCheckedIn(date),
                }}
                modifiersClassNames={{
                  checkedIn:
                    "relative rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold shadow-md transition-transform hover:scale-105 hover:shadow-lg dark:from-indigo-600 dark:to-purple-700 before:pointer-events-none before:absolute before:inset-0 before:rounded-md before:bg-white/0 data-[selected-single=true]:before:bg-white/10",
                }}
                disabled={(date) => date > today}
              />
            </motion.div>

            {/* Check-in Button (height transition) */}
            <AnimatePresence initial={false}>
              {selectedIsToday && !todayCheckedIn ? (
                <motion.div
                  key="checkin-cta"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="pt-6">
                    <Button
                      onClick={handleCheckIn}
                      disabled={isCheckingIn}
                      className="group relative w-full overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-indigo-500/40 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 dark:from-indigo-500 dark:via-purple-500 dark:to-pink-500 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 transition-opacity group-hover:animate-shimmer group-hover:opacity-100" />
                      <span className="relative flex items-center justify-center gap-2">
                        <SparklesIcon className="h-5 w-5 transition-transform group-hover:rotate-12" />
                        <span>{isCheckingIn ? "签到中..." : "立即签到"}</span>
                      </span>
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Right Panel: Stats & Details */}
        <div className="flex flex-col gap-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="group cursor-pointer backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg transition-all hover:scale-105 hover:shadow-xl">
              <CardContent className="p-5 text-center">
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  连续签到
                </div>
                <div className="mt-3 text-3xl font-bold text-neutral-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                  {consecutiveDays}
                </div>
                <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                  天
                </div>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg transition-all hover:scale-105 hover:shadow-xl">
              <CardContent className="p-5 text-center">
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  累计签到
                </div>
                <div className="mt-3 text-3xl font-bold text-neutral-900 transition-colors group-hover:text-purple-600 dark:text-white dark:group-hover:text-purple-400">
                  {status?.total_check_ins ?? 0}
                </div>
                <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                  次
                </div>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer backdrop-blur-md bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border-indigo-300/30 dark:border-indigo-600/30 shadow-lg transition-all hover:scale-105 hover:shadow-xl">
              <CardContent className="p-5 text-center">
                <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                  明日奖励
                </div>
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  <SparklesIcon className="h-6 w-6 animate-pulse text-indigo-600 dark:text-indigo-400" />
                  <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                    {nextPoints}
                  </div>
                </div>
                <div className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
                  积分
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Selected Date Details */}
          <Card className="backdrop-blur-md bg-white/70 dark:bg-neutral-900/70 border-white/20 dark:border-neutral-700/30 shadow-lg">
            <CardContent className="p-6">
              <motion.div
                key={selectedDate?.toDateString() ?? "none"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="mb-5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-white/20 bg-white/70 p-2 shadow-sm backdrop-blur-sm dark:border-neutral-700/40 dark:bg-neutral-900/50">
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
                  <div className="rounded-full bg-gradient-to-r from-indigo-500/90 to-purple-600/90 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-indigo-500/20">
                    今日
                  </div>
                ) : null}
              </motion.div>

              <div className="mb-5 h-px bg-gradient-to-r from-transparent via-neutral-200/70 to-transparent dark:via-white/10" />

              <div className="space-y-4">
                {checkInRecord && (
                  <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 group relative overflow-hidden rounded-xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/90 to-purple-50/90 p-5 shadow-sm transition-all hover:shadow-md dark:border-indigo-700/60 dark:from-indigo-950/50 dark:to-purple-950/50">
                    <div className="absolute inset-y-4 left-4 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-purple-600 shadow-sm transition-all group-hover:w-1.5" />
                    <div className="pl-4">
                      <div className="flex items-center gap-2">
                        <SparklesIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <div className="font-bold text-indigo-900 dark:text-indigo-100">
                          签到奖励
                        </div>
                      </div>
                      <div className="mt-3 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                        获得{" "}
                        <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                          {checkInRecord.points_awarded}
                        </span>{" "}
                        积分 · 连续{" "}
                        <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                          {checkInRecord.consecutive_days}
                        </span>{" "}
                        天
                      </div>
                    </div>
                  </div>
                )}

                {consumption && (
                  <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 group relative overflow-hidden rounded-xl border border-neutral-200/60 bg-white/90 p-5 shadow-sm backdrop-blur-sm transition-all hover:shadow-md dark:border-neutral-700/60 dark:bg-neutral-800/90">
                    <div className="absolute inset-y-4 left-4 w-1 rounded-full bg-gradient-to-b from-neutral-400 to-neutral-500 shadow-sm transition-all group-hover:w-1.5 dark:from-neutral-600 dark:to-neutral-700" />
                    <div className="pl-4">
                      <div className="font-bold text-neutral-900 dark:text-neutral-100">
                        使用统计
                      </div>
                      <div className="mt-4">
                        {consumption.record_count > 0 ? (
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <TokenDonut
                              input={consumption.input_tokens}
                              output={consumption.output_tokens}
                            />

                            <div className="flex-1 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                              <div className="flex items-center justify-between">
                                <span>消耗积分</span>
                                <span className="font-bold text-neutral-900 dark:text-white">
                                  {consumption.total_amount}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>请求次数</span>
                                <span className="font-semibold text-neutral-900 dark:text-white">
                                  {consumption.record_count}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>输入 Token</span>
                                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                  {consumption.input_tokens.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>输出 Token</span>
                                <span className="font-semibold text-pink-600 dark:text-pink-400">
                                  {consumption.output_tokens.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="italic text-neutral-500">
                            {consumption.message || "这一天还没有使用记录"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {!checkInRecord &&
                  !consumption &&
                  dayConsumptionQuery.isLoading && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200/60 bg-white/90 py-12 backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-800/90">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-600 [animation-delay:-0.3s] dark:bg-indigo-400" />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-purple-600 [animation-delay:-0.15s] dark:bg-purple-400" />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-pink-600 dark:bg-pink-400" />
                    </div>
                  )}

                {!checkInRecord &&
                  !consumption &&
                  !dayConsumptionQuery.isLoading &&
                  selectedDate && (
                    <div className="animate-in fade-in duration-500 rounded-xl border border-dashed border-neutral-300/60 bg-neutral-50/90 p-8 text-center backdrop-blur-sm dark:border-neutral-600/60 dark:bg-neutral-800/90">
                      <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                        {formatDateForAPI(selectedDate) ===
                        formatDateForAPI(today)
                          ? "今天还没有签到哦，快来签到吧～ 🎉"
                          : "这一天暂无记录 📅"}
                      </div>
                    </div>
                  )}
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </motion.div>
  );
}
