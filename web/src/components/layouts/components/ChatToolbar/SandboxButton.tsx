"use client";

/**
 * Sandbox Instance Selector with interactive Popover
 *
 * Header contains a Switch to toggle the sandbox tool on/off.
 * When enabled, users can select a specific execution target:
 * - Auto (null): system decides — runner-first if online, else cloud
 * - Runner ("runner:{id}"): use a specific registered runner
 * - Active Sandbox ("sandbox:{session_id}"): reuse sandbox from another session
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
  isSandboxEnabled,
  updateSandboxEnabled,
} from "@/core/agent/toolConfig";
import { cn } from "@/lib/utils";
import { sandboxService, type SandboxEntry } from "@/service/sandboxService";
import type { RunnerRead } from "@/service/runnerService";
import type { Agent } from "@/types/agents";
import { useXyzen } from "@/store";
import { CheckIcon, CommandLineIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface SandboxButtonProps {
  agent: Agent | null;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  sessionSandboxBackend?: string | null;
  onUpdateSessionSandboxBackend?: (backend: string | null) => Promise<void>;
  buttonClassName?: string;
}

export function SandboxButton({
  agent,
  onUpdateAgent,
  sessionSandboxBackend,
  onUpdateSessionSandboxBackend,
  buttonClassName,
}: SandboxButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [sandboxes, setSandboxes] = useState<SandboxEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { runners, fetchRunners } = useXyzen(
    useShallow((s) => ({
      runners: s.runners,
      fetchRunners: s.fetchRunners,
    })),
  );

  const sandboxEnabled = isSandboxEnabled(agent);
  const effectiveBackend = sessionSandboxBackend || null;

  // Derive display label from the current selection
  const getSelectionLabel = useCallback((): string | null => {
    if (!effectiveBackend) return null;
    if (effectiveBackend.startsWith("runner:")) {
      const runnerId = effectiveBackend.slice(7);
      const runner = runners.find((r: RunnerRead) => r.id === runnerId);
      return runner?.name || "Runner";
    }
    if (effectiveBackend.startsWith("sandbox:")) {
      const sessionId = effectiveBackend.slice(8);
      const sandbox = sandboxes.find((s) => s.session_id === sessionId);
      return sandbox?.agent_name || "Sandbox";
    }
    return null;
  }, [effectiveBackend, runners, sandboxes]);

  const selectionLabel = getSelectionLabel();

  const validatedRef = useRef<string | null>(null);
  const [sandboxesLoaded, setSandboxesLoaded] = useState(false);

  // Eagerly fetch runners + sandboxes when popover opens OR when a selection exists (for badge label + validation)
  useEffect(() => {
    if (!isOpen && !effectiveBackend) return;

    fetchRunners();
    setIsLoading(true);
    sandboxService
      .listSandboxes()
      .then((resp) => setSandboxes(resp.sandboxes))
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
        setSandboxesLoaded(true);
      });
  }, [isOpen, effectiveBackend, fetchRunners]);

  // Validate saved selection: fall back to auto if the target is no longer available
  useEffect(() => {
    if (!effectiveBackend || !onUpdateSessionSandboxBackend) return;
    // Only validate once per unique backend value
    if (validatedRef.current === effectiveBackend) return;

    if (effectiveBackend.startsWith("runner:")) {
      // Need runners loaded to validate
      if (runners.length === 0) return;
      validatedRef.current = effectiveBackend;
      const runnerId = effectiveBackend.slice(7);
      const runner = runners.find((r: RunnerRead) => r.id === runnerId);
      if (!runner || !runner.is_online) {
        console.warn(
          `[SandboxButton] Runner ${runnerId} is offline or removed, falling back to auto`,
        );
        onUpdateSessionSandboxBackend(null);
      }
    } else if (effectiveBackend.startsWith("sandbox:")) {
      // Wait until sandboxes have been fetched at least once
      if (!sandboxesLoaded) return;
      validatedRef.current = effectiveBackend;
      const sessionId = effectiveBackend.slice(8);
      const sandbox = sandboxes.find((s) => s.session_id === sessionId);
      if (!sandbox) {
        console.warn(
          `[SandboxButton] Sandbox session ${sessionId} no longer active, falling back to auto`,
        );
        onUpdateSessionSandboxBackend(null);
      }
    }
  }, [
    effectiveBackend,
    runners,
    sandboxes,
    sandboxesLoaded,
    onUpdateSessionSandboxBackend,
  ]);

  const handleSelect = async (value: string | null) => {
    if (onUpdateSessionSandboxBackend) {
      await onUpdateSessionSandboxBackend(value);
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!agent) return;
    const newGraphConfig = updateSandboxEnabled(agent, checked);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
    // When turning off, also clear the target selection
    if (!checked && onUpdateSessionSandboxBackend) {
      await onUpdateSessionSandboxBackend(null);
    }
  };

  if (!agent) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button className={cn(buttonClassName, "w-auto px-2 gap-1.5")}>
              <CommandLineIcon
                className={cn("h-4 w-4", sandboxEnabled ? "text-rose-500" : "")}
              />
              {sandboxEnabled && effectiveBackend && selectionLabel && (
                <span className="max-w-[80px] truncate rounded-full bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-900/50 dark:text-rose-400">
                  {selectionLabel}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("app.toolbar.sandbox", "Sandbox")}</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-2">
          {/* Header with switch */}
          <div className="flex items-center justify-between px-2 py-1">
            <div>
              <div className="flex items-center space-x-2">
                <CommandLineIcon className="h-4 w-4 text-rose-500" />
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {t("app.toolbar.sandbox", "Sandbox")}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {t("app.toolbar.sandboxDesc", "Execute code in sandbox")}
              </div>
            </div>
            <Switch checked={sandboxEnabled} onCheckedChange={handleToggle} />
          </div>

          {/* Target selection */}
          <div
            className={cn(
              "space-y-2 transition-opacity",
              !sandboxEnabled && "opacity-50 pointer-events-none",
            )}
          >
            {/* Auto option */}
            <div className="space-y-0.5">
              <button
                onClick={() => handleSelect(null)}
                className={cn(
                  "w-full flex items-center justify-between px-2 py-2 rounded-md text-sm transition-colors",
                  "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                  !effectiveBackend && "bg-rose-50 dark:bg-rose-900/20",
                )}
              >
                <div className="min-w-0 text-left">
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    Auto
                  </div>
                  <div className="text-xs text-neutral-400">
                    {t("app.toolbar.sandboxAutoDesc", "System auto-detect")}
                  </div>
                </div>
                {!effectiveBackend && (
                  <CheckIcon className="h-4 w-4 flex-shrink-0 text-rose-500" />
                )}
              </button>
            </div>

            {/* Runners section */}
            {runners.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-2 pt-1 text-xs font-medium text-neutral-400">
                  {t("app.toolbar.runners", "Runners")}
                </div>
                {runners.map((runner: RunnerRead) => {
                  const value = `runner:${runner.id}`;
                  const isSelected = effectiveBackend === value;
                  return (
                    <button
                      key={runner.id}
                      onClick={() => handleSelect(value)}
                      disabled={!runner.is_online}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-2 rounded-md text-sm transition-colors",
                        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                        isSelected && "bg-rose-50 dark:bg-rose-900/20",
                        !runner.is_online && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "h-2 w-2 rounded-full flex-shrink-0",
                            runner.is_online
                              ? "bg-green-500"
                              : "bg-neutral-400",
                          )}
                        />
                        <div className="min-w-0 text-left">
                          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {runner.name}
                          </div>
                          {runner.os_info && (
                            <div className="text-xs text-neutral-400 truncate">
                              {runner.os_info}
                            </div>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <CheckIcon className="h-4 w-4 flex-shrink-0 text-rose-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Active Sandboxes section */}
            {isLoading ? (
              <div className="px-2 py-3 text-center text-xs text-neutral-400">
                {t("common.loading", "Loading...")}
              </div>
            ) : (
              sandboxes.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 pt-1 text-xs font-medium text-neutral-400">
                    {t("app.toolbar.activeSandboxes", "Active Sandboxes")}
                  </div>
                  {sandboxes.map((sandbox) => {
                    const value = `sandbox:${sandbox.session_id}`;
                    const isSelected = effectiveBackend === value;
                    return (
                      <button
                        key={sandbox.sandbox_id}
                        onClick={() => handleSelect(value)}
                        className={cn(
                          "w-full flex items-center justify-between px-2 py-2 rounded-md text-sm transition-colors",
                          "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                          isSelected && "bg-rose-50 dark:bg-rose-900/20",
                        )}
                      >
                        <div className="min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                              {sandbox.agent_name ||
                                sandbox.session_name ||
                                sandbox.sandbox_id}
                            </span>
                            <span className="shrink-0 text-[11px] font-mono text-neutral-300 dark:text-neutral-600">
                              {sandbox.sandbox_id.slice(0, 6)}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-400 truncate">
                            {sandbox.backend}
                            {sandbox.created_at &&
                              ` · ${formatRelativeTime(sandbox.created_at)}`}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckIcon className="h-4 w-4 flex-shrink-0 text-rose-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SandboxButton;
