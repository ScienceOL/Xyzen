import {
  sandboxService,
  type SandboxEntry,
  type SandboxStatusResponse,
} from "@/service/sandboxService";
import {
  ArrowPathIcon,
  BoltIcon,
  CommandLineIcon,
  PlayIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import SandboxWorkspace from "./SandboxWorkspace";

const AUTO_REFRESH_INTERVAL = 30_000; // 30 seconds

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatRemaining(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m left`;
}

// --- Status helpers ---

type SandboxLiveStatus = "running" | "stopped" | "unknown" | "loading";

function resolveStatus(
  status: SandboxStatusResponse | undefined,
): SandboxLiveStatus {
  if (!status) return "loading";
  return status.status;
}

const statusDotClasses: Record<SandboxLiveStatus, string> = {
  running: "bg-emerald-400",
  stopped: "bg-neutral-400 dark:bg-neutral-600",
  unknown: "bg-neutral-400 dark:bg-neutral-600",
  loading: "bg-neutral-300 dark:bg-neutral-700 animate-pulse",
};

const statusBadgeClasses: Record<SandboxLiveStatus, string> = {
  running:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
  stopped:
    "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  unknown:
    "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400",
  loading:
    "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500",
};

function statusLabel(s: SandboxLiveStatus): string {
  if (s === "loading") return "…";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Running but <5 min remaining → amber pulse dot */
function shouldWarn(
  status: SandboxStatusResponse | undefined,
): boolean {
  return (
    status?.status === "running" &&
    status.remaining_seconds != null &&
    status.remaining_seconds < 300
  );
}

export default function SandboxPanel() {
  const { t } = useTranslation();
  const [sandboxes, setSandboxes] = useState<SandboxEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [keepAliveId, setKeepAliveId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [selectedSandbox, setSelectedSandbox] = useState<SandboxEntry | null>(
    null,
  );
  const [statusMap, setStatusMap] = useState<
    Record<string, SandboxStatusResponse>
  >({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Fetch real status for each sandbox ---
  const fetchStatuses = useCallback(async (entries: SandboxEntry[]) => {
    const results: Record<string, SandboxStatusResponse> = {};
    await Promise.allSettled(
      entries.map(async (sb) => {
        try {
          results[sb.session_id] = await sandboxService.getSandboxStatus(
            sb.session_id,
          );
        } catch {
          // keep previous or mark unknown
        }
      }),
    );
    setStatusMap((prev) => ({ ...prev, ...results }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sandboxService.listSandboxes();
      setSandboxes(res.sandboxes);
      void fetchStatuses(res.sandboxes);
    } catch {
      setError(t("app.sandbox.loadError", "Failed to load sandboxes"));
    } finally {
      setLoading(false);
    }
  }, [t, fetchStatuses]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => void load(), AUTO_REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  // --- Actions ---

  const handleDelete = useCallback(
    async (entry: SandboxEntry) => {
      setDeletingId(entry.session_id);
      try {
        await sandboxService.deleteSandbox(entry.session_id);
        setSandboxes((prev) =>
          prev.filter((s) => s.session_id !== entry.session_id),
        );
        setStatusMap((prev) => {
          const next = { ...prev };
          delete next[entry.session_id];
          return next;
        });
        toast.success(t("app.sandbox.deleted", "Sandbox deleted"));
      } catch {
        toast.error(t("app.sandbox.deleteError", "Failed to delete sandbox"));
      } finally {
        setDeletingId(null);
      }
    },
    [t],
  );

  const handleKeepAlive = useCallback(
    async (entry: SandboxEntry) => {
      setKeepAliveId(entry.session_id);
      try {
        const res = await sandboxService.keepAlive(entry.session_id);
        if (res.success) {
          toast.success(t("app.sandbox.keepAlive", "Sandbox timer refreshed"));
          try {
            const s = await sandboxService.getSandboxStatus(entry.session_id);
            setStatusMap((prev) => ({ ...prev, [entry.session_id]: s }));
          } catch {
            /* ignore */
          }
        } else {
          toast.error(res.message || "Keep-alive failed");
        }
      } catch {
        toast.error(
          t("app.sandbox.keepAliveError", "Failed to refresh sandbox timer"),
        );
      } finally {
        setKeepAliveId(null);
      }
    },
    [t],
  );

  const handleStart = useCallback(
    async (entry: SandboxEntry) => {
      setStartingId(entry.session_id);
      try {
        const res = await sandboxService.startSandbox(entry.session_id);
        if (res.success) {
          toast.success(t("app.sandbox.started", "Sandbox started"));
          try {
            const s = await sandboxService.getSandboxStatus(entry.session_id);
            setStatusMap((prev) => ({ ...prev, [entry.session_id]: s }));
          } catch {
            /* ignore */
          }
        } else {
          toast.error(res.message || "Failed to start sandbox");
        }
      } catch {
        toast.error(
          t("app.sandbox.startError", "Failed to start sandbox"),
        );
      } finally {
        setStartingId(null);
      }
    },
    [t],
  );

  // --- Workspace view ---
  if (selectedSandbox) {
    return (
      <SandboxWorkspace
        sandbox={selectedSandbox}
        onBack={() => setSelectedSandbox(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {t("app.sandbox.title", "Sandboxes")}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {t("app.sandbox.subtitle", "Manage active sandbox environments")}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title={t("common.refresh", "Refresh")}
        >
          <ArrowPathIcon
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {loading && sandboxes.length === 0 && (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-neutral-400 dark:text-neutral-500">
              {t("common.loading", "Loading...")}
            </p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            <button
              onClick={() => void load()}
              className="text-xs text-neutral-500 underline hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              {t("common.retry", "Retry")}
            </button>
          </div>
        )}

        {!loading && !error && sandboxes.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CommandLineIcon className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {t("app.sandbox.empty", "No active sandboxes")}
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {t(
                "app.sandbox.emptyHint",
                "Sandboxes are created automatically when agents use code execution tools.",
              )}
            </p>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {sandboxes.map((sb) => {
            const statusRes = statusMap[sb.session_id];
            const liveStatus = resolveStatus(statusRes);
            const isStopped = liveStatus === "stopped";
            const isRunning = liveStatus === "running";
            const warn = shouldWarn(statusRes);

            return (
              <motion.div
                key={sb.session_id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`mb-2 rounded-lg border p-3 transition-shadow ${
                  isStopped
                    ? "border-neutral-200/60 bg-neutral-50 dark:border-neutral-800/60 dark:bg-neutral-900/50"
                    : "cursor-pointer border-neutral-200 bg-white hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                }`}
                onClick={() => {
                  if (!isStopped) setSelectedSandbox(sb);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {/* Title row */}
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          warn
                            ? "bg-amber-400 animate-pulse"
                            : statusDotClasses[liveStatus]
                        }`}
                      />
                      <p
                        className={`truncate text-sm font-medium ${
                          isStopped
                            ? "text-neutral-400 dark:text-neutral-500"
                            : "text-neutral-900 dark:text-white"
                        }`}
                      >
                        {sb.session_name || sb.session_id.slice(0, 8)}
                      </p>
                      {/* Status badge */}
                      <span
                        className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${statusBadgeClasses[liveStatus]}`}
                      >
                        {statusLabel(liveStatus)}
                      </span>
                    </div>

                    {sb.agent_name && (
                      <p className="mt-1 truncate pl-4 text-xs text-neutral-500 dark:text-neutral-400">
                        {sb.agent_name}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="mt-1.5 flex items-center gap-3 pl-4 text-[10px] text-neutral-400 dark:text-neutral-500">
                      <span>{sb.backend}</span>
                      <span>{formatRelativeTime(sb.created_at)}</span>
                      {statusRes?.remaining_seconds != null ? (
                        <span>
                          {formatRemaining(statusRes.remaining_seconds)}
                        </span>
                      ) : (
                        sb.ttl_seconds != null && (
                          <span>{formatRemaining(sb.ttl_seconds)}</span>
                        )
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Start button — only for stopped sandboxes */}
                    {isStopped && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleStart(sb);
                        }}
                        disabled={startingId === sb.session_id}
                        className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 disabled:opacity-40 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                        title={t("app.sandbox.start", "Start sandbox")}
                      >
                        <PlayIcon className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Keep-alive — only for running sandboxes */}
                    {isRunning && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleKeepAlive(sb);
                        }}
                        disabled={keepAliveId === sb.session_id}
                        className="rounded-md p-1 text-neutral-300 transition-colors hover:bg-amber-50 hover:text-amber-500 disabled:opacity-30 dark:text-neutral-600 dark:hover:bg-amber-900/20 dark:hover:text-amber-400"
                        title={t(
                          "app.sandbox.keepAliveBtn",
                          "Refresh sandbox timer",
                        )}
                      >
                        <BoltIcon className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(sb);
                      }}
                      disabled={deletingId === sb.session_id}
                      className="rounded-md p-1 text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title={t("common.delete", "Delete")}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
