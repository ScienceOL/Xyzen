"use client";

/**
 * Knowledge Base Button with interactive Popover
 *
 * Allows users to select a knowledge base for the current session.
 * Header contains a Switch to toggle knowledge on/off.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import { Switch } from "@/components/animate-ui/components/radix/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  isKnowledgeEnabled,
  updateKnowledgeEnabled,
} from "@/core/agent/toolConfig";
import { cn } from "@/lib/utils";
import {
  knowledgeSetService,
  type KnowledgeSetWithFileCount,
} from "@/service/knowledgeSetService";
import type { Agent } from "@/types/agents";
import { BookOpenIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface KnowledgeButtonProps {
  agent: Agent | null;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  sessionKnowledgeSetId?: string | null;
  onUpdateSessionKnowledge?: (knowledgeSetId: string | null) => Promise<void>;
  buttonClassName?: string;
}

export function KnowledgeButton({
  agent,
  onUpdateAgent,
  sessionKnowledgeSetId,
  onUpdateSessionKnowledge,
  buttonClassName,
}: KnowledgeButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [knowledgeSets, setKnowledgeSets] = useState<
    KnowledgeSetWithFileCount[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const knowledgeEnabled = isKnowledgeEnabled(agent);
  const effectiveKnowledgeSetId =
    sessionKnowledgeSetId || agent?.knowledge_set_id;

  const isOn = knowledgeEnabled && !!effectiveKnowledgeSetId;

  const currentKnowledgeSetName = effectiveKnowledgeSetId
    ? knowledgeSets.find((ks) => ks.id === effectiveKnowledgeSetId)?.name
    : null;

  // Load knowledge sets when popover opens or when a set is active (for badge name)
  useEffect(() => {
    if ((isOpen || effectiveKnowledgeSetId) && knowledgeSets.length === 0) {
      setIsLoading(true);
      knowledgeSetService
        .listKnowledgeSets()
        .then(setKnowledgeSets)
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, effectiveKnowledgeSetId, knowledgeSets.length]);

  const handleSelect = async (knowledgeSetId: string | null) => {
    if (onUpdateSessionKnowledge) {
      await onUpdateSessionKnowledge(knowledgeSetId);
    }
    // Auto-enable knowledge tools when selecting a knowledge set
    if (knowledgeSetId && agent && !knowledgeEnabled) {
      const newGraphConfig = updateKnowledgeEnabled(agent, true);
      await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!agent) return;
    if (!checked) {
      // Turn off: clear knowledge set and disable tool
      if (onUpdateSessionKnowledge) {
        await onUpdateSessionKnowledge(null);
      }
      const newGraphConfig = updateKnowledgeEnabled(agent, false);
      await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
    } else {
      // Turn on: enable tool and auto-select Default KB if none selected
      const newGraphConfig = updateKnowledgeEnabled(agent, true);
      await onUpdateAgent({ ...agent, graph_config: newGraphConfig });

      if (!effectiveKnowledgeSetId && onUpdateSessionKnowledge) {
        let sets = knowledgeSets;
        if (sets.length === 0) {
          try {
            sets = await knowledgeSetService.listKnowledgeSets();
            setKnowledgeSets(sets);
          } catch {
            return;
          }
        }
        const defaultKs = sets.find((ks) => ks.name === "Default") ?? sets[0];
        if (defaultKs) {
          await onUpdateSessionKnowledge(defaultKs.id);
        }
      }
    }
  };

  if (!agent) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button className={cn(buttonClassName, "w-auto px-2 gap-1.5")}>
              <BookOpenIcon
                className={cn("h-4 w-4", isOn ? "text-purple-500" : "")}
              />
              {isOn && (
                <span className="max-w-[80px] truncate rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-600 dark:bg-purple-900/50 dark:text-purple-400">
                  {currentKnowledgeSetName ||
                    t("app.toolbar.knowledge", "Knowledge")}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("app.toolbar.knowledge", "Knowledge")}</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-2">
          {/* Header with switch */}
          <div className="flex items-center justify-between px-2 py-1">
            <div>
              <div className="flex items-center space-x-2">
                <BookOpenIcon className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {t("app.toolbar.knowledge", "Knowledge")}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {t("app.toolbar.knowledgeConnect", "Connect Knowledge Base")}
              </div>
            </div>
            <Switch checked={isOn} onCheckedChange={handleToggle} />
          </div>

          {/* Knowledge Set List */}
          <div className="space-y-0.5">
            {isLoading ? (
              <div className="px-2 py-3 text-center text-xs text-neutral-400">
                {t("common.loading", "Loading...")}
              </div>
            ) : knowledgeSets.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-neutral-400">
                {t(
                  "app.toolbar.noKnowledgeSets",
                  "No knowledge bases available",
                )}
              </div>
            ) : (
              knowledgeSets.map((ks) => (
                <button
                  key={ks.id}
                  onClick={() => handleSelect(ks.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-2 rounded-md text-sm transition-colors",
                    "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                    effectiveKnowledgeSetId === ks.id &&
                      "bg-purple-50 dark:bg-purple-900/20",
                  )}
                >
                  <div className="flex flex-col items-start min-w-0">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                      {ks.name}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {ks.file_count} {t("common.files", "files")}
                    </span>
                  </div>
                  {effectiveKnowledgeSetId === ks.id && (
                    <CheckIcon className="h-4 w-4 flex-shrink-0 text-purple-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default KnowledgeButton;
