import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentExecutionState } from "@/types/agentEvents";
import AgentPhaseItem from "./AgentPhaseItem";
import AgentProgressBar from "./AgentProgressBar";

interface AgentExecutionBubbleProps {
  execution: AgentExecutionState;
  isExecuting: boolean;
}

/**
 * AgentExecutionBubble displays agent execution progress and history.
 *
 * Two states:
 * 1. Active execution (isExecuting=true): Animated view showing progress and current phase
 * 2. Collapsed (isExecuting=false): Expandable accordion to view execution timeline
 */
export default function AgentExecutionBubble({
  execution,
  isExecuting,
}: AgentExecutionBubbleProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Format duration in human-readable format
  const formatDuration = (ms?: number): string => {
    if (ms === undefined) return "";
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(0);
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (execution.status) {
      case "running":
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="h-4 w-4 text-blue-500" />
          </motion.div>
        );
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "cancelled":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  // Get status badge color
  const getStatusBadgeClass = () => {
    switch (execution.status) {
      case "running":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "failed":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "cancelled":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      default:
        return "bg-neutral-100 text-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-300";
    }
  };

  return (
    <div className="mb-3">
      <AnimatePresence mode="wait">
        {isExecuting ? (
          // Active execution state - animated progress view
          <motion.div
            key="execution-active"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative overflow-hidden rounded-lg border border-blue-300/50 bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-cyan-50/80 dark:border-blue-500/30 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-cyan-950/40"
          >
            {/* Subtle shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{
                x: ["-100%", "100%"],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
            />

            {/* Header with animated icon */}
            <div className="flex items-center gap-2 border-b border-blue-200/50 px-3 py-2 dark:border-blue-700/30">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="flex items-center justify-center"
              >
                <FlaskConical className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </motion.div>
              <span className="flex-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                {execution.agentName}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass()}`}
              >
                {t(`app.chat.agent.status.${execution.status}`, {
                  defaultValue:
                    execution.status.charAt(0).toUpperCase() +
                    execution.status.slice(1),
                })}
              </span>
            </div>

            {/* Progress bar */}
            <div className="px-3 py-2">
              <AgentProgressBar
                percent={execution.progressPercent ?? 0}
                phases={execution.phases}
              />
            </div>

            {/* Current phase/progress message */}
            <div className="px-3 pb-2">
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2"
              >
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                <span className="text-xs text-blue-900/80 dark:text-blue-100/80">
                  {execution.progressMessage ||
                    execution.currentNode ||
                    execution.currentPhase ||
                    t("app.chat.agent.initializing", {
                      defaultValue: "Initializing...",
                    })}
                </span>
              </motion.div>

              {/* Iteration indicator */}
              {execution.iteration && (
                <div className="mt-1 text-xs text-blue-600/70 dark:text-blue-300/70">
                  {t("app.chat.agent.iteration", {
                    current: execution.iteration.current,
                    max: execution.iteration.max,
                    defaultValue: `Iteration ${execution.iteration.current}/${execution.iteration.max}`,
                  })}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          // Collapsed state - expandable accordion
          <motion.div
            key="execution-collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-lg border border-neutral-200/80 bg-neutral-50/50 dark:border-neutral-700/50 dark:bg-neutral-800/30"
          >
            {/* Collapsible header */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-100/50 dark:hover:bg-neutral-700/30"
            >
              <FlaskConical className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
              <span className="flex-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                {execution.agentName}
              </span>
              {getStatusIcon()}
              {execution.durationMs && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  {formatDuration(execution.durationMs)}
                </span>
              )}
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
                )}
              </motion.div>
            </button>

            {/* Expanded content - Phase timeline */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-neutral-200/50 px-3 py-2 dark:border-neutral-700/30">
                    {/* Phase list */}
                    <div className="space-y-1">
                      {execution.phases.map((phase) => (
                        <AgentPhaseItem
                          key={phase.id}
                          phase={phase}
                          formatDuration={formatDuration}
                        />
                      ))}
                    </div>

                    {/* Subagent executions */}
                    {execution.subagents.length > 0 && (
                      <div className="mt-2 border-t border-neutral-200/30 pt-2 dark:border-neutral-700/20">
                        <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          {t("app.chat.agent.subagents", {
                            defaultValue: "Subagents",
                          })}
                        </div>
                        {execution.subagents.map((subagent) => (
                          <div
                            key={subagent.id}
                            className="flex items-center gap-2 py-0.5"
                            style={{ paddingLeft: `${subagent.depth * 12}px` }}
                          >
                            <span className="text-neutral-300 dark:text-neutral-600">
                              └─
                            </span>
                            {subagent.status === "running" ? (
                              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                            ) : subagent.status === "completed" ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-500" />
                            )}
                            <span className="text-xs text-neutral-600 dark:text-neutral-400">
                              {subagent.name}
                            </span>
                            {subagent.durationMs && (
                              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                                {formatDuration(subagent.durationMs)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Error display */}
                    {execution.error && (
                      <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-900/20">
                        <div className="text-xs font-medium text-red-700 dark:text-red-300">
                          {execution.error.type}
                        </div>
                        <div className="text-xs text-red-600 dark:text-red-400">
                          {execution.error.message}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
