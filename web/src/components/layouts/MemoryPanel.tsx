import { Button } from "@/components/ui/button";
import { memoryService, type MemoryItem } from "@/service/memoryService";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  DOCK_HORIZONTAL_MARGIN,
  DOCK_SAFE_AREA,
} from "@/components/layouts/BottomDock";
import { MOBILE_BREAKPOINT } from "@/configs/common";

const springTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
} as const;
const fadeSlide = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
} as const;

function formatRelativeTime(
  dateString: string,
  t: (key: string, defaultValue: string) => string,
): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t("capsule.memory.justNow", "just now");
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function MemoryPanel() {
  const { t } = useTranslation();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Create
  const [isCreating, setIsCreating] = useState(false);
  const [createContent, setCreateContent] = useState("");
  const [saving, setSaving] = useState(false);
  const createTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const query = searchQuery.trim();
    if (!query) {
      void loadMemories();
      return;
    }

    setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const items = await memoryService.searchMemories(query);
          setMemories(items);
        } catch {
          setError(t("capsule.memory.error"));
        } finally {
          setSearching(false);
        }
      })();
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, loadMemories, t]);

  // Focus textarea when opening create/edit
  useEffect(() => {
    if (isCreating) createTextareaRef.current?.focus();
  }, [isCreating]);

  useEffect(() => {
    if (editingKey) editTextareaRef.current?.focus();
  }, [editingKey]);

  const handleCreate = useCallback(async () => {
    const content = createContent.trim();
    if (!content) return;
    setSaving(true);
    try {
      const item = await memoryService.createMemory(content);
      setMemories((prev) => [item, ...prev]);
      setCreateContent("");
      setIsCreating(false);
      toast.success(t("capsule.memory.createSuccess"));
    } catch {
      toast.error(t("capsule.memory.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [createContent, t]);

  const handleUpdate = useCallback(async () => {
    if (!editingKey) return;
    const content = editContent.trim();
    if (!content) return;
    setSaving(true);
    try {
      const updated = await memoryService.updateMemory(editingKey, content);
      setMemories((prev) =>
        prev.map((m) => (m.key === editingKey ? updated : m)),
      );
      setEditingKey(null);
      setEditContent("");
      toast.success(t("capsule.memory.updateSuccess"));
    } catch {
      toast.error(t("capsule.memory.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [editingKey, editContent, t]);

  const handleDelete = useCallback(async (key: string) => {
    let removed: MemoryItem | undefined;
    setMemories((prev) => {
      removed = prev.find((item) => item.key === key);
      return prev.filter((item) => item.key !== key);
    });
    try {
      await memoryService.deleteMemory(key);
    } catch {
      if (removed) {
        setMemories((prev) => [...prev, removed!]);
      }
    }
  }, []);

  const startEdit = useCallback(
    (memory: MemoryItem) => {
      if (isCreating) {
        setIsCreating(false);
        setCreateContent("");
      }
      setEditingKey(memory.key);
      setEditContent(memory.content);
    },
    [isCreating],
  );

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditContent("");
  }, []);

  const startCreate = useCallback(() => {
    if (editingKey) {
      setEditingKey(null);
      setEditContent("");
    }
    setIsCreating(true);
    setCreateContent("");
  }, [editingKey]);

  const cancelCreate = useCallback(() => {
    setIsCreating(false);
    setCreateContent("");
  }, []);

  const isDesktop =
    typeof window !== "undefined" && window.innerWidth >= MOBILE_BREAKPOINT;

  return (
    <div
      className="h-full w-full bg-white dark:bg-neutral-950 flex flex-col"
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
        <div className="border-b border-neutral-200/40 dark:border-neutral-800/40 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {t("app.activityBar.memory")}
              </h2>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {memories.length}{" "}
                {memories.length === 1
                  ? t("capsule.memory.countSingular", "memory")
                  : t("capsule.memory.countPlural", "memories")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startCreate}
                  disabled={isCreating}
                  className="h-8 px-2"
                  title={t("capsule.memory.create")}
                >
                  <PlusIcon className="h-4 w-4" />
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    void loadMemories();
                  }}
                  disabled={loading}
                  className="h-8 px-2"
                >
                  <ArrowPathIcon
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                </Button>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-neutral-200/40 dark:border-neutral-800/40 px-4 py-2 shrink-0">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("capsule.memory.search")}
              className="w-full rounded-md border border-neutral-200 bg-transparent py-1.5 pl-8 pr-3 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:text-neutral-200 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500 transition-colors"
            />
            <AnimatePresence>
              {searching && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400"
                >
                  {t("capsule.memory.searching")}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline Create */}
          <AnimatePresence>
            {isCreating && (
              <motion.div {...fadeSlide} className="mb-3 overflow-hidden">
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                  <textarea
                    ref={createTextareaRef}
                    value={createContent}
                    onChange={(e) => setCreateContent(e.target.value)}
                    placeholder={t("capsule.memory.createPlaceholder")}
                    className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:placeholder:text-neutral-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20 transition-all"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") cancelCreate();
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        void handleCreate();
                      }
                    }}
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelCreate}
                      disabled={saving}
                      className="h-7 px-2 text-xs"
                    >
                      {t("capsule.memory.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleCreate()}
                      disabled={saving || !createContent.trim()}
                      className="h-7 px-3 text-xs"
                    >
                      {saving ? (
                        <ArrowPathIcon className="h-3 w-3 animate-spin" />
                      ) : (
                        t("capsule.memory.save")
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {loading && !searching ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center py-12"
            >
              <div className="flex flex-col items-center gap-3">
                <ArrowPathIcon className="h-5 w-5 animate-spin text-neutral-300 dark:text-neutral-600" />
                <p className="text-sm text-neutral-400 dark:text-neutral-500">
                  {t("capsule.memory.loading")}
                </p>
              </div>
            </motion.div>
          ) : memories.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-12 gap-2 text-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800/50">
                <MagnifyingGlassIcon className="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
              </div>
              <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                {t("capsule.memory.noMemories")}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 max-w-[240px]">
                {t("capsule.memory.noMemoriesHint")}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-1">
              <AnimatePresence mode="popLayout">
                {memories.map((memory, index) => (
                  <motion.div
                    key={memory.key}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      x: -20,
                      transition: { duration: 0.15 },
                    }}
                    transition={{
                      ...springTransition,
                      delay: index * 0.03,
                    }}
                    className="group flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <AnimatePresence mode="wait">
                        {editingKey === memory.key ? (
                          // Edit mode
                          <motion.div
                            key="edit"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <textarea
                              ref={editTextareaRef}
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full resize-none rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/20 dark:border-indigo-900/50 dark:bg-neutral-950 dark:text-neutral-200 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20 transition-all"
                              rows={3}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") cancelEdit();
                                if (
                                  e.key === "Enter" &&
                                  (e.metaKey || e.ctrlKey)
                                ) {
                                  void handleUpdate();
                                }
                              }}
                            />
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={cancelEdit}
                                disabled={saving}
                                className="h-7 px-2 text-xs"
                              >
                                {t("capsule.memory.cancel")}
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => void handleUpdate()}
                                disabled={saving || !editContent.trim()}
                                className="h-7 px-3 text-xs"
                              >
                                {saving ? (
                                  <ArrowPathIcon className="h-3 w-3 animate-spin" />
                                ) : (
                                  t("capsule.memory.save")
                                )}
                              </Button>
                            </div>
                          </motion.div>
                        ) : (
                          // View mode
                          <motion.div
                            key="view"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                              {memory.content}
                            </p>
                            <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                              {formatRelativeTime(memory.updated_at, t)}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    {editingKey !== memory.key && (
                      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <motion.button
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => startEdit(memory)}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-indigo-500 hover:bg-indigo-50 dark:text-neutral-500 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/30 transition-colors"
                          title={t("capsule.memory.edit")}
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => void handleDelete(memory.key)}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                          title={t("capsule.memory.delete")}
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </motion.button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
