import SandboxCard from "@/components/layouts/components/SandboxCard";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import SandboxConfigModal from "@/components/modals/SandboxConfigModal";
import {
  sandboxService,
  type SandboxEntry,
  type SandboxStatusResponse,
} from "@/service/sandboxService";
import {
  ArrowPathIcon,
  Cog6ToothIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence } from "framer-motion";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const SandboxWorkspace = React.lazy(() => import("./SandboxWorkspace"));

const AUTO_REFRESH_INTERVAL = 30_000; // 30 seconds

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

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<SandboxEntry | null>(null);

  // Config modal state
  const [isConfigOpen, setIsConfigOpen] = useState(false);

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
      setError(t("app.sandbox.loadError"));
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

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const entry = deleteTarget;
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
      toast.success(t("app.sandbox.deleted"));
    } catch {
      toast.error(t("app.sandbox.deleteError"));
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  }, [deleteTarget, t]);

  const handleKeepAlive = useCallback(
    async (entry: SandboxEntry) => {
      setKeepAliveId(entry.session_id);
      try {
        const res = await sandboxService.keepAlive(entry.session_id);
        if (res.success) {
          toast.success(t("app.sandbox.keepAlive"));
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
        toast.error(t("app.sandbox.keepAliveError"));
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
          toast.success(t("app.sandbox.started"));
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
        toast.error(t("app.sandbox.startError"));
      } finally {
        setStartingId(null);
      }
    },
    [t],
  );

  // --- Workspace view ---
  if (selectedSandbox) {
    return (
      <Suspense>
        <SandboxWorkspace
          sandbox={selectedSandbox}
          onBack={() => setSelectedSandbox(null)}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200/60 px-4 py-3 dark:border-neutral-800/60 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {t("app.sandbox.title")}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {t("app.sandbox.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsConfigOpen(true)}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title={t("app.sandbox.config.title")}
          >
            <Cog6ToothIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title={t("common.refresh")}
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {loading && sandboxes.length === 0 && (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-neutral-400 dark:text-neutral-500">
              {t("common.loading")}
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
              {t("common.retry")}
            </button>
          </div>
        )}

        {!loading && !error && sandboxes.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CommandLineIcon className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {t("app.sandbox.empty")}
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {t("app.sandbox.emptyHint")}
            </p>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {sandboxes.map((sb) => (
            <SandboxCard
              key={sb.session_id}
              sandbox={sb}
              status={statusMap[sb.session_id]}
              isDeleting={deletingId === sb.session_id}
              isKeepingAlive={keepAliveId === sb.session_id}
              isStarting={startingId === sb.session_id}
              onOpen={setSelectedSandbox}
              onDelete={setDeleteTarget}
              onKeepAlive={(entry) => void handleKeepAlive(entry)}
              onStart={(entry) => void handleStart(entry)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title={t("app.sandbox.deleteConfirmTitle")}
        message={t("app.sandbox.deleteConfirmMessage", {
          name:
            deleteTarget?.session_name ||
            deleteTarget?.session_id.slice(0, 8) ||
            "",
        })}
        confirmLabel={t("common.delete")}
        destructive
      />

      {/* Sandbox config modal */}
      <SandboxConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
      />
    </div>
  );
}
