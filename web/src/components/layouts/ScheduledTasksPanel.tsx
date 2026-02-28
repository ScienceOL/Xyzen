import ConfirmationModal from "@/components/modals/ConfirmationModal";
import {
  useCancelScheduledTask,
  useScheduledTasks,
} from "@/hooks/queries/useScheduledTasksQuery";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { useXyzen } from "@/store";
import type { ScheduledTask } from "@/types/scheduledTask";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { easeOut, motion } from "motion/react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  DOCK_HORIZONTAL_MARGIN,
  DOCK_SAFE_AREA,
} from "@/components/layouts/BottomDock";
import { MOBILE_BREAKPOINT } from "@/configs/common";

// ── Helpers ──────────────────────────────────────────────────────────

function formatRelativeTime(iso: string, t: TFunction): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = date.getTime() - now;
  const absDiff = Math.abs(diff);
  const isFuture = diff > 0;

  if (absDiff < 60_000) {
    return isFuture
      ? t("app.tasksPanel.inMinutes", { count: 1 })
      : t("app.tasksPanel.justNow");
  }
  if (absDiff < 3600_000) {
    const mins = Math.round(absDiff / 60_000);
    return isFuture
      ? t("app.tasksPanel.inMinutes", { count: mins })
      : t("app.tasksPanel.minutesAgo", { count: mins });
  }
  if (absDiff < 86400_000) {
    const hours = Math.round(absDiff / 3600_000);
    return isFuture
      ? t("app.tasksPanel.inHours", { count: hours })
      : t("app.tasksPanel.hoursAgo", { count: hours });
  }
  const days = Math.round(absDiff / 86400_000);
  return isFuture
    ? t("app.tasksPanel.inDays", { count: days })
    : t("app.tasksPanel.daysAgo", { count: days });
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** Convert cron expression to a human-readable string */
function humanizeCron(expr: string, lang: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, , , dow] = parts;
  const pad = (s: string) => s.padStart(2, "0");
  const weekdays =
    lang === "zh" ? WEEKDAYS_ZH : lang === "ja" ? WEEKDAYS_JA : WEEKDAYS_EN;

  // Try to extract a readable time
  const hasFixedTime = /^\d+$/.test(min) && /^\d+$/.test(hour);
  const timeStr = hasFixedTime ? `${pad(hour)}:${pad(min)}` : "";

  // Day-of-week
  if (dow && dow !== "*" && dow !== "?") {
    const dayIdx = parseInt(dow, 10);
    const dayName =
      !isNaN(dayIdx) && dayIdx >= 0 && dayIdx <= 6 ? weekdays[dayIdx] : dow;
    return timeStr ? `${dayName} ${timeStr}` : dayName;
  }

  if (timeStr) {
    const everyDay = lang === "zh" ? "每天" : lang === "ja" ? "毎日" : "Daily";
    return `${everyDay} ${timeStr}`;
  }

  // Interval patterns like */5
  if (min.startsWith("*/")) {
    const n = min.slice(2);
    return lang === "zh"
      ? `每${n}分钟`
      : lang === "ja"
        ? `${n}分ごと`
        : `Every ${n}min`;
  }
  if (hour.startsWith("*/")) {
    const n = hour.slice(2);
    return lang === "zh"
      ? `每${n}小时`
      : lang === "ja"
        ? `${n}時間ごと`
        : `Every ${n}h`;
  }

  return expr;
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-400",
  paused: "bg-amber-400",
  completed: "bg-neutral-400 dark:bg-neutral-500",
  failed: "bg-red-400",
  cancelled: "bg-neutral-400 dark:bg-neutral-500",
};

function getStatusLabel(task: ScheduledTask, t: TFunction): string {
  if (task.status === "active") {
    return task.schedule_type !== "once"
      ? t("app.tasksPanel.statusRecurring")
      : t("app.tasksPanel.statusPending");
  }
  const map: Record<string, string> = {
    paused: t("app.tasksPanel.statusPaused"),
    completed: t("app.tasksPanel.statusCompleted"),
    failed: t("app.tasksPanel.statusFailed"),
    cancelled: t("app.tasksPanel.statusCancelled"),
  };
  return map[task.status] ?? task.status;
}

const SCHEDULE_LABELS: Record<ScheduledTask["schedule_type"], string> = {
  once: "app.tasksPanel.scheduleOnce",
  daily: "app.tasksPanel.scheduleDaily",
  weekly: "app.tasksPanel.scheduleWeekly",
  cron: "app.tasksPanel.scheduleCron",
};

const cardVariants = {
  front: { rotateY: 0, transition: { duration: 0.45, ease: easeOut } },
  back: { rotateY: 180, transition: { duration: 0.45, ease: easeOut } },
};

// ── Card ─────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onDelete,
  isDeleting,
}: {
  task: ScheduledTask;
  onDelete: (task: ScheduledTask) => void;
  isDeleting: boolean;
}) {
  const { t, i18n } = useTranslation();
  const resolveAgent = useXyzen((s) => s.resolveAgent);
  const activateChannel = useXyzen((s) => s.activateChannel);
  const activateChannelForAgent = useXyzen((s) => s.activateChannelForAgent);
  const setActivePanel = useXyzen((s) => s.setActivePanel);

  const [isFlipped, setIsFlipped] = useState(false);

  const agent = resolveAgent(task.agent_id);
  const dot = STATUS_DOT[task.status] ?? STATUS_DOT.cancelled;
  const isRecurring = task.schedule_type !== "once";
  const lang = i18n.language;

  const scheduleDesc =
    task.schedule_type === "cron" && task.cron_expression
      ? humanizeCron(task.cron_expression, lang)
      : t(SCHEDULE_LABELS[task.schedule_type]);

  const handleNavigate = async () => {
    if (task.topic_id) {
      await activateChannel(task.topic_id);
    } else {
      await activateChannelForAgent(task.agent_id);
    }
    setActivePanel("chat");
  };

  const isTouchDevice =
    typeof window !== "undefined" && "ontouchstart" in window;

  return (
    <div
      className="relative aspect-[3/4] perspective-1000 cursor-pointer"
      onClick={() => isTouchDevice && setIsFlipped((f) => !f)}
      onMouseEnter={() => !isTouchDevice && setIsFlipped(true)}
      onMouseLeave={() => !isTouchDevice && setIsFlipped(false)}
    >
      {/* ── Front ── */}
      <motion.div
        className="absolute inset-0 backface-hidden rounded-xl border border-foreground/[0.08] p-2.5 md:p-3.5 flex flex-col items-center justify-center bg-gradient-to-br from-muted/60 via-background to-muted/40 text-center"
        animate={isFlipped ? "back" : "front"}
        variants={cardVariants}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Schedule badge */}
        <span className="mb-1.5 md:mb-2.5 text-[9px] md:text-[10px] font-medium tracking-wider uppercase text-muted-foreground/50">
          {isRecurring ? "↻" : "›"} {scheduleDesc}
        </span>

        {/* Prompt */}
        <p className="text-[12px] md:text-[14px] font-semibold leading-[1.3] text-foreground line-clamp-3 tracking-tight">
          {task.prompt}
        </p>

        {/* Agent */}
        {agent && (
          <span className="mt-0.5 md:mt-1 text-[9px] md:text-[10px] text-muted-foreground/60 truncate max-w-full">
            {agent.name}
          </span>
        )}

        {/* Status + time pinned to bottom */}
        <div className="mt-auto pt-2 md:pt-3 flex items-center gap-1 md:gap-1.5">
          <span
            className={`size-[4px] md:size-[5px] rounded-full shrink-0 ${dot}`}
          />
          <span className="text-[9px] md:text-[10px] text-muted-foreground/70 leading-none truncate">
            {getStatusLabel(task, t)}
          </span>
          <span className="text-[9px] md:text-[10px] text-muted-foreground/40 leading-none shrink-0">
            {task.status === "active"
              ? formatRelativeTime(task.scheduled_at, t)
              : task.last_run_at
                ? formatRelativeTime(task.last_run_at, t)
                : formatRelativeTime(task.created_at, t)}
          </span>
        </div>
      </motion.div>

      {/* ── Back ── */}
      <motion.div
        className="absolute inset-0 backface-hidden rounded-xl border border-foreground/[0.08] flex flex-col bg-gradient-to-tr from-muted/60 via-background to-muted/40 overflow-hidden"
        initial={{ rotateY: 180 }}
        animate={isFlipped ? "front" : "back"}
        variants={cardVariants}
        style={{ transformStyle: "preserve-3d", rotateY: 180 }}
      >
        {/* Run count hero */}
        <div className="flex items-baseline justify-center gap-0.5 pt-3 pb-1.5 md:pt-4 md:pb-2">
          <span className="text-xl md:text-2xl font-bold tabular-nums text-foreground">
            {task.run_count}
          </span>
          {task.max_runs ? (
            <span className="text-[10px] md:text-xs text-muted-foreground/40">
              /{task.max_runs}
            </span>
          ) : null}
          <span className="text-[9px] md:text-[10px] text-muted-foreground/50 ml-0.5">
            {t("app.tasksPanel.runs")}
          </span>
        </div>

        {/* Separator */}
        <div className="mx-2.5 md:mx-3 h-px bg-foreground/[0.05]" />

        {/* Detail rows */}
        <div className="flex-1 px-2.5 md:px-3 py-1.5 md:py-2 space-y-[4px] md:space-y-[6px] overflow-hidden">
          <DetailRow
            label={t("app.tasksPanel.scheduleType")}
            value={scheduleDesc}
          />
          <DetailRow
            label={t("app.tasksPanel.timezone")}
            value={task.timezone}
          />
          {task.status === "active" && (
            <DetailRow
              label={t("app.tasksPanel.nextRun")}
              value={formatShortTime(task.scheduled_at)}
              highlight
            />
          )}
          {task.last_run_at && (
            <DetailRow
              label={t("app.tasksPanel.lastRun")}
              value={formatShortTime(task.last_run_at)}
            />
          )}
          <DetailRow
            label={t("app.tasksPanel.createdAt")}
            value={formatShortTime(task.created_at)}
          />

          {/* Error inline */}
          {task.last_error && (
            <p className="!mt-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] md:text-[10px] leading-tight text-red-400 line-clamp-1">
              {task.last_error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-foreground/[0.05] px-2 md:px-3 py-1.5">
          {agent ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleNavigate();
              }}
              className="flex items-center gap-0.5 text-[9px] md:text-[10px] text-primary/80 hover:text-primary transition-colors truncate"
            >
              <span className="truncate max-w-[70px] md:max-w-[100px]">
                {agent.name}
              </span>
              <ArrowTopRightOnSquareIcon className="size-2.5 md:size-3 shrink-0 opacity-60" />
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task);
            }}
            disabled={isDeleting}
            className="rounded p-0.5 text-muted-foreground/30 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
          >
            <TrashIcon className="size-3 md:size-3.5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 min-w-0">
      <span className="shrink-0 text-[9px] md:text-[10px] text-muted-foreground/40">
        {label}
      </span>
      <span
        className={`truncate text-right text-[9px] md:text-[10px] ${
          highlight
            ? "text-emerald-500 dark:text-emerald-400 font-medium"
            : "text-foreground/60"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────

export default function ScheduledTasksPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tasks, isLoading, error } = useScheduledTasks();
  const cancelMutation = useCancelScheduledTask();

  const [deleteTarget, setDeleteTarget] = useState<ScheduledTask | null>(null);

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.scheduledTasks.all,
    });
  }, [queryClient]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await cancelMutation.mutateAsync(deleteTarget.id);
      toast.success(t("app.tasksPanel.deleted"));
    } catch {
      toast.error(t("app.tasksPanel.deleteError"));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, cancelMutation, t]);

  const isDesktop =
    typeof window !== "undefined" && window.innerWidth >= MOBILE_BREAKPOINT;

  return (
    <div
      className="flex h-full flex-col"
      style={
        isDesktop
          ? {
              paddingTop: 16,
              paddingBottom: DOCK_SAFE_AREA,
              paddingLeft: DOCK_HORIZONTAL_MARGIN,
              paddingRight: DOCK_HORIZONTAL_MARGIN,
            }
          : {}
      }
    >
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden sm:rounded-2xl sm:border sm:border-neutral-200/40 sm:dark:border-neutral-700/50 bg-neutral-50/50 dark:bg-neutral-900/30">
        {/* Header */}
        <div className="shrink-0 border-b border-neutral-200/40 dark:border-neutral-800/40 px-3 py-3 md:px-4 md:py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] md:text-base font-semibold text-foreground leading-tight">
                {t("app.tasksPanel.title")}
              </h2>
              <p className="mt-0.5 text-[10px] md:text-xs text-muted-foreground/60 leading-none">
                {t("app.tasksPanel.subtitle")}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="rounded-lg p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowPathIcon className="size-3.5 md:size-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-2 md:p-3">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="size-4 animate-spin rounded-full border-[1.5px] border-muted-foreground/20 border-t-primary" />
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-lg bg-red-500/10 px-3 py-3 text-center text-[11px] md:text-xs text-red-400">
              {t("app.tasksPanel.loadError")}
            </div>
          )}

          {!isLoading && !error && tasks && tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarDaysIcon className="size-6 md:size-8 text-muted-foreground/20" />
              <p className="mt-2 text-[11px] md:text-xs font-medium text-muted-foreground/60">
                {t("app.tasksPanel.empty")}
              </p>
              <p className="mt-0.5 text-[9px] md:text-[10px] text-muted-foreground/40">
                {t("app.tasksPanel.emptyHint")}
              </p>
            </div>
          )}

          {!isLoading && !error && tasks && tasks.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1.5 md:gap-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onDelete={setDeleteTarget}
                  isDeleting={
                    cancelMutation.isPending &&
                    cancelMutation.variables === task.id
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation modal */}
      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title={t("app.tasksPanel.deleteConfirmTitle")}
        message={t("app.tasksPanel.deleteConfirmMessage")}
        destructive
      />
    </div>
  );
}
