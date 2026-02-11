import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { skillService } from "@/service/skillService";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agents";
import type { SkillRead } from "@/types/skills";
import { CheckIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CreateSkillModal from "./CreateSkillModal";
import { partitionSkills, toggleSkillAttachment } from "./skillActions";

interface SkillsButtonProps {
  agent: Agent;
  onAgentRefresh: () => Promise<void>;
  buttonClassName?: string;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unknown error";
}

export function SkillsButton({
  agent,
  onAgentRefresh,
  buttonClassName,
}: SkillsButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [allSkills, setAllSkills] = useState<SkillRead[]>([]);
  const [attachedSkills, setAttachedSkills] = useState<SkillRead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingSkillId, setIsUpdatingSkillId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <Popover open={isOpen} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(buttonClassName, "w-auto px-2 gap-1.5")}
          >
            <SparklesIcon className="h-4 w-4" />
            <span className="text-xs">
              {t("app.toolbar.skills.title", "Skills")}
            </span>
            {connected.length > 0 && (
              <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                {connected.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-72 p-2" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {t("app.toolbar.skills.title", "Skills")}
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                {t("app.toolbar.skills.createAction", "Create Skill")}
              </button>
            </div>

            {error && (
              <div className="mx-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}

            {isLoading ? (
              <div className="px-2 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                {t("common.loading", "Loading...")}
              </div>
            ) : (
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
        </PopoverContent>
      </Popover>

      <CreateSkillModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        agentId={agent.id}
        onCreated={async () => {
          await Promise.all([loadSkills(), onAgentRefresh()]);
        }}
      />
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
