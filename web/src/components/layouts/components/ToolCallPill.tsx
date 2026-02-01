import { motion } from "framer-motion";
import { CheckIcon } from "@heroicons/react/24/solid";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import type { ToolCall } from "@/store/types";
import LoadingMessage from "./LoadingMessage";

interface ToolCallPillProps {
  toolCall: ToolCall;
  className?: string;
  onClick?: () => void;
}

/**
 * ToolCallPill displays a tool call in a compact capsule/pill format.
 * Features:
 * - 28px height with full rounded corners
 * - Tool icon + name + truncated status
 * - Status indicator (spinner, check, error)
 * - Subtle hover effect
 */
export default function ToolCallPill({
  toolCall,
  className = "",
  onClick,
}: ToolCallPillProps) {
  const { name, status } = toolCall;

  // Get status indicator
  const StatusIndicator = () => {
    switch (status) {
      case "pending":
      case "waiting_confirmation":
      case "executing":
        return <LoadingMessage size="small" />;

      case "completed":
        return (
          <motion.div
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <CheckIcon className="h-3 w-3 text-green-600 dark:text-green-400" />
          </motion.div>
        );

      case "failed":
        return <span className="text-red-500 text-xs font-medium">!</span>;

      default:
        return null;
    }
  };

  // Get pill styling based on status
  const getPillStyle = () => {
    const baseStyle =
      "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[15px] border transition-colors";

    switch (status) {
      case "completed":
        return `${baseStyle} bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800/50`;
      case "failed":
        return `${baseStyle} bg-red-50/50 border-red-200 dark:bg-red-900/10 dark:border-red-800/50`;
      case "executing":
      case "pending":
      case "waiting_confirmation":
        return `${baseStyle} bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800/50`;
      default:
        return `${baseStyle} bg-neutral-50/50 border-neutral-200 dark:bg-neutral-800/30 dark:border-neutral-700`;
    }
  };

  const isClickable = Boolean(onClick);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      type="button"
      onClick={onClick}
      className={`${getPillStyle()} ${
        isClickable
          ? "cursor-pointer hover:bg-neutral-100/80 dark:hover:bg-neutral-700/30"
          : "cursor-default"
      } ${className}`}
      title={`Tool: ${name}\nStatus: ${status}`}
    >
      {/* Tool Icon */}
      <WrenchScrewdriverIcon className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" />

      {/* Tool Name */}
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[120px]">
        {name}
      </span>

      {/* Status Indicator */}
      <StatusIndicator />
    </motion.button>
  );
}
