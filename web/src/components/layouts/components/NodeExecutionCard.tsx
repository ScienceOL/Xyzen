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
import type { AgentMetadata } from "@/store/types";
import Markdown from "@/lib/Markdown";

interface NodeExecutionCardProps {
  metadata: AgentMetadata;
  content: string;
  isActive?: boolean;
}

/**
 * NodeExecutionCard displays a single node/phase execution as a card.
 * Similar to ToolCallCard, each node gets its own message card.
 *
 * This replaces the timeline approach with individual cards per execution step.
 */
export default function NodeExecutionCard({
  metadata,
  content,
  isActive = false,
}: NodeExecutionCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(isActive);

  const node = metadata.node || metadata.phase;

  // Auto-expand when active
  useEffect(() => {
    if (isActive && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isActive, isExpanded]);

  // Early return after all hooks
  if (!node) return null;

  // Format duration
  const formatDuration = (ms?: number): string => {
    if (ms === undefined) return "-";
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(0);
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Calculate current duration for running nodes
  const getCurrentDuration = (): number | undefined => {
    if (node.status === "running" && node.started_at) {
      return Date.now() - node.started_at;
    }
    return node.duration_ms;
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (node.status) {
      case "pending":
        return (
          <Pause className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
        );
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
    const baseStyle =
      "transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5";

    switch (node.status) {
      case "pending":
        return `${baseStyle} border-neutral-200 bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-800/30`;
      case "running":
        return `${baseStyle} border-blue-400 bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-cyan-50/80 dark:border-blue-500/50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-cyan-950/40`;
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
    switch (node.status) {
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

  const hasContent = content || node.output_summary;
  const canExpand = hasContent && node.status !== "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group relative w-full pl-8 my-2"
    >
      <div className={`rounded-lg border ${getCardStyle()}`}>
        {/* Shimmer effect for running nodes */}
        {node.status === "running" && (
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
          className={`relative flex w-full items-center gap-3 px-3 py-2.5 text-left rounded-t-lg ${
            canExpand ? "cursor-pointer" : "cursor-default"
          }`}
        >
          {/* Status Icon */}
          <div className="shrink-0">{getStatusIcon()}</div>

          {/* Node Name & Type */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium ${getTextColor()} truncate`}
              >
                {node.name}
              </span>
              {"type" in node && node.type && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  · {node.type}
                </span>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="shrink-0">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                node.status === "running"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                  : node.status === "completed"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                    : node.status === "failed"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {t(`app.chat.agent.status.${node.status}`, {
                defaultValue:
                  node.status.charAt(0).toUpperCase() + node.status.slice(1),
              })}
            </span>
          </div>

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
                {content && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="prose prose-sm dark:prose-invert max-w-none text-neutral-700 dark:text-neutral-300"
                  >
                    <Markdown content={content} />
                  </motion.div>
                )}

                {/* Output Summary */}
                {node.output_summary && !content && (
                  <p className="text-sm italic text-neutral-600 dark:text-neutral-400">
                    {node.output_summary}
                  </p>
                )}

                {/* Error Display */}
                {metadata.error && node.status === "failed" && (
                  <div className="mt-2 rounded border border-red-300 bg-red-50/50 p-2 dark:border-red-700/50 dark:bg-red-900/20">
                    <div className="text-xs font-medium text-red-700 dark:text-red-300">
                      {metadata.error.type}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {metadata.error.message}
                    </div>
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
