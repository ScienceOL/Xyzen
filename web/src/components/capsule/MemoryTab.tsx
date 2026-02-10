import { memoryService, type MemoryItem } from "@/service/memoryService";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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

export function MemoryTab() {
  const { t } = useTranslation();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await memoryService.listMemories();
      setMemories(items);
    } catch {
      setError(t("capsule.memory.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const handleDelete = useCallback(
    async (key: string) => {
      const prev = memories;
      setMemories((m) => m.filter((item) => item.key !== key));
      try {
        await memoryService.deleteMemory(key);
      } catch {
        setMemories(prev);
      }
    },
    [memories],
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          {t("capsule.memory.loading")}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        <button
          onClick={() => void loadMemories()}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
        >
          {t("capsule.sandbox.refresh")}
        </button>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {t("capsule.memory.noMemories")}
        </p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {t("capsule.memory.noMemoriesHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {memories.length} {memories.length === 1 ? "memory" : "memories"}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {memories.map((memory) => (
            <div
              key={memory.key}
              className="group flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words">
                  {memory.content}
                </p>
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                  {formatRelativeTime(memory.updated_at)}
                </p>
              </div>
              <button
                onClick={() => void handleDelete(memory.key)}
                className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
                title="Delete"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
