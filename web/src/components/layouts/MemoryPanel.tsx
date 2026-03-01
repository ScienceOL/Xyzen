import { Button } from "@/components/ui/button";
import {
  memoryService,
  type CoreMemory,
  type MemoryItem,
} from "@/service/memoryService";
import {
  ArrowPathIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  DOCK_HORIZONTAL_MARGIN,
  DOCK_SAFE_AREA,
} from "@/components/layouts/BottomDock";
import { Textarea } from "@/components/base/Textarea";
import { useIsMobile } from "@/hooks/useMediaQuery";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

type Tab = "profile" | "memories";

const CORE_SECTIONS = [
  "user_summary",
  "preferences",
  "active_context",
  "working_rules",
] as const;

type CoreSection = (typeof CORE_SECTIONS)[number];

const SECTION_LABEL_KEYS: Record<CoreSection, string> = {
  user_summary: "capsule.memory.core.userSummary",
  preferences: "capsule.memory.core.preferences",
  active_context: "capsule.memory.core.activeContext",
  working_rules: "capsule.memory.core.workingRules",
};

const MAX_SECTION_CHARS = 500;

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

// ---------------------------------------------------------------------------
// Core Memory Profile Tab
// ---------------------------------------------------------------------------

function CoreMemoryTab() {
  const { t } = useTranslation();
  const [coreMemory, setCoreMemory] = useState<CoreMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<CoreSection | null>(
    null,
  );
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const loadCoreMemory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await memoryService.getCoreMemory();
      setCoreMemory(data);
    } catch {
      toast.error(t("capsule.memory.core.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadCoreMemory();
  }, [loadCoreMemory]);

  const startEdit = useCallback(
    (section: CoreSection) => {
      setEditingSection(section);
      setEditContent(coreMemory?.[section] ?? "");
    },
    [coreMemory],
  );

  const cancelEdit = useCallback(() => {
    setEditingSection(null);
    setEditContent("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingSection) return;
    setSaving(true);
    try {
      const updated = await memoryService.updateCoreMemorySection(
        editingSection,
        editContent,
      );
      setCoreMemory(updated);
      setEditingSection(null);
      setEditContent("");
      toast.success(t("capsule.memory.core.saveSuccess"));
    } catch {
      toast.error(t("capsule.memory.core.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [editingSection, editContent, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-5 w-5 animate-spin text-neutral-300 dark:text-neutral-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {CORE_SECTIONS.map((section, index) => {
        const content = coreMemory?.[section] ?? "";
        const isEditing = editingSection === section;
        const isEmpty = !content.trim();

        return (
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springTransition, delay: index * 0.05 }}
            className="rounded-lg bg-neutral-100/60 dark:bg-white/[0.04]"
          >
            {/* Section header */}
            <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
              <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                {t(SECTION_LABEL_KEYS[section])}
              </span>
              {!isEditing && (
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => startEdit(section)}
                  className="p-1 rounded-md text-neutral-400 hover:text-indigo-500 hover:bg-indigo-50 dark:text-neutral-500 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/30 transition-colors"
                  title={t("capsule.memory.edit")}
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </div>

            {/* Section content */}
            <div className="px-3.5 pb-3">
              <AnimatePresence mode="wait">
                {isEditing ? (
                  <motion.div
                    key="edit"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Textarea
                      autoFocus
                      value={editContent}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_SECTION_CHARS) {
                          setEditContent(e.target.value);
                        }
                      }}
                      className="text-[13px]"
                      rows={4}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelEdit();
                        if (
                          e.key === "Enter" &&
                          (e.metaKey || e.ctrlKey)
                        ) {
                          void handleSave();
                        }
                      }}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">
                        {t("capsule.memory.core.charCount", {
                          count: editContent.length,
                          max: MAX_SECTION_CHARS,
                        })}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={cancelEdit}
                          disabled={saving}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-white/[0.06] transition-colors"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                          {t("capsule.memory.cancel")}
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => void handleSave()}
                          disabled={saving}
                          className="flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50 dark:hover:bg-indigo-400 transition-colors"
                        >
                          {saving ? (
                            <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckIcon className="w-3.5 h-3.5" />
                          )}
                          {t("capsule.memory.save")}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="view"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {isEmpty ? (
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 italic py-1">
                        {t("capsule.memory.core.emptyHint")}
                      </p>
                    ) : (
                      <p className="text-[13px] text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words leading-relaxed">
                        {content}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Episodic Memories Tab
// ---------------------------------------------------------------------------

function EpisodicMemoriesTab() {
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
  // Edit
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header actions */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {memories.length}{" "}
          {memories.length === 1
            ? t("capsule.memory.countSingular", "memory")
            : t("capsule.memory.countPlural", "memories")}
        </span>
        <div className="flex items-center gap-1">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={startCreate}
              disabled={isCreating}
              className="h-7 px-2"
              title={t("capsule.memory.create")}
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                void loadMemories();
              }}
              disabled={loading}
              className="h-7 px-2"
            >
              <ArrowPathIcon
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </motion.div>
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
            className="w-full rounded-sm border border-neutral-200 bg-transparent py-1.5 pl-8 pr-3 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:text-neutral-200 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500 transition-colors"
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
      <div className="flex-1 overflow-auto custom-scrollbar p-4">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mb-3 rounded-lg bg-red-50/80 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline Create */}
        <AnimatePresence>
          {isCreating && (
            <motion.div {...fadeSlide} className="mb-3 overflow-hidden">
              <div className="rounded-lg bg-indigo-50/50 p-3 dark:bg-indigo-950/20">
                <Textarea
                  autoFocus
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  placeholder={t("capsule.memory.createPlaceholder")}
                  className="text-[13px]"
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
              <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
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
            <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
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
                        <motion.div
                          key="edit"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Textarea
                            autoFocus
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="text-[13px]"
                            wrapperClassName="ring-indigo-200 dark:ring-indigo-900/50"
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
                        <motion.div
                          key="view"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <p className="text-[13px] text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
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
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export default function MemoryPanel() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

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
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {t("app.activityBar.memory")}
          </h2>

          {/* Tabs */}
          <div className="mt-2.5 flex gap-1 rounded-lg bg-neutral-100/80 p-0.5 dark:bg-white/[0.06]">
            {(["profile", "memories"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  activeTab === tab
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                {t(
                  tab === "profile"
                    ? "capsule.memory.tabProfile"
                    : "capsule.memory.tabMemories",
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {activeTab === "profile" ? (
            <CoreMemoryTab />
          ) : (
            <EpisodicMemoriesTab />
          )}
        </div>
      </div>
    </div>
  );
}
