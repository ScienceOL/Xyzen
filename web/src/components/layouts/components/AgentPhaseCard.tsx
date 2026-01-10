import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Pause,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PhaseExecution } from "@/types/agentEvents";
import Markdown from "@/lib/Markdown";

interface AgentPhaseCardProps {
  phase: PhaseExecution;
  isActive: boolean;
  index: number;
}

/**
 * AgentPhaseCard displays a single phase/node in the agent execution timeline.
 * Mirrors the ToolCallCard design with consistent colors, spacing, and interactions.
 *
 * States: pending, running, completed, failed, skipped
 */
export default function AgentPhaseCard({
  phase,
  isActive,
  index,
}: AgentPhaseCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(isActive);

  // Auto-expand when phase becomes active
  useEffect(() => {
    if (isActive && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isActive, isExpanded]);

  // Format duration in human-readable format
  const formatDuration = (ms?: number): string => {
    if (ms === undefined) return "-";
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(0);
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Calculate current duration for running phases
  const getCurrentDuration = (): number | undefined => {
    if (phase.status === "running" && phase.startedAt) {
      return Date.now() - phase.startedAt;
    }
    return phase.durationMs;
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (phase.status) {
      case "pending":
        return <Pause className="h-4 w-4 text-neutral-400" />;
      case "running":
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </motion.div>
        );
      case "completed":
        return (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          </motion.div>
        );
      case "failed":
        return (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          </motion.div>
        );
      case "skipped":
        return (
          <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        );
      default:
        return null;
    }
  };

  // Get card styling based on status
  const getCardStyle = () => {
    const baseStyle = "rounded-lg border transition-all duration-300";

    switch (phase.status) {
      case "pending":
        return `${baseStyle} border-neutral-200 bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-800/30`;
      case "running":
        return `${baseStyle} border-blue-400 bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-cyan-50/80 dark:border-blue-500/50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-cyan-950/40 shadow-sm`;
      case "completed":
        return `${baseStyle} border-green-300 bg-green-50/50 dark:border-green-700/50 dark:bg-green-900/20`;
      case "failed":
        return `${baseStyle} border-red-400 bg-red-50/50 dark:border-red-700/50 dark:bg-red-900/20`;
      case "skipped":
        return `${baseStyle} border-yellow-300 bg-yellow-50/50 dark:border-yellow-700/50 dark:bg-yellow-900/20`;
      default:
        return `${baseStyle} border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800`;
    }
  };

  // Get text color based on status
  const getTextColor = () => {
    switch (phase.status) {
      case "pending":
        return "text-neutral-600 dark:text-neutral-400";
      case "running":
        return "text-blue-900 dark:text-blue-100";
      case "completed":
        return "text-green-900 dark:text-green-100";
      case "failed":
        return "text-red-900 dark:text-red-100";
      case "skipped":
        return "text-yellow-900 dark:text-yellow-100";
      default:
        return "text-neutral-700 dark:text-neutral-300";
    }
  };

  // Get status badge
  const getStatusBadge = () => {
    const badgeClass = "rounded-full px-2 py-0.5 text-xs font-medium";

    switch (phase.status) {
      case "pending":
        return (
          <span
            className={`${badgeClass} bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400`}
          >
            {t("app.chat.agent.phase.pending", { defaultValue: "Pending" })}
          </span>
        );
      case "running":
        return (
          <span
            className={`${badgeClass} bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300`}
          >
            {t("app.chat.agent.phase.running", { defaultValue: "Running" })}
          </span>
        );
      case "completed":
        return (
          <span
            className={`${badgeClass} bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300`}
          >
            {t("app.chat.agent.phase.completed", { defaultValue: "Completed" })}
          </span>
        );
      case "failed":
        return (
          <span
            className={`${badgeClass} bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300`}
          >
            {t("app.chat.agent.phase.failed", { defaultValue: "Failed" })}
          </span>
        );
      case "skipped":
        return (
          <span
            className={`${badgeClass} bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300`}
          >
            {t("app.chat.agent.phase.skipped", { defaultValue: "Skipped" })}
          </span>
        );
      default:
        return null;
    }
  };

  const hasContent =
    phase.streamedContent || phase.outputSummary || phase.nodes.length > 0;
  const canExpand = hasContent && phase.status !== "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="relative"
    >
      {/* Phase Card */}
      <div className={getCardStyle()}>
        {/* Shimmer effect for running phases */}
        {phase.status === "running" && (
          <motion.div
            className="absolute inset-0 rounded-lg bg-linear-to-r from-transparent via-white/10 to-transparent"
            animate={{
              x: ["-100%", "100%"],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        )}

        {/* Header - Always visible */}
        <button
          onClick={() => canExpand && setIsExpanded(!isExpanded)}
          disabled={!canExpand}
          className={`relative flex w-full items-center gap-3 px-3 py-2.5 text-left ${
            canExpand
              ? "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
              : "cursor-default"
          } transition-colors rounded-t-lg`}
        >
          {/* Status Icon */}
          <div className="shrink-0">{getStatusIcon()}</div>

          {/* Phase Name & Description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={`text-sm font-medium ${getTextColor()} truncate`}>
                {phase.name}
              </h4>
              {phase.description && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  · {phase.description}
                </span>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="shrink-0">{getStatusBadge()}</div>

          {/* Duration */}
          <div className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400 min-w-12 text-right">
            {formatDuration(getCurrentDuration())}
          </div>

          {/* Expand/Collapse Icon */}
          {canExpand && (
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-neutral-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-neutral-400" />
              )}
            </motion.div>
          )}
        </button>

        {/* Expandable Content */}
        <AnimatePresence>
          {isExpanded && hasContent && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="border-t border-neutral-200/50 px-3 py-2 dark:border-neutral-700/30">
                {/* Streaming Content */}
                {phase.streamedContent && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="prose prose-sm dark:prose-invert max-w-none text-neutral-700 dark:text-neutral-300"
                  >
                    <Markdown content={phase.streamedContent} />
                  </motion.div>
                )}

                {/* Output Summary */}
                {phase.outputSummary && !phase.streamedContent && (
                  <p className="text-sm italic text-neutral-600 dark:text-neutral-400">
                    {phase.outputSummary}
                  </p>
                )}

                {/* Nested Nodes (if any) */}
                {phase.nodes.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-neutral-200/30 pt-2 dark:border-neutral-700/20">
                    <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                      {t("app.chat.agent.nodes", { defaultValue: "Nodes" })}
                    </div>
                    {phase.nodes.map((node) => (
                      <div
                        key={node.id}
                        className="flex items-center gap-2 py-0.5 text-xs"
                      >
                        {node.status === "running" ? (
                          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                        ) : node.status === "completed" ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        <span className="text-neutral-600 dark:text-neutral-400">
                          {node.name}
                        </span>
                        {node.durationMs && (
                          <span className="text-neutral-400 dark:text-neutral-500">
                            {formatDuration(node.durationMs)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
