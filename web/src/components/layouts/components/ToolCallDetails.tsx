import JsonDisplay from "@/components/shared/JsonDisplay";
import { zIndexClasses } from "@/constants/zIndex";
import type { ToolCall } from "@/store/types";
import { Dialog, DialogPanel } from "@headlessui/react";
import { ArrowsPointingOutIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

interface ToolCallDetailsProps {
  toolCall: ToolCall;
}

const getImageFromResult = (result: unknown): string | null => {
  if (!result || typeof result !== "object") return null;

  const obj = result as Record<string, unknown>;

  if (
    typeof obj.data_url === "string" &&
    obj.data_url.startsWith("data:image/")
  ) {
    return obj.data_url;
  }

  if (typeof obj.url === "string") {
    const url = obj.url;
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

const parseToolResult = (result: ToolCall["result"]): unknown => {
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  if (typeof result === "object" && result !== null) {
    if ("content" in result) {
      return (result as { content: unknown }).content;
    }
    return result;
  }

  return result;
};

export default function ToolCallDetails({ toolCall }: ToolCallDetailsProps) {
  const [isImageLightboxOpen, setIsImageLightboxOpen] = useState(false);

  const jsonVariant: "success" | "error" | "default" =
    toolCall.status === "completed"
      ? "success"
      : toolCall.status === "failed"
        ? "error"
        : "default";

  return (
    <div className="min-w-0">
      {/* Arguments */}
      {Object.keys(toolCall.arguments || {}).length > 0 && (
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
              return (
                <div className="space-y-3">
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

                  <AnimatePresence>
                    {isImageLightboxOpen && (
                      <Dialog
                        static
                        open={isImageLightboxOpen}
                        onClose={() => setIsImageLightboxOpen(false)}
                        className={`relative ${zIndexClasses.modal}`}
                      >
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                          aria-hidden="true"
                        />

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
                                onClick={() => setIsImageLightboxOpen(false)}
                                className="absolute -top-3 -right-3 rounded-full p-1.5 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 shadow-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                                type="button"
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

      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
        执行时间: {new Date(toolCall.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}
