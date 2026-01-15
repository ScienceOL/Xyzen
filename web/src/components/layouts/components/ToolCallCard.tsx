import JsonDisplay from "@/components/shared/JsonDisplay";
import { zIndexClasses } from "@/constants/zIndex";
import type { ToolCall } from "@/store/types";
import { Dialog, DialogPanel } from "@headlessui/react";
import {
  ArrowsPointingOutIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
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

/**
 * Check if tool result contains a displayable image URL or data URL
 */
const getImageFromResult = (result: unknown): string | null => {
  if (!result || typeof result !== "object") return null;

  const obj = result as Record<string, unknown>;

  // Check for data_url (base64 encoded) - highest priority
  if (
    typeof obj.data_url === "string" &&
    obj.data_url.startsWith("data:image/")
  ) {
    return obj.data_url;
  }

  // Check for url field that looks like an image
  // Note: Backend now returns presigned URLs with public endpoint, no conversion needed
  if (typeof obj.url === "string") {
    const url = obj.url;
    // Match common image extensions or generated image paths
    if (
      url.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i) ||
      url.includes("/generated/") ||
      url.startsWith("data:image/")
    ) {
      return url;
    }
  }

  return null;
};

/**
 * Parse tool result into a structured object
 */
const parseToolResult = (result: ToolCall["result"]): unknown => {
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  } else if (typeof result === "object" && result !== null) {
    // New structured format from backend
    if ("content" in result) {
      return result.content;
    }
    return result;
  }
  return result;
};

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
  const [isImageLightboxOpen, setIsImageLightboxOpen] = useState(false);

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
                  {(() => {
                    const parsedResult = parseToolResult(toolCall.result);
                    const imageUrl = getImageFromResult(parsedResult);

                    if (imageUrl) {
                      // Display image with constrained preview and lightbox
                      return (
                        <div className="space-y-3">
                          {/* Constrained image preview with lightbox */}
                          <div
                            className="inline-block cursor-pointer group"
                            onClick={() => setIsImageLightboxOpen(true)}
                          >
                            <div className="relative rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 shadow-sm hover:shadow-md transition-shadow">
                              <img
                                src={imageUrl}
                                alt="Generated image"
                                className="max-w-[280px] max-h-[280px] w-auto h-auto object-contain"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
                                  <ArrowsPointingOutIcon className="w-3 h-3" />
                                  Click to expand
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Lightbox Modal */}
                          <AnimatePresence>
                            {isImageLightboxOpen && (
                              <Dialog
                                static
                                open={isImageLightboxOpen}
                                onClose={() => setIsImageLightboxOpen(false)}
                                className={`relative ${zIndexClasses.modal}`}
                              >
                                {/* Backdrop */}
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                                  aria-hidden="true"
                                />

                                {/* Image container */}
                                <div
                                  className="fixed inset-0 flex items-center justify-center p-4"
                                  onClick={() => setIsImageLightboxOpen(false)}
                                >
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ duration: 0.2 }}
                                    className="relative max-w-[90vw] max-h-[90vh]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <DialogPanel>
                                      <img
                                        src={imageUrl}
                                        alt="Generated image"
                                        className="max-w-[90vw] max-h-[90vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                                      />
                                      <button
                                        onClick={() =>
                                          setIsImageLightboxOpen(false)
                                        }
                                        className="absolute -top-3 -right-3 rounded-full p-1.5 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 shadow-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                                      >
                                        <XMarkIcon className="h-5 w-5" />
                                      </button>
                                    </DialogPanel>
                                  </motion.div>
                                </div>
                              </Dialog>
                            )}
                          </AnimatePresence>

                          <JsonDisplay
                            data={parsedResult}
                            compact
                            variant={jsonVariant}
                            hideHeader
                          />
                        </div>
                      );
                    }

                    return (
                      <JsonDisplay
                        data={parsedResult}
                        compact
                        variant={jsonVariant}
                        hideHeader
                        enableCharts={true}
                      />
                    );
                  })()}
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
