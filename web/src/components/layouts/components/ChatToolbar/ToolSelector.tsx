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
  isLiteratureSearchEnabled,
  isMemoryEnabled,
  isSubagentEnabled,
  isVideoEnabled,
  isWebSearchEnabled,
  updateImageEnabled,
  updateLiteratureSearchEnabled,
  updateMemoryEnabled,
  updateSubagentEnabled,
  updateVideoEnabled,
  updateWebSearchEnabled,
} from "@/core/agent/toolConfig";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agents";
import {
  AcademicCapIcon,
  CheckIcon,
  FilmIcon,
  GlobeAltIcon,
  LightBulbIcon,
  PhotoIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

interface ToolSelectorProps {
  agent: Agent | null;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  className?: string;
  buttonClassName?: string;
  displayMode?: "compact" | "list";
  showTooltip?: boolean;
}

export function ToolSelector({
  agent,
  onUpdateAgent,
  className,
  buttonClassName,
  displayMode = "compact",
  showTooltip = true,
}: ToolSelectorProps) {
  const { t } = useTranslation();

  const webSearchEnabled = isWebSearchEnabled(agent);
  const imageEnabled = isImageEnabled(agent);
  const literatureSearchEnabled = isLiteratureSearchEnabled(agent);
  const memoryEnabled = isMemoryEnabled(agent);
  const subagentEnabled = isSubagentEnabled(agent);
  const videoEnabled = isVideoEnabled(agent);

  const enabledCount = [
    webSearchEnabled,
    imageEnabled,
    videoEnabled,
    literatureSearchEnabled,
    memoryEnabled,
    subagentEnabled,
  ].filter(Boolean).length;

  const handleToggleWebSearch = async () => {
    if (!agent) return;
    const newGraphConfig = updateWebSearchEnabled(agent, !webSearchEnabled);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
  };

  const handleToggleImage = async () => {
    if (!agent) return;
    const newGraphConfig = updateImageEnabled(agent, !imageEnabled);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
  };

  const handleToggleVideo = async () => {
    if (!agent) return;
    const newGraphConfig = updateVideoEnabled(agent, !videoEnabled);
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

  const handleToggleSubagent = async () => {
    if (!agent) return;
    const newGraphConfig = updateSubagentEnabled(agent, !subagentEnabled);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
  };

  if (!agent) return null;

  const triggerButton =
    displayMode === "list" ? (
      <button
        className={cn(
          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors",
          "hover:bg-neutral-100 dark:hover:bg-neutral-800",
          className,
        )}
      >
        <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          <WrenchScrewdriverIcon className="h-3.5 w-3.5" />
          <span>{t("app.toolbar.tools", "Tools")}</span>
        </div>
        {enabledCount > 0 && (
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
            {enabledCount}
          </span>
        )}
      </button>
    ) : (
      <button
        className={cn(
          buttonClassName ??
            "flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 [&>svg]:h-5 [&>svg]:w-5",
          "w-auto px-2 gap-1.5",
          className,
        )}
      >
        <WrenchScrewdriverIcon className="h-4 w-4" />
        {enabledCount > 0 && (
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
            {enabledCount}
          </span>
        )}
      </button>
    );

  return (
    <Popover>
      {showTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("app.toolbar.tools", "Tools")}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      )}
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

          {/* Video Generation */}
          <button
            onClick={handleToggleVideo}
            className={cn(
              "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
              videoEnabled && "bg-violet-50 dark:bg-violet-900/20",
            )}
          >
            <div className="flex items-center gap-2">
              <FilmIcon
                className={cn(
                  "h-4 w-4",
                  videoEnabled ? "text-violet-500" : "text-neutral-400",
                )}
              />
              <div className="text-left">
                <div className="text-sm font-medium">
                  {t("app.toolbar.video", "Video")}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("app.toolbar.videoDesc", "Generate videos")}
                </div>
              </div>
            </div>
            {videoEnabled && <CheckIcon className="h-4 w-4 text-violet-500" />}
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

          {/* Subagent */}
          <button
            onClick={handleToggleSubagent}
            className={cn(
              "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
              subagentEnabled && "bg-indigo-50 dark:bg-indigo-900/20",
            )}
          >
            <div className="flex items-center gap-2">
              <UserGroupIcon
                className={cn(
                  "h-4 w-4",
                  subagentEnabled ? "text-indigo-500" : "text-neutral-400",
                )}
              />
              <div className="text-left">
                <div className="text-sm font-medium">
                  {t("app.toolbar.subagent")}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("app.toolbar.subagentDesc")}
                </div>
              </div>
            </div>
            {subagentEnabled && (
              <CheckIcon className="h-4 w-4 text-indigo-500" />
            )}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
