import { sandboxService, type SandboxEntry } from "@/service/sandboxService";
import {
  ArrowPathIcon,
  CommandLineIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import SandboxWorkspace from "./SandboxWorkspace";

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

function formatTtl(seconds: number | null): string {
  if (seconds == null) return "";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m left`;
}

export default function SandboxPanel() {
  const { t } = useTranslation();
  const [sandboxes, setSandboxes] = useState<SandboxEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedSandbox, setSelectedSandbox] = useState<SandboxEntry | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sandboxService.listSandboxes();
      setSandboxes(res.sandboxes);
    } catch {
      setError(t("app.sandbox.loadError", "Failed to load sandboxes"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (entry: SandboxEntry) => {
      setDeletingId(entry.session_id);
      try {
        await sandboxService.deleteSandbox(entry.session_id);
        setSandboxes((prev) =>
          prev.filter((s) => s.session_id !== entry.session_id),
        );
        toast.success(t("app.sandbox.deleted", "Sandbox deleted"));
      } catch {
        toast.error(t("app.sandbox.deleteError", "Failed to delete sandbox"));
      } finally {
        setDeletingId(null);
      }
    },
    [t],
  );

  // Workspace view when a sandbox is selected
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
          {sandboxes.map((sb) => (
            <motion.div
              key={sb.session_id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="mb-2 cursor-pointer rounded-lg border border-neutral-200 bg-white p-3 transition-shadow hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
              onClick={() => setSelectedSandbox(sb)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                      {sb.session_name || sb.session_id.slice(0, 8)}
                    </p>
                  </div>
                  {sb.agent_name && (
                    <p className="mt-1 truncate pl-4 text-xs text-neutral-500 dark:text-neutral-400">
                      {sb.agent_name}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-3 pl-4 text-[10px] text-neutral-400 dark:text-neutral-500">
                    <span>{sb.backend}</span>
                    <span>{formatRelativeTime(sb.created_at)}</span>
                    {sb.ttl_seconds != null && (
                      <span>{formatTtl(sb.ttl_seconds)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(sb);
                  }}
                  disabled={deletingId === sb.session_id}
                  className="shrink-0 rounded-md p-1 text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  title={t("common.delete", "Delete")}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
