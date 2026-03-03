import type { ToolCall } from "@/store/types";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import LoadingMessage from "./LoadingMessage";
import ToolCallPill from "./ToolCallPill";

interface ToolCallGroupProps {
  toolCalls: ToolCall[];
}

/** Aggregate status across all tool calls in the group */
function useGroupStatus(toolCalls: ToolCall[]) {
  return useMemo(() => {
    const hasExecuting = toolCalls.some(
      (tc) =>
        tc.status === "executing" ||
        tc.status === "pending" ||
        tc.status === "waiting_confirmation",
    );
    const hasFailed = toolCalls.some(
      (tc) =>
        tc.status === "failed" ||
        (tc.result &&
          typeof tc.result === "object" &&
          "success" in tc.result &&
          tc.result.success === false),
    );
    if (hasExecuting) return "executing" as const;
    if (hasFailed) return "failed" as const;
    return "completed" as const;
  }, [toolCalls]);
}

/** Build summary like "sandbox_bash x3, web_search x2" */
function useToolSummary(toolCalls: ToolCall[]) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const tc of toolCalls) {
      counts.set(tc.name, (counts.get(tc.name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => (count > 1 ? `${name} \u00d7${count}` : name))
      .join(", ");
  }, [toolCalls]);
}

/**
 * ToolCallGroup renders a collapsed-by-default accordion for a group of
 * consecutive tool calls. Shows a compact summary line that expands to
 * reveal individual ToolCallPill components.
 */
function ToolCallGroup({ toolCalls }: ToolCallGroupProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const groupStatus = useGroupStatus(toolCalls);
  const summary = useToolSummary(toolCalls);

  const toggle = useCallback(() => setIsExpanded((v) => !v), []);

  if (toolCalls.length === 0) return null;

  return (
    <div className="my-2">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={toggle}
        className="group flex w-full items-center gap-2 rounded-lg bg-neutral-100/60 px-3 py-1.5 text-left transition-colors hover:bg-neutral-200/60 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
      >
        {/* Status icon */}
        <GroupStatusIcon status={groupStatus} />

        {/* Count + summary */}
        <span className="flex-1 min-w-0 truncate text-[13px] text-neutral-600 dark:text-neutral-400">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {t("app.chat.toolCall.toolCallCount", {
              count: toolCalls.length,
            })}
          </span>
          <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">
            —
          </span>
          {summary}
        </span>

        {/* Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-400 dark:group-hover:text-neutral-500 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </motion.div>
      </button>

      {/* Expanded pill grid */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1">
              {toolCalls.map((tc) => (
                <ToolCallPill key={tc.id} toolCall={tc} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupStatusIcon({
  status,
}: {
  status: "executing" | "completed" | "failed";
}) {
  switch (status) {
    case "executing":
      return (
        <div className="flex h-4 w-4 items-center justify-center shrink-0">
          <LoadingMessage size="small" />
        </div>
      );
    case "completed":
      return (
        <div className="flex h-4 w-4 items-center justify-center shrink-0">
          <WrenchScrewdriverIcon className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
        </div>
      );
    case "failed":
      return (
        <div className="flex h-4 w-4 items-center justify-center shrink-0">
          <span className="text-xs font-semibold leading-none text-red-500 dark:text-red-400">
            !
          </span>
        </div>
      );
  }
}

export default memo(ToolCallGroup);
