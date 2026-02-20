import { motion } from "framer-motion";
import { CheckIcon } from "@heroicons/react/24/solid";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import type { ToolCall } from "@/store/types";
import LoadingMessage from "./LoadingMessage";
import ToolCallDetailsModal from "./ToolCallDetailsModal";
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

interface ToolCallPillProps {
  toolCall: ToolCall;
  className?: string;
  onConfirm?: (toolCallId: string) => void;
  onCancel?: (toolCallId: string) => void;
}

/**
 * Extracted outside to maintain stable component identity across renders.
 * (Defining this inline would cause React to unmount/remount every render.)
 */
function StatusIndicator({ status }: { status: ToolCall["status"] }) {
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
}

// Get pill styling based on status
const getPillStyle = (status: ToolCall["status"], hasResultError: boolean) => {
  const baseStyle =
    "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border transition-colors cursor-pointer hover:bg-neutral-100/80 dark:hover:bg-neutral-700/30";

  if (hasResultError || status === "failed") {
    return `${baseStyle} bg-red-50/50 border-red-200 dark:bg-red-900/10 dark:border-red-800/50`;
  }

  switch (status) {
    case "completed":
      return `${baseStyle} bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800/50`;
    case "executing":
    case "pending":
    case "waiting_confirmation":
      return `${baseStyle} bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800/50`;
    default:
      return `${baseStyle} bg-neutral-50/50 border-neutral-200 dark:bg-neutral-800/30 dark:border-neutral-700`;
  }
};

/**
 * ToolCallPill displays a tool call in a compact capsule/pill format.
 *
 * Self-contained: manages its own details modal. Dialog (without `static`)
 * uses Headless UI's built-in Portal, so it escapes any ancestor `transform`
 * (e.g. framer-motion) that would trap CSS `position: fixed`.
 */
function ToolCallPill({
  toolCall,
  className = "",
  onConfirm,
  onCancel,
}: ToolCallPillProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const { name, status, result } = toolCall;

  // Detect backend-reported error in structured result
  const hasResultError =
    !!result &&
    typeof result === "object" &&
    "success" in result &&
    result.success === false;

  const effectiveStatus =
    hasResultError && status !== "failed" ? "failed" : status;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails(true);
  }, []);

  const handleClose = useCallback(() => {
    setShowDetails(false);
  }, []);

  return (
    <>
      <motion.button
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        type="button"
        onClick={handleClick}
        className={`${getPillStyle(status, hasResultError)} ${className}`}
        title={`${t("app.chat.toolCall.tool")}: ${name}\n${t("app.chat.toolCall.status")}: ${status}`}
      >
        {/* Tool Icon */}
        <WrenchScrewdriverIcon className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" />

        {/* Tool Name */}
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[120px]">
          {name}
        </span>

        {/* Status Indicator */}
        <StatusIndicator status={effectiveStatus} />
      </motion.button>

      {showDetails && (
        <ToolCallDetailsModal
          toolCall={toolCall}
          open={showDetails}
          onClose={handleClose}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}
    </>
  );
}

export default memo(ToolCallPill);
