"use client";

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
  isImageEnabled,
  isKnowledgeEnabled,
  isLiteratureSearchEnabled,
  isMemoryEnabled,
  isSandboxEnabled,
  isWebSearchEnabled,
  updateImageEnabled,
  updateKnowledgeEnabled,
  updateLiteratureSearchEnabled,
  updateMemoryEnabled,
  updateSandboxEnabled,
  updateWebSearchEnabled,
} from "@/core/agent/toolConfig";
import { cn } from "@/lib/utils";
import {
  knowledgeSetService,
  type KnowledgeSetWithFileCount,
} from "@/service/knowledgeSetService";
import type { Agent } from "@/types/agents";
import {
  AcademicCapIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  CommandLineIcon,
  GlobeAltIcon,
  LightBulbIcon,
  LockClosedIcon,
  PhotoIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// Subscription plan order for comparison
const PLAN_ORDER = ["free", "standard", "professional", "ultra"] as const;
type PlanName = (typeof PLAN_ORDER)[number];

// Minimum plan required for each tool. "free" = available to all.
const TOOL_REQUIRED_PLAN: Record<string, PlanName> = {
  webSearch: "free",
  knowledge: "free",
  image: "free",
  literatureSearch: "free",
  memory: "free",
  sandbox: "standard",
};

function isToolLocked(toolKey: string, userPlan: string): boolean {
  const requiredPlan = TOOL_REQUIRED_PLAN[toolKey];
  if (!requiredPlan) return false;
  const userIndex = PLAN_ORDER.indexOf(userPlan as PlanName);
  const requiredIndex = PLAN_ORDER.indexOf(requiredPlan);
  // Unknown plans are treated as free (index -1)
  return (userIndex === -1 ? 0 : userIndex) < requiredIndex;
}

function getRequiredPlanLabel(toolKey: string): string | null {
  const plan = TOOL_REQUIRED_PLAN[toolKey];
  if (!plan || plan === "free") return null;
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

interface ToolSelectorProps {
  agent: Agent | null;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  hasKnowledgeSet: boolean;
  sessionKnowledgeSetId?: string | null;
  onUpdateSessionKnowledge?: (knowledgeSetId: string | null) => Promise<void>;
  className?: string;
  buttonClassName?: string;
  userPlan?: string;
}

export function ToolSelector({
  agent,
  onUpdateAgent,
  hasKnowledgeSet: _hasKnowledgeSet,
  sessionKnowledgeSetId,
  onUpdateSessionKnowledge,
  className,
  buttonClassName,
  userPlan = "free",
}: ToolSelectorProps) {
  const { t } = useTranslation();
  const [knowledgeSets, setKnowledgeSets] = useState<
    KnowledgeSetWithFileCount[]
  >([]);
  const [isLoadingKnowledgeSets, setIsLoadingKnowledgeSets] = useState(false);
  const [showKnowledgePicker, setShowKnowledgePicker] = useState(false);

  const webSearchEnabled = isWebSearchEnabled(agent);
  const knowledgeEnabled = isKnowledgeEnabled(agent);
  const imageEnabled = isImageEnabled(agent);
  const literatureSearchEnabled = isLiteratureSearchEnabled(agent);
  const memoryEnabled = isMemoryEnabled(agent);
  const sandboxEnabled = isSandboxEnabled(agent);

  const sandboxLocked = useMemo(
    () => isToolLocked("sandbox", userPlan),
    [userPlan],
  );

  // Effective knowledge set is session override or agent default
  const effectiveKnowledgeSetId =
    sessionKnowledgeSetId || agent?.knowledge_set_id;

  const enabledCount = [
    webSearchEnabled,
    effectiveKnowledgeSetId && knowledgeEnabled,
    imageEnabled,
    literatureSearchEnabled,
    memoryEnabled,
    sandboxEnabled,
  ].filter(Boolean).length;

  // Load knowledge sets when picker is opened
  useEffect(() => {
    if (showKnowledgePicker && knowledgeSets.length === 0) {
      setIsLoadingKnowledgeSets(true);
      knowledgeSetService
        .listKnowledgeSets()
        .then(setKnowledgeSets)
        .catch(console.error)
        .finally(() => setIsLoadingKnowledgeSets(false));
    }
  }, [showKnowledgePicker, knowledgeSets.length]);

  const handleSelectKnowledgeSet = async (knowledgeSetId: string | null) => {
    if (onUpdateSessionKnowledge) {
      await onUpdateSessionKnowledge(knowledgeSetId);
    }
    // Auto-enable knowledge tools when selecting a knowledge set
    if (knowledgeSetId && agent && !knowledgeEnabled) {
      const newGraphConfig = updateKnowledgeEnabled(agent, true);
      await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
    }
    setShowKnowledgePicker(false);
  };

  // Get current knowledge set name for display
  const currentKnowledgeSetName = effectiveKnowledgeSetId
    ? knowledgeSets.find((ks) => ks.id === effectiveKnowledgeSetId)?.name
    : null;

  const handleToggleWebSearch = async () => {
    if (!agent) return;
    const newGraphConfig = updateWebSearchEnabled(agent, !webSearchEnabled);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
  };

  const handleToggleKnowledge = async () => {
    if (!agent) return;
    const newGraphConfig = updateKnowledgeEnabled(agent, !knowledgeEnabled);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
    // When disabling knowledge, also clear the session's knowledge set
    // so the Capsule panel auto-closes
    if (knowledgeEnabled && onUpdateSessionKnowledge) {
      await onUpdateSessionKnowledge(null);
    }
  };

  const handleToggleImage = async () => {
    if (!agent) return;
    const newGraphConfig = updateImageEnabled(agent, !imageEnabled);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
  };

  const handleToggleLiteratureSearch = async () => {
    if (!agent) return;
    const newGraphConfig = updateLiteratureSearchEnabled(
      agent,
      !literatureSearchEnabled,
    );
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
  };

  const handleToggleMemory = async () => {
    if (!agent) return;
    const newGraphConfig = updateMemoryEnabled(agent, !memoryEnabled);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
  };

  const handleToggleSandbox = async () => {
    if (!agent) return;
    const newGraphConfig = updateSandboxEnabled(agent, !sandboxEnabled);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
  };

  if (!agent) return null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              className={cn(buttonClassName, "w-auto px-2 gap-1.5", className)}
            >
              <WrenchScrewdriverIcon className="h-4 w-4" />
              {enabledCount > 0 && (
                <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                  {enabledCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("app.toolbar.tools", "Tools")}</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 px-2 py-1">
            {t("app.toolbar.builtinTools", "Builtin Tools")}
          </h4>

          {/* Web Search */}
          <button
            onClick={handleToggleWebSearch}
            className={cn(
              "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
              webSearchEnabled && "bg-blue-50 dark:bg-blue-900/20",
            )}
          >
            <div className="flex items-center gap-2">
              <GlobeAltIcon
                className={cn(
                  "h-4 w-4",
                  webSearchEnabled ? "text-blue-500" : "text-neutral-400",
                )}
              />
              <div className="text-left">
                <div className="text-sm font-medium">
                  {t("app.toolbar.webSearch", "Web Search")}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("app.toolbar.webSearchDesc", "Search the web")}
                </div>
              </div>
            </div>
            {webSearchEnabled && (
              <CheckIcon className="h-4 w-4 text-blue-500" />
            )}
          </button>

          {/* Knowledge Base - shows picker for selecting knowledge set */}
          <div className="space-y-1">
            <button
              onClick={() => {
                if (effectiveKnowledgeSetId) {
                  handleToggleKnowledge();
                } else {
                  setShowKnowledgePicker(!showKnowledgePicker);
                }
              }}
              className={cn(
                "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
                "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                effectiveKnowledgeSetId &&
                  knowledgeEnabled &&
                  "bg-purple-50 dark:bg-purple-900/20",
              )}
            >
              <div className="flex items-center gap-2">
                <BookOpenIcon
                  className={cn(
                    "h-4 w-4",
                    effectiveKnowledgeSetId && knowledgeEnabled
                      ? "text-purple-500"
                      : "text-neutral-400",
                  )}
                />
                <div className="text-left">
                  <div className="text-sm font-medium">
                    {t("app.toolbar.knowledge", "Knowledge")}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {effectiveKnowledgeSetId
                      ? currentKnowledgeSetName ||
                        t(
                          "app.toolbar.knowledgeSelected",
                          "Knowledge base selected",
                        )
                      : t(
                          "app.toolbar.selectKnowledge",
                          "Select knowledge base",
                        )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {effectiveKnowledgeSetId && knowledgeEnabled && (
                  <CheckIcon className="h-4 w-4 text-purple-500" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowKnowledgePicker(!showKnowledgePicker);
                  }}
                  className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
                >
                  <ChevronDownIcon
                    className={cn(
                      "h-3 w-3 text-neutral-400 transition-transform",
                      showKnowledgePicker && "rotate-180",
                    )}
                  />
                </button>
              </div>
            </button>

            {/* Knowledge Set Picker Dropdown */}
            {showKnowledgePicker && (
              <div className="ml-6 space-y-1 border-l-2 border-purple-200 dark:border-purple-800 pl-2">
                {isLoadingKnowledgeSets ? (
                  <div className="px-2 py-2 text-xs text-neutral-400">
                    {t("common.loading", "Loading...")}
                  </div>
                ) : knowledgeSets.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-neutral-400">
                    {t(
                      "app.toolbar.noKnowledgeSets",
                      "No knowledge bases available",
                    )}
                  </div>
                ) : (
                  <>
                    {/* None option */}
                    <button
                      onClick={() => handleSelectKnowledgeSet(null)}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                        !effectiveKnowledgeSetId &&
                          "bg-purple-50 dark:bg-purple-900/20",
                      )}
                    >
                      <span>{t("app.toolbar.noKnowledge", "None")}</span>
                      {!effectiveKnowledgeSetId && (
                        <CheckIcon className="h-3 w-3 text-purple-500" />
                      )}
                    </button>
                    {/* Knowledge set options */}
                    {knowledgeSets.map((ks) => (
                      <button
                        key={ks.id}
                        onClick={() => handleSelectKnowledgeSet(ks.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                          "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                          effectiveKnowledgeSetId === ks.id &&
                            "bg-purple-50 dark:bg-purple-900/20",
                        )}
                      >
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{ks.name}</span>
                          <span className="text-neutral-400">
                            {ks.file_count} {t("common.files", "files")}
                          </span>
                        </div>
                        {effectiveKnowledgeSetId === ks.id && (
                          <CheckIcon className="h-3 w-3 text-purple-500" />
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Image Generation */}
          <button
            onClick={handleToggleImage}
            className={cn(
              "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
              imageEnabled && "bg-green-50 dark:bg-green-900/20",
            )}
          >
            <div className="flex items-center gap-2">
              <PhotoIcon
                className={cn(
                  "h-4 w-4",
                  imageEnabled ? "text-green-500" : "text-neutral-400",
                )}
              />
              <div className="text-left">
                <div className="text-sm font-medium">
                  {t("app.toolbar.image", "Image")}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("app.toolbar.imageDesc", "Generate and read images")}
                </div>
              </div>
            </div>
            {imageEnabled && <CheckIcon className="h-4 w-4 text-green-500" />}
          </button>

          {/* Literature Search */}
          <button
            onClick={handleToggleLiteratureSearch}
            className={cn(
              "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
              literatureSearchEnabled && "bg-amber-50 dark:bg-amber-900/20",
            )}
          >
            <div className="flex items-center gap-2">
              <AcademicCapIcon
                className={cn(
                  "h-4 w-4",
                  literatureSearchEnabled
                    ? "text-amber-500"
                    : "text-neutral-400",
                )}
              />
              <div className="text-left">
                <div className="text-sm font-medium">
                  {t("app.toolbar.literatureSearch", "Literature Search")}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t(
                    "app.toolbar.literatureSearchDesc",
                    "Search academic papers",
                  )}
                </div>
              </div>
            </div>
            {literatureSearchEnabled && (
              <CheckIcon className="h-4 w-4 text-amber-500" />
            )}
          </button>

          {/* Memory */}
          <button
            onClick={handleToggleMemory}
            className={cn(
              "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
              memoryEnabled && "bg-teal-50 dark:bg-teal-900/20",
            )}
          >
            <div className="flex items-center gap-2">
              <LightBulbIcon
                className={cn(
                  "h-4 w-4",
                  memoryEnabled ? "text-teal-500" : "text-neutral-400",
                )}
              />
              <div className="text-left">
                <div className="text-sm font-medium">
                  {t("app.toolbar.memory", "Memory")}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("app.toolbar.memoryDesc", "Remember across conversations")}
                </div>
              </div>
            </div>
            {memoryEnabled && <CheckIcon className="h-4 w-4 text-teal-500" />}
          </button>

          {/* Sandbox (Code Execution) */}
          <button
            onClick={sandboxLocked ? undefined : handleToggleSandbox}
            className={cn(
              "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
              sandboxLocked
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-800",
              !sandboxLocked &&
                sandboxEnabled &&
                "bg-rose-50 dark:bg-rose-900/20",
            )}
          >
            <div className="flex items-center gap-2">
              <CommandLineIcon
                className={cn(
                  "h-4 w-4",
                  !sandboxLocked && sandboxEnabled
                    ? "text-rose-500"
                    : "text-neutral-400",
                )}
              />
              <div className="text-left">
                <div className="text-sm font-medium">
                  {t("app.toolbar.sandbox", "Sandbox")}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("app.toolbar.sandboxDesc", "Execute code in sandbox")}
                </div>
              </div>
            </div>
            {sandboxLocked ? (
              <div className="flex items-center gap-1 text-neutral-400">
                <LockClosedIcon className="h-3.5 w-3.5" />
                <span className="text-[10px]">
                  {getRequiredPlanLabel("sandbox")}
                </span>
              </div>
            ) : (
              sandboxEnabled && <CheckIcon className="h-4 w-4 text-rose-500" />
            )}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
