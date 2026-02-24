import JsonDisplay from "@/components/shared/JsonDisplay";
import { zIndexClasses } from "@/constants/zIndex";
import type { ToolCall, ToolCallResult } from "@/store/types";
import { Dialog, DialogPanel } from "@headlessui/react";
import {
  ArrowsPointingOutIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface ToolCallDetailsProps {
  toolCall: ToolCall;
  showSectionTitles?: boolean;
  showTimestamp?: boolean;
}

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp)$/i;

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

/**
 * Extract the displayable data from a ToolCallResult.
 *
 * Backend now sends: { success: boolean, data: any, error?: string }
 * Legacy format (string) is handled as fallback for cached messages.
 */
const extractResultData = (result: ToolCall["result"]): unknown => {
  if (!result) return undefined;

  // New structured format from backend
  if (typeof result === "object" && "success" in result) {
    const structured = result as ToolCallResult;
    // If data is a string that looks like JSON, parse it
    if (typeof structured.data === "string") {
      try {
        return JSON.parse(structured.data);
      } catch {
        return structured.data;
      }
    }
    return structured.data;
  }

  // Legacy: plain string (from cached/old messages)
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  // Legacy: { type, content, raw } format
  if (typeof result === "object" && "content" in result) {
    return (result as { content: unknown }).content;
  }

  return result;
};

/** Check if a tool result has a sandbox file path pointing to an image */
const getSandboxImagePath = (
  toolName: string,
  parsed: unknown,
): string | null => {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  // sandbox_write: check the written path
  if (toolName === "sandbox_write" && typeof obj.path === "string") {
    if (IMAGE_EXTENSIONS.test(obj.path)) return obj.path;
  }

  // sandbox_bash: check for image files mentioned in stdout
  // Not reliable enough to auto-detect, skip for now

  // generate_image auto-mount
  if (typeof obj.sandbox_path === "string") {
    if (IMAGE_EXTENSIONS.test(obj.sandbox_path)) return obj.sandbox_path;
  }

  return null;
};

/** Terminal-style rendering for sandbox_bash results */
function SandboxBashResult({ parsed }: { parsed: unknown }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const exitCode =
    typeof obj.exit_code === "number" ? obj.exit_code : undefined;
  const stdout = typeof obj.stdout === "string" ? obj.stdout : "";
  const stderr = typeof obj.stderr === "string" ? obj.stderr : "";
  const success = obj.success === true;

  const stdoutLines = stdout.split("\n");
  const isLong = stdoutLines.length > 20;
  const displayStdout =
    isLong && !expanded ? stdoutLines.slice(0, 20).join("\n") : stdout;

  return (
    <div className="rounded-md overflow-hidden border border-neutral-800">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-b border-neutral-800">
        <span className="text-[10px] font-mono text-neutral-500">
          {t("app.chat.toolCall.terminal", { defaultValue: "Terminal" })}
        </span>
        {exitCode !== undefined && (
          <span
            className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded ${
              exitCode === 0
                ? "bg-green-900/40 text-green-400"
                : "bg-red-900/40 text-red-400"
            }`}
          >
            exit {exitCode}
          </span>
        )}
        {exitCode === undefined && !success && (
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/40 text-red-400">
            {t("app.chat.toolCall.error", { defaultValue: "Error" })}
          </span>
        )}
      </div>

      {/* Output */}
      <div className="bg-neutral-950 p-3">
        {displayStdout && (
          <pre className="text-xs font-mono text-neutral-200 whitespace-pre-wrap wrap-break-words">
            {displayStdout}
          </pre>
        )}
        {isLong && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[10px] text-blue-400 hover:text-blue-300 mt-1 font-mono"
          >
            ... {stdoutLines.length - 20}{" "}
            {t("app.chat.toolCall.moreLines", {
              defaultValue: "more lines",
            })}
          </button>
        )}
        {stderr && (
          <pre className="text-xs font-mono text-red-400 whitespace-pre-wrap wrap-break-words mt-2">
            {stderr}
          </pre>
        )}
        {!stdout && !stderr && (
          <span className="text-xs font-mono text-neutral-600 italic">
            {t("app.chat.toolCall.noOutput", {
              defaultValue: "(no output)",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

/** Preview URL card for sandbox_preview results */
function SandboxPreviewCard({ parsed }: { parsed: unknown }) {
  const { t } = useTranslation();
  const [showIframe, setShowIframe] = useState(false);

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (!obj.success || typeof obj.url !== "string") return null;

  const url = obj.url;
  const port = typeof obj.port === "number" ? obj.port : undefined;

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50">
        <ArrowTopRightOnSquareIcon className="w-4 h-4 text-blue-500" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate"
        >
          {url}
        </a>
        {port && (
          <span className="ml-auto shrink-0 text-[10px] font-mono bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 px-1.5 py-0.5 rounded">
            :{port}
          </span>
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setShowIframe(!showIframe)}
          className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          {showIframe
            ? t("app.chat.toolCall.hidePreview", {
                defaultValue: "Hide preview",
              })
            : t("app.chat.toolCall.showPreview", {
                defaultValue: "Show preview",
              })}
        </button>
      </div>
      {showIframe && (
        <div className="border-t border-neutral-200 dark:border-neutral-700">
          <iframe
            src={url}
            title="Sandbox Preview"
            className="w-full h-100 bg-white"
            sandbox="allow-scripts allow-forms allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}

export default function ToolCallDetails({
  toolCall,
  showSectionTitles = true,
  showTimestamp = true,
}: ToolCallDetailsProps) {
  const { t } = useTranslation();
  const [isImageLightboxOpen, setIsImageLightboxOpen] = useState(false);

  const parsedResult = useMemo(() => {
    if (!toolCall.result) return undefined;
    return extractResultData(toolCall.result);
  }, [toolCall.result]);

  const imageUrl = useMemo(() => {
    if (parsedResult === undefined) return null;
    return getImageFromResult(parsedResult);
  }, [parsedResult]);

  // Check for sandbox image paths (from sandbox_write, generate_image auto-mount)
  const sandboxImagePath = useMemo(() => {
    if (parsedResult === undefined) return null;
    return getSandboxImagePath(toolCall.name, parsedResult);
  }, [parsedResult, toolCall.name]);

  const isSandboxBash = toolCall.name === "sandbox_bash";
  const isSandboxPreview = toolCall.name === "sandbox_preview";

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
          {showSectionTitles && (
            <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t("app.chat.toolCall.arguments", { defaultValue: "Arguments" })}:
            </h4>
          )}
          <JsonDisplay
            data={toolCall.arguments}
            compact
            variant={jsonVariant}
            hideHeader
            maxHeight="none"
          />
        </div>
      )}

      {/* Result */}
      {toolCall.result && (
        <div className="mb-3">
          {showSectionTitles && !isSandboxBash && !isSandboxPreview && (
            <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t("app.chat.toolCall.result", { defaultValue: "Result" })}:
            </h4>
          )}

          {/* Terminal rendering for sandbox_bash */}
          {isSandboxBash && parsedResult !== undefined ? (
            <SandboxBashResult parsed={parsedResult} />
          ) : /* Preview card for sandbox_preview */
          isSandboxPreview && parsedResult !== undefined ? (
            <SandboxPreviewCard parsed={parsedResult} />
          ) : /* Image rendering */
          imageUrl && parsedResult !== undefined ? (
            <div className="space-y-3">
              <div
                className="inline-block cursor-pointer group"
                onClick={() => setIsImageLightboxOpen(true)}
              >
                <div className="relative rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 shadow-sm hover:shadow-md transition-shadow">
                  <img
                    src={imageUrl}
                    alt={t("app.chat.toolCall.imageAlt", {
                      defaultValue: "Generated image",
                    })}
                    className="max-w-70 max-h-70 w-auto h-auto object-contain"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
                      <ArrowsPointingOutIcon className="w-3 h-3" />
                      {t("app.chat.toolCall.expandImage", {
                        defaultValue: "Click to expand",
                      })}
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
                            alt={t("app.chat.toolCall.imageAlt", {
                              defaultValue: "Generated image",
                            })}
                            className="max-w-[90vw] max-h-[90vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                          />
                          <button
                            onClick={() => setIsImageLightboxOpen(false)}
                            className="absolute -top-3 -right-3 rounded-full p-1.5 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 shadow-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                            type="button"
                            title={t("common.close", { defaultValue: "Close" })}
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
                maxHeight="none"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Inline sandbox image preview if path detected */}
              {sandboxImagePath && (
                <div className="rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 shadow-sm inline-block">
                  <div className="px-2 py-1 bg-neutral-50 dark:bg-neutral-800/50 text-[10px] font-mono text-neutral-500">
                    {sandboxImagePath}
                  </div>
                </div>
              )}
              <JsonDisplay
                data={parsedResult}
                compact
                variant={jsonVariant}
                hideHeader
                enableCharts={true}
                maxHeight="none"
              />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {toolCall.error && (
        <div className="mb-3">
          {showSectionTitles && (
            <h4 className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">
              {t("app.chat.toolCall.error", { defaultValue: "Error" })}:
            </h4>
          )}
          <div className="rounded-sm bg-red-50 p-2 dark:bg-red-900/20">
            <pre className="text-xs text-red-800 dark:text-red-200 overflow-x-auto whitespace-pre-wrap">
              {toolCall.error}
            </pre>
          </div>
        </div>
      )}

      {showTimestamp && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
          {t("app.chat.toolCall.executedAt", { defaultValue: "Executed at" })}:{" "}
          {new Date(toolCall.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
