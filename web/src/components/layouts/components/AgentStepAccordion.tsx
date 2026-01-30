import { DefaultRenderer, getRenderer } from "@/components/agents/renderers";
import type { ToolCall } from "@/store/types";
import type { ExecutionStatus, PhaseExecution } from "@/types/agentEvents";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import ToolCallPill from "./ToolCallPill";
import ToolCallDetailsModal from "./ToolCallDetailsModal";

interface AgentStepAccordionProps {
  phase: PhaseExecution;
  isActive: boolean;
  toolCalls?: ToolCall[];
  className?: string;
}

/**
 * AgentStepAccordion displays a single step in the agent execution timeline.
 * Features minimal, content-focused design with subtle animations.
 */
export default function AgentStepAccordion({
  phase,
  isActive,
  toolCalls = [],
  className = "",
}: AgentStepAccordionProps) {
  // Auto-collapse completed, auto-expand running
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(
    null,
  );

  // Auto-expand when phase becomes active, auto-collapse when completed
  useEffect(() => {
    if (isActive) {
      setIsExpanded(true);
    } else if (phase.status === "completed" || phase.status === "failed") {
      // Auto-collapse when step completes
      setIsExpanded(false);
    }
  }, [isActive, phase.status]);

  const hasContent = Boolean(
    phase.streamedContent || phase.outputSummary || toolCalls.length > 0,
  );
  const canExpand = hasContent && phase.status !== "pending";

  const selectedToolCall = selectedToolCallId
    ? toolCalls.find((tc) => tc.id === selectedToolCallId) || null
    : null;

  // Get custom renderer based on componentKey, or fall back to DefaultRenderer
  const CustomRenderer = getRenderer(phase.componentKey);
  const ContentRenderer = CustomRenderer || DefaultRenderer;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={`relative ${className}`}
    >
      {selectedToolCall && (
        <ToolCallDetailsModal
          toolCall={selectedToolCall}
          open={Boolean(selectedToolCall)}
          onClose={() => setSelectedToolCallId(null)}
        />
      )}

      {/* Header - Minimal design */}
      <button
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        disabled={!canExpand}
        className={`group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-all duration-200 ${
          canExpand
            ? "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            : "cursor-default"
        }`}
      >
        {/* Minimal Status Indicator */}
        <StatusIndicator status={phase.status} />

        {/* Step Title - Muted when complete, emphasized when active */}
        <span
          className={`flex-1 text-[13px] font-medium truncate transition-colors ${
            isActive
              ? "text-neutral-800 dark:text-neutral-100"
              : phase.status === "completed"
                ? "text-neutral-500 dark:text-neutral-400"
                : "text-neutral-600 dark:text-neutral-300"
          }`}
        >
          {phase.name}
        </span>

        {/* Right side: subtle indicators */}
        <RightIndicator
          status={phase.status}
          hasContent={hasContent}
          isExpanded={isExpanded}
          canExpand={canExpand}
        />
      </button>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pl-7 pr-2 pb-3 pt-0.5">
              {/* Tool Calls as Pills */}
              {toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {toolCalls.map((toolCall) => (
                    <ToolCallPill
                      key={toolCall.id}
                      toolCall={toolCall}
                      onClick={() => setSelectedToolCallId(toolCall.id)}
                    />
                  ))}
                </div>
              )}

              {/* Dynamic Content Renderer */}
              {(phase.streamedContent || phase.outputSummary) && (
                <ContentRenderer phase={phase} isActive={isActive} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Minimal status indicator - subtle dots and lines
 */
function StatusIndicator({ status }: { status: ExecutionStatus }) {
  switch (status) {
    case "completed":
      return (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="flex h-4 w-4 items-center justify-center"
        >
          {/* Simple checkmark line - no background */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="text-emerald-500 dark:text-emerald-400"
          >
            <motion.path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            />
          </svg>
        </motion.div>
      );

    case "running":
      return (
        <div className="flex h-4 w-4 items-center justify-center">
          {/* Pulsing dot */}
          <motion.div
            className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.7, 1, 0.7],
            }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      );

    case "failed":
      return (
        <div className="flex h-4 w-4 items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-red-500 dark:bg-red-400" />
        </div>
      );

    case "skipped":
      return (
        <div className="flex h-4 w-4 items-center justify-center">
          <div className="h-0.5 w-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        </div>
      );

    case "pending":
    default:
      return (
        <div className="flex h-4 w-4 items-center justify-center">
          <div className="h-1.5 w-1.5 rounded-full border border-neutral-300 dark:border-neutral-600" />
        </div>
      );
  }
}

/**
 * Minimal right side indicator
 */
function RightIndicator({
  status,
  hasContent,
  isExpanded,
  canExpand,
}: {
  status: ExecutionStatus;
  hasContent: boolean;
  isExpanded: boolean;
  canExpand: boolean;
}) {
  if (status === "pending") {
    return null;
  }

  if (status === "running" && !hasContent) {
    return (
      <motion.span
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="text-[11px] text-neutral-400 dark:text-neutral-500"
      >
        •••
      </motion.span>
    );
  }

  if (!canExpand) {
    return null;
  }

  // Has content - show subtle expand toggle
  return (
    <motion.div
      animate={{ rotate: isExpanded ? 180 : 0 }}
      transition={{ duration: 0.2 }}
      className="text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-400 dark:group-hover:text-neutral-500 transition-colors"
    >
      <ChevronDown className="h-3.5 w-3.5" />
    </motion.div>
  );
}
