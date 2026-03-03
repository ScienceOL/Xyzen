import { CreateSkillModal } from "@/components/layouts/components/ChatToolbar/CreateSkillModal";
import { SkillResourcePanel } from "@/components/skills/SkillResourcePanel";
import { skillService } from "@/service/skillService";
import { useXyzen } from "@/store";
import type { SkillRead } from "@/types/skills";
import {
  ArrowPathIcon,
  ArrowUpOnSquareIcon,
  BarsArrowDownIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  DOCK_HORIZONTAL_MARGIN,
  DOCK_SAFE_AREA,
} from "@/components/layouts/BottomDock";
import { MOBILE_BREAKPOINT } from "@/configs/common";

const PublishSkillModal = lazy(
  () => import("@/components/features/PublishSkillModal"),
);

type SortMode = "name" | "date";

function sortSkills(skills: SkillRead[], mode: SortMode = "name"): SkillRead[] {
  return [...skills].sort((a, b) => {
    if (mode === "date") {
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    return a.name.localeCompare(b.name);
  });
}

export default function SkillsLibrary() {
  const { t } = useTranslation();
  const activeAgentId = useXyzen((state) => {
    const activeChannelId = state.activeChatChannel;
    if (!activeChannelId) return null;
    return state.channels[activeChannelId]?.agentId ?? null;
  });

  const [skills, setSkills] = useState<SkillRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [publishSkillId, setPublishSkillId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");

  const builtinSkills = useMemo(
    () =>
      sortSkills(
        skills.filter((s) => s.scope === "builtin"),
        sortMode,
      ),
    [skills, sortMode],
  );
  const userSkills = useMemo(
    () =>
      sortSkills(
        skills.filter((s) => s.scope === "user"),
        sortMode,
      ),
    [skills, sortMode],
  );

  const filteredBuiltinSkills = useMemo(() => {
    if (!searchQuery.trim()) return builtinSkills;
    const q = searchQuery.toLowerCase();
    return builtinSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q),
    );
  }, [builtinSkills, searchQuery]);

  const filteredUserSkills = useMemo(() => {
    if (!searchQuery.trim()) return userSkills;
    const q = searchQuery.toLowerCase();
    return userSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q),
    );
  }, [userSkills, searchQuery]);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) ?? null,
    [skills, selectedSkillId],
  );

  const loadSkills = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const listed = await skillService.listSkills();
      setSkills(listed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load skills";
      setError(msg);
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleDeleteSkill = useCallback(
    async (skillId: string) => {
      try {
        await skillService.deleteSkill(skillId);
        if (selectedSkillId === skillId) {
          setSelectedSkillId(null);
        }
        setDeleteConfirm(null);
        await loadSkills();
      } catch (err) {
        console.error("Failed to delete skill", err);
      }
    },
    [selectedSkillId, loadSkills],
  );

  const isDesktop =
    typeof window !== "undefined" && window.innerWidth >= MOBILE_BREAKPOINT;

  // ── Mobile: two-level navigation ──────────────────────────────────
  // Level 1: skill list (full width)
  // Level 2: skill detail (full width, with back button)
  if (!isDesktop) {
    // Mobile detail view
    if (selectedSkill) {
      return (
        <div className="flex h-full w-full flex-col bg-white dark:bg-neutral-950">
          {/* Back header */}
          <div className="shrink-0 flex items-center gap-2 border-b border-neutral-200/40 dark:border-neutral-800/40 px-3 py-2.5">
            <button
              onClick={() => setSelectedSkillId(null)}
              className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] font-medium text-indigo-600 dark:text-indigo-400 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              {t("app.skillsPanel.title", "Skills")}
            </button>
            <span className="flex-1 truncate text-right text-[13px] font-semibold text-neutral-900 dark:text-white">
              {selectedSkill.name}
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <SkillResourcePanel
              skill={selectedSkill}
              readonly={selectedSkill.scope === "builtin"}
            />
          </div>

          {publishSkillId && (
            <Suspense>
              <PublishSkillModal
                open={!!publishSkillId}
                onOpenChange={(open) => {
                  if (!open) setPublishSkillId(null);
                }}
                skillId={publishSkillId}
                skillName={
                  skills.find((s) => s.id === publishSkillId)?.name ?? ""
                }
              />
            </Suspense>
          )}
        </div>
      );
    }

    // Mobile list view
    return (
      <div className="flex h-full w-full flex-col bg-white dark:bg-neutral-950">
        {/* Header */}
        <div className="shrink-0 border-b border-neutral-200/40 px-4 py-3 dark:border-neutral-800/40">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {t("app.skillsPanel.title", "Skills")}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => void loadSkills()}
                disabled={isLoading}
                className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
              >
                <ArrowPathIcon
                  className={cn("h-4 w-4", isLoading && "animate-spin")}
                />
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="shrink-0 px-3 pt-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("app.skillsPanel.search", "Search skills...")}
                className="block w-full rounded-lg bg-neutral-100/80 py-2 pl-8 pr-8 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 dark:bg-white/[0.06] dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() =>
                setSortMode((m) => (m === "name" ? "date" : "name"))
              }
              title={
                sortMode === "name"
                  ? t("app.skillsPanel.sortByName")
                  : t("app.skillsPanel.sortByDate")
              }
              className="shrink-0 rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
            >
              {sortMode === "name" ? (
                <BarsArrowDownIcon className="h-4 w-4" />
              ) : (
                <CalendarIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Skill list */}
        <div className="custom-scrollbar flex-1 overflow-y-auto px-3 py-2">
          {error && (
            <div className="mb-2 rounded-lg bg-red-50/80 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="px-2 py-4 text-center text-xs text-neutral-400">
              {t("app.skillsPanel.loading", "Loading skills...")}
            </div>
          ) : (
            <>
              {filteredBuiltinSkills.length > 0 && (
                <div className="mb-1.5">
                  <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {t("app.skillsPanel.builtinFolder", "builtin")}
                  </div>
                  <div className="space-y-1">
                    {filteredBuiltinSkills.map((skill) => (
                      <SkillListItem
                        key={skill.id}
                        skill={skill}
                        isSelected={false}
                        showChevron
                        onClick={() => setSelectedSkillId(skill.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                {filteredUserSkills.length > 0 && (
                  <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {t("app.skillsPanel.userFolder", "my-skills")}
                  </div>
                )}
                {!searchQuery && userSkills.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-neutral-400">
                    {t(
                      "app.skillsPanel.emptyUser",
                      "No user skills created yet.",
                    )}
                  </div>
                ) : filteredUserSkills.length === 0 &&
                  filteredBuiltinSkills.length === 0 ? (
                  <div className="px-2 py-6 text-center text-xs text-neutral-400">
                    {t("app.skillsPanel.noResults", "No skills found.")}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredUserSkills.map((skill) => (
                      <SkillListItem
                        key={skill.id}
                        skill={skill}
                        isSelected={false}
                        showChevron
                        onClick={() => setSelectedSkillId(skill.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <CreateSkillModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          agentId={activeAgentId}
          onCreated={async () => {
            await loadSkills();
          }}
        />
      </div>
    );
  }

  // ── Desktop: side-by-side layout ──────────────────────────────────
  return (
    <div
      className="flex h-full w-full bg-white dark:bg-neutral-950"
      style={{
        paddingTop: 16,
        paddingBottom: DOCK_SAFE_AREA,
        paddingLeft: DOCK_HORIZONTAL_MARGIN,
        paddingRight: DOCK_HORIZONTAL_MARGIN,
      }}
    >
      {/* Left sidebar: skill list */}
      <div className="flex w-64 shrink-0 flex-col rounded-l-2xl border border-r-0 border-neutral-200/40 dark:border-neutral-700/50 bg-neutral-50/50 dark:bg-neutral-900/30">
        {/* Header */}
        <div className="shrink-0 border-b border-neutral-200/40 px-4 py-3 dark:border-neutral-800/40">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-neutral-900 dark:text-white">
              {t("app.skillsPanel.title", "Skills")}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => void loadSkills()}
                disabled={isLoading}
                className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
              >
                <ArrowPathIcon
                  className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
                />
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="shrink-0 px-2.5 pt-2.5">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("app.skillsPanel.search", "Search skills...")}
                className="block w-full rounded-lg bg-neutral-100/80 py-1.5 pl-8 pr-8 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 dark:bg-white/[0.06] dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() =>
                setSortMode((m) => (m === "name" ? "date" : "name"))
              }
              title={
                sortMode === "name"
                  ? t("app.skillsPanel.sortByName")
                  : t("app.skillsPanel.sortByDate")
              }
              className={cn(
                "shrink-0 rounded-lg p-1.5 transition-colors",
                "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300",
              )}
            >
              {sortMode === "name" ? (
                <BarsArrowDownIcon className="h-3.5 w-3.5" />
              ) : (
                <CalendarIcon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Skill list */}
        <div className="custom-scrollbar flex-1 overflow-y-auto px-2.5 py-2">
          {error && (
            <div className="mb-2 rounded-lg bg-red-50/80 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="px-2 py-4 text-center text-xs text-neutral-400">
              {t("app.skillsPanel.loading", "Loading skills...")}
            </div>
          ) : (
            <>
              {/* Builtin skills */}
              {filteredBuiltinSkills.length > 0 && (
                <div className="mb-1.5">
                  <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {t("app.skillsPanel.builtinFolder", "builtin")}
                  </div>
                  <div className="space-y-1">
                    {filteredBuiltinSkills.map((skill) => (
                      <SkillListItem
                        key={skill.id}
                        skill={skill}
                        isSelected={selectedSkillId === skill.id}
                        onClick={() => setSelectedSkillId(skill.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* User skills */}
              <div>
                {filteredUserSkills.length > 0 && (
                  <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {t("app.skillsPanel.userFolder", "my-skills")}
                  </div>
                )}
                {!searchQuery && userSkills.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-neutral-400">
                    {t(
                      "app.skillsPanel.emptyUser",
                      "No user skills created yet.",
                    )}
                  </div>
                ) : filteredUserSkills.length === 0 &&
                  filteredBuiltinSkills.length === 0 ? (
                  <div className="px-2 py-6 text-center text-xs text-neutral-400">
                    {t("app.skillsPanel.noResults", "No skills found.")}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredUserSkills.map((skill) => (
                      <SkillListItem
                        key={skill.id}
                        skill={skill}
                        isSelected={selectedSkillId === skill.id}
                        onClick={() => setSelectedSkillId(skill.id)}
                        deleteConfirm={deleteConfirm === skill.id}
                        onPublish={() => setPublishSkillId(skill.id)}
                        onDeleteRequest={() => setDeleteConfirm(skill.id)}
                        onDeleteConfirm={() => void handleDeleteSkill(skill.id)}
                        onDeleteCancel={() => setDeleteConfirm(null)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right panel: skill resource browser */}
      <div className="flex flex-1 flex-col min-w-0 rounded-r-2xl border border-neutral-200/40 dark:border-neutral-700/50 bg-white dark:bg-neutral-950 overflow-hidden">
        {selectedSkill ? (
          <SkillResourcePanel
            skill={selectedSkill}
            readonly={selectedSkill.scope === "builtin"}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <SparklesIcon className="mx-auto mb-3 h-8 w-8 text-neutral-300 dark:text-neutral-600" />
              <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
                {t(
                  "app.skillsPanel.selectSkill",
                  "Select a skill to browse its resources",
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      <CreateSkillModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        agentId={activeAgentId}
        onCreated={async () => {
          await loadSkills();
        }}
      />

      {publishSkillId && (
        <Suspense>
          <PublishSkillModal
            open={!!publishSkillId}
            onOpenChange={(open) => {
              if (!open) setPublishSkillId(null);
            }}
            skillId={publishSkillId}
            skillName={skills.find((s) => s.id === publishSkillId)?.name ?? ""}
          />
        </Suspense>
      )}
    </div>
  );
}

function SkillListItem({
  skill,
  isSelected,
  showChevron,
  onClick,
  deleteConfirm,
  onPublish,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  skill: SkillRead;
  isSelected: boolean;
  showChevron?: boolean;
  onClick: () => void;
  deleteConfirm?: boolean;
  onPublish?: () => void;
  onDeleteRequest?: () => void;
  onDeleteConfirm?: () => void;
  onDeleteCancel?: () => void;
}) {
  const { t } = useTranslation();
  const isBuiltin = skill.scope === "builtin";
  const hasActions = onPublish || onDeleteRequest;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group/item relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all",
        isSelected
          ? "bg-indigo-50/80 ring-1 ring-indigo-500/20 dark:bg-indigo-500/10 dark:ring-indigo-400/20"
          : "bg-neutral-100/40 hover:bg-neutral-100/80 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]",
        showChevron && "py-3",
      )}
    >
      {/* Icon badge */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          isBuiltin
            ? "bg-fuchsia-50 dark:bg-fuchsia-500/10"
            : "bg-sky-50 dark:bg-sky-500/10",
        )}
      >
        <SparklesIcon
          className={cn(
            "h-3.5 w-3.5",
            isBuiltin ? "text-fuchsia-500" : "text-sky-500",
          )}
        />
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[13px] font-medium",
            isSelected
              ? "text-indigo-700 dark:text-indigo-400"
              : "text-neutral-800 dark:text-neutral-200",
          )}
        >
          {skill.name}
        </p>
        {skill.description && (
          <p className="mt-0.5 truncate text-[11px] text-neutral-400 dark:text-neutral-500">
            {skill.description}
          </p>
        )}
      </div>

      {showChevron && (
        <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
      )}

      {/* Delete confirm overlay */}
      {deleteConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-end gap-1.5 rounded-lg bg-red-50/95 px-2.5 dark:bg-red-950/80">
          <p className="mr-auto truncate text-[11px] font-medium text-red-600 dark:text-red-400">
            {t("common.confirm", "Confirm")}?
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteConfirm?.();
            }}
            className="rounded-lg bg-red-500 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-red-600"
          >
            {t("common.delete", "Delete")}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteCancel?.();
            }}
            className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-white dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            {t("common.cancel", "Cancel")}
          </button>
        </div>
      )}

      {/* Hover action buttons with gradient backdrop */}
      {hasActions && !deleteConfirm && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center opacity-0 transition-opacity group-hover/item:opacity-100">
          <div
            className={cn(
              "pointer-events-auto flex items-center gap-0.5 rounded-r-lg py-1 pl-6 pr-1.5",
              isSelected
                ? "bg-gradient-to-r from-indigo-50/0 via-indigo-50/90 to-indigo-50/95 dark:from-transparent dark:via-[rgba(99,102,241,0.12)] dark:to-[rgba(99,102,241,0.15)]"
                : "bg-gradient-to-r from-neutral-100/0 via-neutral-200/90 to-neutral-200/95 dark:from-transparent dark:via-neutral-800/90 dark:to-neutral-800/95",
            )}
          >
            {onPublish && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPublish();
                }}
                title={t("skillMarketplace.publishAction")}
                className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-white/80 hover:text-emerald-600 dark:text-neutral-400 dark:hover:bg-white/[0.08] dark:hover:text-emerald-400"
              >
                <ArrowUpOnSquareIcon className="h-4 w-4" />
              </button>
            )}
            {onDeleteRequest && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteRequest();
                }}
                className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-white/80 hover:text-red-600 dark:text-neutral-400 dark:hover:bg-white/[0.08] dark:hover:text-red-400"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
