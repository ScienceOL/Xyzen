import type { ToolCall } from "@/store/types";
import JsonDisplay from "@/components/shared/JsonDisplay";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
  onConfirm?: (toolCallId: string) => void;
  onCancel?: (toolCallId: string) => void;
}

const getStatusIcon = (status: ToolCall["status"]) => {
  switch (status) {
    case "pending":
      return <PlayIcon className="h-4 w-4 text-blue-500" />;
    case "waiting_confirmation":
      return <ClockIcon className="h-4 w-4 text-orange-500" />;
    case "executing":
      return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="h-4 w-4"
        >
          <PlayIcon className="h-4 w-4 text-blue-500" />
        </motion.div>
      );
    case "completed":
      return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
    case "failed":
      return <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />;
    default:
      return <PlayIcon className="h-4 w-4 text-gray-500" />;
  }
};

const getStatusText = (status: ToolCall["status"]) => {
  switch (status) {
    case "pending":
      return "等待执行";
    case "waiting_confirmation":
      return "等待确认";
    case "executing":
      return "执行中...";
    case "completed":
      return "执行完成";
    case "failed":
      return "执行失败";
    default:
      return "未知状态";
  }
};

const getStatusColor = (status: ToolCall["status"]) => {
  switch (status) {
    case "pending":
      return "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10";
    case "waiting_confirmation":
      return "border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-900/10";
    case "executing":
      return "border-blue-300 bg-blue-100/50 dark:border-blue-700 dark:bg-blue-900/20";
    case "completed":
      return "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10";
    case "failed":
      return "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10";
    default:
      return "border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/10";
  }
};

export default function ToolCallCard({
  toolCall,
  className = "",
  onConfirm,
  onCancel,
}: ToolCallCardProps) {
  // For completed/failed status (history), default to expanded to show both arguments and results
  const isHistoryMode =
    toolCall.status === "completed" || toolCall.status === "failed";
  const [isExpanded, setIsExpanded] = useState(isHistoryMode);

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
      className={`rounded-lg border min-w-0 overflow-hidden ${getStatusColor(toolCall.status)} ${className}`}
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
          {getStatusIcon(toolCall.status)}
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
                {toolCall.name}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isWaitingConfirmation
                    ? "bg-orange-200/60 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
                    : "bg-neutral-200/60 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
                }`}
              >
                {getStatusText(toolCall.status)}
              </span>
            </div>
            {toolCall.description && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                {toolCall.description}
              </p>
            )}
          </div>
        </div>

        {/* Confirmation buttons or expand button */}
        {isWaitingConfirmation ? (
          <div className="flex items-center space-x-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onCancel?.(toolCall.id)}
              className="flex items-center justify-center rounded-md p-2 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
              title="取消执行"
            >
              <XMarkIcon className="h-4 w-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onConfirm?.(toolCall.id)}
              className="flex items-center justify-center rounded-md bg-green-600 px-3 py-2 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 transition-colors text-sm font-medium"
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
                  <div className="rounded-md bg-red-50 p-2 dark:bg-red-900/20">
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
