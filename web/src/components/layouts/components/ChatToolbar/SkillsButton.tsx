import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  isSkillsAutoEnabled,
  updateSkillsAutoEnabled,
} from "@/core/agent/toolConfig";
import { skillService } from "@/service/skillService";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agents";
import type { SkillRead } from "@/types/skills";
import { CheckIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { partitionSkills, toggleSkillAttachment } from "./skillActions";

interface SkillsButtonProps {
  agent: Agent;
  onAgentRefresh: () => Promise<void>;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  buttonClassName?: string;
}

function toErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return null;
}

export function SkillsButton({
  agent,
  onAgentRefresh,
  onUpdateAgent,
  buttonClassName,
}: SkillsButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [allSkills, setAllSkills] = useState<SkillRead[]>([]);
  const [attachedSkills, setAttachedSkills] = useState<SkillRead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingSkillId, setIsUpdatingSkillId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const skillsAuto = isSkillsAutoEnabled(agent);

  const { connected, available } = useMemo(
    () => partitionSkills(allSkills, attachedSkills),
    [allSkills, attachedSkills],
  );

  const loadSkills = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [skills, agentSkills] = await Promise.all([
        skillService.listSkills(),
        skillService.listAgentSkills(agent.id),
      ]);
      setAllSkills(skills);
      setAttachedSkills(agentSkills);
    } catch (err) {
      setError(
        toErrorMessage(err) ||
          t("app.toolbar.skills.loadFailed", "Failed to load skills"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [agent.id, t]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleToggleAuto = async () => {
    setError(null);
    try {
      const newGraphConfig = updateSkillsAutoEnabled(agent, !skillsAuto);
      await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
      await onAgentRefresh();
    } catch (err) {
      setError(
        toErrorMessage(err) ||
          t(
            "app.toolbar.skills.autoToggleFailed",
            "Failed to update skills auto mode",
          ),
      );
    }
  };

  const handleToggleSkill = async (skill: SkillRead, isAttached: boolean) => {
    if (isUpdatingSkillId) return;

    setIsUpdatingSkillId(skill.id);
    setError(null);

    try {
      await toggleSkillAttachment(agent.id, skill.id, isAttached);
      await Promise.all([loadSkills(), onAgentRefresh()]);
    } catch (err) {
      setError(
        toErrorMessage(err) ||
          t(
            "app.toolbar.skills.toggleFailed",
            "Failed to update skill attachment",
          ),
      );
    } finally {
      setIsUpdatingSkillId(null);
    }
  };

  const handlePopoverOpenChange = async (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (nextOpen) {
      await loadSkills();
    }
  };

  // In auto mode, badge shows total skill count; in manual mode, shows connected count
  const badgeCount = skillsAuto ? allSkills.length : connected.length;

  return (
    <>
      <Popover open={isOpen} onOpenChange={handlePopoverOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button className={cn(buttonClassName, "w-auto px-2 gap-1.5")}>
                <SparklesIcon className="h-4 w-4" />
                {badgeCount > 0 && (
                  <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                    {badgeCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("app.toolbar.skills.title", "Skills")}</p>
          </TooltipContent>
        </Tooltip>

        <PopoverContent className="w-72 p-2" align="start">
          <div className="space-y-2">
            <div className="px-2 py-1">
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {t("app.toolbar.skills.title", "Skills")}
              </div>
            </div>

            {/* Auto toggle */}
            <button
              type="button"
              onClick={handleToggleAuto}
              className={cn(
                "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
                "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                skillsAuto && "bg-indigo-50 dark:bg-indigo-900/20",
              )}
            >
              <div className="min-w-0 text-left">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {t("app.toolbar.skills.auto", "Auto")}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t(
                    "app.toolbar.skills.autoDescription",
                    "Include all skills automatically",
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 ml-2">
                {skillsAuto && (
                  <CheckIcon className="h-4 w-4 text-indigo-500" />
                )}
              </div>
            </button>

            {error && (
              <div className="mx-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="custom-scrollbar max-h-[60vh] overflow-y-auto">
              {isLoading ? (
                <div className="px-2 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                  {t("common.loading", "Loading...")}
                </div>
              ) : skillsAuto ? (
                /* Auto mode: show all skills as read-only */
                allSkills.length > 0 ? (
                  <div>
                    <div className="space-y-0.5">
                      {allSkills.map((skill) => (
                        <div
                          key={skill.id}
                          className="w-full flex items-center justify-between px-2 py-2 rounded-md bg-indigo-50 dark:bg-indigo-900/20"
                        >
                          <div className="min-w-0 text-left">
                            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                              {skill.name}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                              {skill.description}
                            </div>
                          </div>
                          <div className="flex-shrink-0 ml-2">
                            <CheckIcon className="h-4 w-4 text-indigo-500" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-2 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                    {t(
                      "app.toolbar.skills.empty",
                      "No skills available. Create one to get started.",
                    )}
                  </div>
                )
              ) : (
                /* Manual mode: connected/available toggle */
                <>
                  {connected.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 px-2 py-1">
                        {t("app.toolbar.skills.connected", "Connected")}
                      </h4>
                      <div className="space-y-0.5">
                        {connected.map((skill) => (
                          <SkillToggleItem
                            key={skill.id}
                            skill={skill}
                            isConnected={true}
                            isUpdating={isUpdatingSkillId === skill.id}
                            onToggle={() => handleToggleSkill(skill, true)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {available.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 px-2 py-1">
                        {t("app.toolbar.skills.available", "Available")}
                      </h4>
                      <div className="space-y-0.5">
                        {available.map((skill) => (
                          <SkillToggleItem
                            key={skill.id}
                            skill={skill}
                            isConnected={false}
                            isUpdating={isUpdatingSkillId === skill.id}
                            onToggle={() => handleToggleSkill(skill, false)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {connected.length === 0 && available.length === 0 && (
                    <div className="px-2 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                      {t(
                        "app.toolbar.skills.empty",
                        "No skills available. Create one to get started.",
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

interface SkillToggleItemProps {
  skill: SkillRead;
  isConnected: boolean;
  isUpdating: boolean;
  onToggle: () => void;
}

function SkillToggleItem({
  skill,
  isConnected,
  isUpdating,
  onToggle,
}: SkillToggleItemProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isUpdating}
      className={cn(
        "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        isConnected && "bg-indigo-50 dark:bg-indigo-900/20",
        isUpdating && "opacity-60 cursor-not-allowed",
      )}
    >
      <div className="min-w-0 text-left">
        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
          {skill.name}
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
          {skill.description}
        </div>
      </div>

      <div className="flex-shrink-0 ml-2">
        {isUpdating ? (
          <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        ) : isConnected ? (
          <CheckIcon className="h-4 w-4 text-indigo-500" />
        ) : null}
      </div>
    </button>
  );
}

export default SkillsButton;
