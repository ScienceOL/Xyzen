"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  isImageEnabled,
  isKnowledgeEnabled,
  isWebSearchEnabled,
  updateImageEnabled,
  updateKnowledgeEnabled,
  updateWebSearchEnabled,
} from "@/core/agent/toolConfig";
import { cn } from "@/lib/utils";
import {
  knowledgeSetService,
  type KnowledgeSetWithFileCount,
} from "@/service/knowledgeSetService";
import type { Agent } from "@/types/agents";
import {
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeAltIcon,
  PhotoIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface ToolSelectorProps {
  agent: Agent | null;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  hasKnowledgeSet: boolean;
  sessionKnowledgeSetId?: string | null;
  onUpdateSessionKnowledge?: (knowledgeSetId: string | null) => Promise<void>;
  className?: string;
}

export function ToolSelector({
  agent,
  onUpdateAgent,
  hasKnowledgeSet: _hasKnowledgeSet,
  sessionKnowledgeSetId,
  onUpdateSessionKnowledge,
  className,
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

  // Effective knowledge set is session override or agent default
  const effectiveKnowledgeSetId =
    sessionKnowledgeSetId || agent?.knowledge_set_id;

  const enabledCount = [
    webSearchEnabled,
    effectiveKnowledgeSetId && knowledgeEnabled,
    imageEnabled,
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
  };

  const handleToggleImage = async () => {
    if (!agent) return;
    const newGraphConfig = updateImageEnabled(agent, !imageEnabled);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
  };

  if (!agent) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 px-2 gap-1.5", className)}
        >
          <WrenchScrewdriverIcon className="h-4 w-4" />
          <span className="text-xs">
            {t("app.toolbar.tools", "Tools")}{" "}
            {enabledCount > 0 && `(${enabledCount})`}
          </span>
        </Button>
      </PopoverTrigger>
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
