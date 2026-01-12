import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDownIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import { useState, useEffect } from "react";
import type { ExecutionStatus } from "@/types/agentEvents";
import Markdown from "@/lib/Markdown";
import LoadingMessage from "./LoadingMessage";

interface AgentNodeItemProps {
  nodeName: string;
  status: ExecutionStatus;
  content?: string;
  isActive?: boolean;
  className?: string;
}

/**
 * AgentNodeItem displays a single node/phase in a compact tool-call style.
 * Designed to match ToolCallCard appearance with single-line header and expandable content.
 */
export default function AgentNodeItem({
  nodeName,
  status,
  content,
  isActive = false,
  className = "",
}: AgentNodeItemProps) {
  const [isExpanded, setIsExpanded] = useState(isActive);

  // Auto-expand when node becomes active
  useEffect(() => {
    if (isActive && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isActive, isExpanded]);

  // Check if there's meaningful content to show
  const hasContent = content && content.trim().length > 0;
  const canExpand = hasContent && status !== "pending";

  // Get status indicator matching ToolCallCard style
  const getStatusIndicator = () => {
    switch (status) {
      case "pending":
        return (
          <span className="h-3 w-3 rounded-full border-2 border-neutral-300 dark:border-neutral-600" />
        );
      case "running":
        return <LoadingMessage size="small" />;
      case "completed":
        return (
          <motion.div
            key="completed"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="flex items-center"
          >
            <CheckIcon className="size-3 text-green-600 dark:text-green-400" />
          </motion.div>
        );
      case "failed":
        return (
          <motion.div
            key="failed"
            initial={{ x: -8, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-center"
          >
            <ExclamationTriangleIcon className="size-3 text-red-500" />
          </motion.div>
        );
      case "skipped":
        return (
          <span className="h-3 w-3 rounded-full bg-yellow-400 dark:bg-yellow-500" />
        );
      default:
        return null;
    }
  };

  // Get right side indicator
  const getRightIndicator = () => {
    if (status === "pending") {
      return (
        <span className="text-2xs text-neutral-400 dark:text-neutral-500">
          pending
        </span>
      );
    }

    if (status === "running" && !hasContent) {
      return (
        <span className="text-2xs text-blue-500 dark:text-blue-400">
          running...
        </span>
      );
    }

    if (!hasContent && status !== "running") {
      return (
        <span className="text-2xs text-neutral-400 dark:text-neutral-500 italic">
          no content
        </span>
      );
    }

    // Has content - show expand toggle
    return (
      <motion.div
        animate={{ rotate: isExpanded ? 180 : 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        <ChevronDownIcon className="h-4 w-4 text-neutral-500" />
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-sm min-w-0 overflow-hidden bg-gray-50/50 dark:bg-gray-900/10 ${className}`}
    >
      {/* Header - Single line, matching ToolCallCard */}
      <div
        className={`flex items-center justify-between px-3 py-2 ${
          canExpand
            ? "cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            : ""
        }`}
        onClick={canExpand ? () => setIsExpanded(!isExpanded) : undefined}
      >
        <div className="flex items-center space-x-3">
          {getStatusIndicator()}
          <span className="font-medium text-2xs text-neutral-600/80 dark:text-neutral-400/80">
            {nodeName}
          </span>
        </div>

        {getRightIndicator()}
      </div>

      {/* Streaming content - shown inline when active */}
      {isActive && hasContent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="border-t border-neutral-200/50 px-3 py-2 dark:border-neutral-700/30"
        >
          <div className="prose prose-sm dark:prose-invert max-w-none text-neutral-700 dark:text-neutral-300 max-h-64 overflow-y-auto">
            <Markdown content={content} />
          </div>
        </motion.div>
      )}

      {/* Expandable content - for completed phases */}
      <AnimatePresence>
        {isExpanded && !isActive && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-neutral-200/50 px-3 py-2 dark:border-neutral-700/30">
              <div className="prose prose-sm dark:prose-invert max-w-none text-neutral-700 dark:text-neutral-300 max-h-96 overflow-y-auto">
                <Markdown content={content} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
