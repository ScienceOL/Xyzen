import { motion } from "framer-motion";
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentExecutionState } from "@/types/agentEvents";
import AgentNodeItem from "./AgentNodeItem";
import { useEffect, useRef } from "react";

interface AgentExecutionTimelineProps {
  execution: AgentExecutionState;
  isExecuting: boolean;
}

/**
 * AgentExecutionTimeline displays agent execution as a vertical timeline of phase cards.
 * Replaces AgentExecutionBubble with a more detailed, real-time view of execution progress.
 */
export default function AgentExecutionTimeline({
  execution,
  isExecuting,
}: AgentExecutionTimelineProps) {
  const { t } = useTranslation();
  const activePhaseRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active phase during execution
  useEffect(() => {
    if (isExecuting && activePhaseRef.current) {
      activePhaseRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [execution.currentPhase, isExecuting]);

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

  // Get overall status icon
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

  // Calculate completion percentage
  const completionPercent = (() => {
    if (execution.progressPercent !== undefined) {
      return execution.progressPercent;
    }
    const completedPhases = execution.phases.filter(
      (p) => p.status === "completed" || p.status === "skipped",
    ).length;
    return execution.phases.length > 0
      ? Math.round((completedPhases / execution.phases.length) * 100)
      : 0;
  })();

  const completedCount = execution.phases.filter(
    (p) => p.status === "completed" || p.status === "skipped",
  ).length;

  return (
    <div className="space-y-3">
      {/* Overall Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg border border-neutral-200/80 bg-white/50 dark:border-neutral-700/50 dark:bg-neutral-800/30"
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          {/* Agent Icon */}
          <motion.div
            animate={
              isExecuting
                ? {
                    scale: [1, 1.1, 1],
                  }
                : {}
            }
            transition={{
              duration: 1.5,
              repeat: isExecuting ? Infinity : 0,
              ease: "easeInOut",
            }}
            className="flex items-center justify-center"
          >
            <FlaskConical className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </motion.div>

          {/* Agent Name */}
          <span className="flex-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {execution.agentName}
          </span>

          {/* Status Icon */}
          {getStatusIcon()}

          {/* Status Badge */}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass()}`}
          >
            {t(`app.chat.agent.status.${execution.status}`, {
              defaultValue:
                execution.status.charAt(0).toUpperCase() +
                execution.status.slice(1),
            })}
          </span>

          {/* Duration */}
          {execution.durationMs && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {formatDuration(execution.durationMs)}
            </span>
          )}
        </div>

        {/* Progress Bar */}
        {execution.phases.length > 0 && (
          <div className="px-3 pb-2.5">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <motion.div
                className="absolute left-0 top-0 h-full bg-linear-to-r from-blue-500 to-indigo-500 dark:from-blue-400 dark:to-indigo-400"
                initial={{ width: 0 }}
                animate={{ width: `${completionPercent}%` }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                {/* Shimmer effect for running */}
                {isExecuting && (
                  <motion.div
                    className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent"
                    animate={{
                      x: ["-100%", "100%"],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                )}
              </motion.div>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span>
                {completedCount}/{execution.phases.length} phases
              </span>
              <span>{completionPercent}%</span>
            </div>
          </div>
        )}

        {/* Current Status Message */}
        {isExecuting && (
          <div className="border-t border-neutral-200/50 px-3 py-2 dark:border-neutral-700/30">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2"
            >
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
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
        )}
      </motion.div>

      {/* Phase Timeline - Compact style matching ToolCallCard */}
      {execution.phases.length > 0 && (
        <div className="space-y-1">
          {execution.phases.map((phase, index) => {
            const isActive = phase.status === "running";
            const isFinalPhase = index === execution.phases.length - 1;

            // Show content for:
            // 1. Active phase (currently streaming)
            // 2. Any non-final phase (their content is always shown)
            // Final phase content is shown below timeline after completion
            const shouldShowContent = isActive || !isFinalPhase;

            return (
              <div key={phase.id} ref={isActive ? activePhaseRef : null}>
                <AgentNodeItem
                  nodeName={phase.name}
                  status={phase.status}
                  content={
                    shouldShowContent
                      ? phase.streamedContent || phase.outputSummary
                      : undefined
                  }
                  isActive={isActive}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Subagents */}
      {execution.subagents.length > 0 && (
        <div className="rounded-lg border border-neutral-200/80 bg-neutral-50/50 px-3 py-2 dark:border-neutral-700/50 dark:bg-neutral-800/30">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
            {t("app.chat.agent.subagents", {
              defaultValue: "Subagents",
            })}
          </div>
          {execution.subagents.map((subagent) => (
            <div
              key={subagent.id}
              className="flex items-center gap-2 py-1"
              style={{ paddingLeft: `${subagent.depth * 12}px` }}
            >
              <span className="text-neutral-300 dark:text-neutral-600">└─</span>
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

      {/* Error Display */}
      {execution.error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-red-400 bg-red-50 p-3 dark:border-red-700/50 dark:bg-red-900/20"
        >
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-red-700 dark:text-red-300">
                {execution.error.type}
              </div>
              <div className="text-sm text-red-600 dark:text-red-400 mt-1">
                {execution.error.message}
              </div>
              {execution.error.nodeId && (
                <div className="text-xs text-red-500 dark:text-red-500 mt-1">
                  Node: {execution.error.nodeId}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
