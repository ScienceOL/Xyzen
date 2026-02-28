import { CreateSkillModal } from "@/components/layouts/components/ChatToolbar/CreateSkillModal";
import { SkillResourcePanel } from "@/components/skills/SkillResourcePanel";
import { skillService } from "@/service/skillService";
import { useXyzen } from "@/store";
import type { SkillRead } from "@/types/skills";
import {
  ArrowPathIcon,
  ArrowUpOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
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

function sortSkills(skills: SkillRead[]): SkillRead[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
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

  const builtinSkills = useMemo(
    () => sortSkills(skills.filter((s) => s.scope === "builtin")),
    [skills],
  );
  const userSkills = useMemo(
    () => sortSkills(skills.filter((s) => s.scope === "user")),
    [skills],
  );

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
              {builtinSkills.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {t("app.skillsPanel.builtinFolder", "builtin")}
                  </div>
                  {builtinSkills.map((skill) => (
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

              <div>
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  {t("app.skillsPanel.userFolder", "my-skills")}
                </div>
                {userSkills.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-neutral-400">
                    {t(
                      "app.skillsPanel.emptyUser",
                      "No user skills created yet.",
                    )}
                  </div>
                ) : (
                  userSkills.map((skill) => (
                    <SkillListItem
                      key={skill.id}
                      skill={skill}
                      isSelected={false}
                      showChevron
                      onClick={() => setSelectedSkillId(skill.id)}
                    />
                  ))
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

        {/* Skill list */}
        <div className="custom-scrollbar flex-1 overflow-y-auto px-2 py-2">
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
              {builtinSkills.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {t("app.skillsPanel.builtinFolder", "builtin")}
                  </div>
                  {builtinSkills.map((skill) => (
                    <SkillListItem
                      key={skill.id}
                      skill={skill}
                      isSelected={selectedSkillId === skill.id}
                      onClick={() => setSelectedSkillId(skill.id)}
                    />
                  ))}
                </div>
              )}

              {/* User skills */}
              <div>
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  {t("app.skillsPanel.userFolder", "my-skills")}
                </div>
                {userSkills.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-neutral-400">
                    {t(
                      "app.skillsPanel.emptyUser",
                      "No user skills created yet.",
                    )}
                  </div>
                ) : (
                  userSkills.map((skill) => (
                    <div key={skill.id} className="group relative">
                      <SkillListItem
                        skill={skill}
                        isSelected={selectedSkillId === skill.id}
                        onClick={() => setSelectedSkillId(skill.id)}
                      />
                      {/* Delete button */}
                      {deleteConfirm === skill.id ? (
                        <div className="absolute right-1 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteSkill(skill.id);
                            }}
                            className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-600"
                          >
                            {t("common.confirm", "Confirm")}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(null);
                            }}
                            className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-300"
                          >
                            {t("common.cancel", "Cancel")}
                          </button>
                        </div>
                      ) : (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPublishSkillId(skill.id);
                            }}
                            title={t("skillMarketplace.publishAction")}
                            className="rounded-md p-1 text-neutral-300 hover:bg-emerald-50 hover:text-emerald-500 dark:text-neutral-600 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
                          >
                            <ArrowUpOnSquareIcon className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(skill.id);
                            }}
                            className="rounded-md p-1 text-neutral-300 hover:bg-red-50 hover:text-red-500 dark:text-neutral-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                          >
                            <TrashIcon className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
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
}: {
  skill: SkillRead;
  isSelected: boolean;
  showChevron?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
        isSelected
          ? "bg-indigo-50/80 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400"
          : "text-neutral-700 hover:bg-neutral-100/60 dark:text-neutral-300 dark:hover:bg-white/[0.04]",
        showChevron && "py-2.5",
      )}
    >
      <SparklesIcon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          skill.scope === "builtin" ? "text-fuchsia-500" : "text-sky-500",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{skill.name}</p>
        {skill.description && (
          <p className="truncate text-[10px] text-neutral-400 dark:text-neutral-500">
            {skill.description}
          </p>
        )}
      </div>
      {showChevron && (
        <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
      )}
    </button>
  );
}
