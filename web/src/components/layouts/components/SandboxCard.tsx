import type {
  SandboxEntry,
  SandboxStatusResponse,
} from "@/service/sandboxService";
import { BoltIcon, PlayIcon, TrashIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import React from "react";
import { useTranslation } from "react-i18next";

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

function shouldWarn(status: SandboxStatusResponse | undefined): boolean {
  return (
    status?.status === "running" &&
    status.remaining_seconds != null &&
    status.remaining_seconds < 300
  );
}

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

// --- Component ---

interface SandboxCardProps {
  sandbox: SandboxEntry;
  status: SandboxStatusResponse | undefined;
  isDeleting: boolean;
  isKeepingAlive: boolean;
  isStarting: boolean;
  onOpen: (sb: SandboxEntry) => void;
  onDelete: (sb: SandboxEntry) => void;
  onKeepAlive: (sb: SandboxEntry) => void;
  onStart: (sb: SandboxEntry) => void;
}

function SandboxCardInner({
  sandbox: sb,
  status: statusRes,
  isDeleting,
  isKeepingAlive,
  isStarting,
  onOpen,
  onDelete,
  onKeepAlive,
  onStart,
}: SandboxCardProps) {
  const { t } = useTranslation();
  const liveStatus = resolveStatus(statusRes);
  const isStopped = liveStatus === "stopped";
  const isRunning = liveStatus === "running";
  const warn = shouldWarn(statusRes);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isStopped ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`mb-2 rounded-lg p-3 transition-colors ${
        isStopped
          ? "bg-neutral-100/40 dark:bg-white/[0.02]"
          : "cursor-pointer bg-neutral-100/60 hover:bg-neutral-200/50 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
      }`}
      onClick={() => {
        if (!isStopped) onOpen(sb);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 shrink-0 rounded-full ${
                warn
                  ? "animate-pulse bg-amber-400"
                  : statusDotClasses[liveStatus]
              }`}
            />
            <p
              className={`truncate text-[13px] font-medium ${
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
              <span>{formatRemaining(statusRes.remaining_seconds)}</span>
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
                onStart(sb);
              }}
              disabled={isStarting}
              className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 disabled:opacity-40 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
              title={t("app.sandbox.start")}
            >
              <PlayIcon className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Keep-alive — only for running sandboxes */}
          {isRunning && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onKeepAlive(sb);
              }}
              disabled={isKeepingAlive}
              className="rounded-md p-1 text-neutral-300 transition-colors hover:bg-amber-50 hover:text-amber-500 disabled:opacity-30 dark:text-neutral-600 dark:hover:bg-amber-900/20 dark:hover:text-amber-400"
              title={t("app.sandbox.keepAliveBtn")}
            >
              <BoltIcon className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Delete */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(sb);
            }}
            disabled={isDeleting}
            className="rounded-md p-1 text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title={t("common.delete")}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const SandboxCard = React.memo(SandboxCardInner);
export default SandboxCard;
