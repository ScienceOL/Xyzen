import JsonDisplay from "@/components/shared/JsonDisplay";
import type { ToolCall } from "@/store/types";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import {
  ExclamationTriangleIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/solid";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import LoadingMessage from "./LoadingMessage";

interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
  onConfirm?: (toolCallId: string) => void;
  onCancel?: (toolCallId: string) => void;
}

const getStatusText = (status: ToolCall["status"]) => {
  switch (status) {
    case "pending":
    case "waiting_confirmation":
    case "executing":
      return <LoadingMessage size="small" />;
    case "completed":
      return (
        <motion.div
          key="completed"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="flex items-center"
        >
          <CheckIcon className="size-3 text-green-800/80" />
        </motion.div>
      );
    case "failed":
      return (
        <motion.div
          key="failed"
          initial={{ x: -8, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 8, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex items-center"
        >
          <ExclamationTriangleIcon className="size-3 text-red-500/80" />
        </motion.div>
      );
    default:
      return null;
  }
};

export default function ToolCallCard({
  toolCall,
  className = "",
  onConfirm,
  onCancel,
}: ToolCallCardProps) {
  // For completed/failed status (history), default to expanded to show both arguments and results
  const [isExpanded, setIsExpanded] = useState(false);

  const isWaitingConfirmation = toolCall.status === "waiting_confirmation";

  // Get JsonDisplay variant based on tool call status
  const getJsonVariant = (): "success" | "error" | "default" => {
    if (toolCall.status === "completed") return "success";
    if (toolCall.status === "failed") return "error";
    return "default";
  };

  const jsonVariant = getJsonVariant();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`rounded-sm min-w-0 overflow-hidden border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/10 ${className}`}
    >
      {/* Header - Always visible */}
      <div
        className={`flex items-center justify-between p-3 ${
          !isWaitingConfirmation
            ? "cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            : ""
        }`}
        onClick={
          !isWaitingConfirmation ? () => setIsExpanded(!isExpanded) : undefined
        }
      >
        <div className="flex items-center space-x-3">
          {/*{getStatusIcon(toolCall.status)}*/}
          <div>
            <div className="flex items-center space-x-2">
              {getStatusText(toolCall.status)}
              <span className="font-medium text-2xs text-neutral-600/80 dark:text-neutral-400/80 ">
                {toolCall.name}
              </span>
              {/*{toolCall.description && (
                <span className="font-medium text-xs text-neutral-600 dark:text-neutral-400">
                  {toolCall.description}
                </span>
              )}*/}
            </div>
          </div>
        </div>

        {/* Confirmation buttons or expand button */}
        {isWaitingConfirmation ? (
          <div className="flex items-center space-x-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onCancel?.(toolCall.id)}
              className="flex items-center justify-center rounded-sm p-2 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
              title="取消执行"
            >
              <XMarkIcon className="h-4 w-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onConfirm?.(toolCall.id)}
              className="flex items-center justify-center rounded-sm bg-green-600 px-3 py-2 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 transition-colors text-sm font-medium"
              title="确认执行"
            >
              确认执行
            </motion.button>
          </div>
        ) : (
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <ChevronDownIcon className="h-4 w-4 text-neutral-500" />
          </motion.div>
        )}
      </div>

      {/* Show arguments immediately for waiting confirmation */}
      {isWaitingConfirmation && Object.keys(toolCall.arguments).length > 0 && (
        <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            即将执行的参数:
          </h4>
          <JsonDisplay
            data={toolCall.arguments}
            compact
            variant={jsonVariant}
            hideHeader
          />
        </div>
      )}

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
              {/* Arguments */}
              {Object.keys(toolCall.arguments).length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    调用参数:
                  </h4>
                  <JsonDisplay
                    data={toolCall.arguments}
                    compact
                    variant={jsonVariant}
                    hideHeader
                  />
                </div>
              )}

              {/* Result */}
              {toolCall.result && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    执行结果:
                  </h4>
                  <JsonDisplay
                    data={(() => {
                      // Handle both old format (string) and new format (structured object)
                      if (typeof toolCall.result === "string") {
                        try {
                          return JSON.parse(toolCall.result);
                        } catch {
                          return toolCall.result;
                        }
                      } else if (
                        typeof toolCall.result === "object" &&
                        toolCall.result !== null
                      ) {
                        // New structured format from backend
                        if ("content" in toolCall.result) {
                          return toolCall.result.content;
                        }
                        return toolCall.result;
                      }
                      return toolCall.result;
                    })()}
                    compact
                    variant={jsonVariant}
                    hideHeader
                    enableCharts={true}
                  />
                </div>
              )}

              {/* Error */}
              {toolCall.error && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">
                    错误信息:
                  </h4>
                  <div className="rounded-sm bg-red-50 p-2 dark:bg-red-900/20">
                    <pre className="text-xs text-red-800 dark:text-red-200 overflow-x-auto whitespace-pre-wrap">
                      {toolCall.error}
                    </pre>
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                执行时间: {new Date(toolCall.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
