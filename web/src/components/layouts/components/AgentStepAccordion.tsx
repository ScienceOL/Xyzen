import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { useState, useEffect } from "react";
import type { ExecutionStatus, PhaseExecution } from "@/types/agentEvents";
import { getRenderer, DefaultRenderer } from "@/components/agents/renderers";
import LoadingMessage from "./LoadingMessage";
import ToolCallPill from "./ToolCallPill";
import type { ToolCall } from "@/store/types";

interface AgentStepAccordionProps {
  phase: PhaseExecution;
  isActive: boolean;
  toolCalls?: ToolCall[];
  className?: string;
}

/**
 * AgentStepAccordion displays a single step in the agent execution timeline.
 * Features:
 * - Checkbox-style status indicators (completed: green check, running: spinner, pending: hollow)
 * - Auto-expand on running, auto-collapse when completed
 * - Manual toggle via header click
 * - Chevron rotation animation
 * - Tool calls displayed as pills inside the step
 * - Dynamic content rendering based on componentKey
 */
export default function AgentStepAccordion({
  phase,
  isActive,
  toolCalls = [],
  className = "",
}: AgentStepAccordionProps) {
  // Auto-collapse completed, auto-expand running
  const [isExpanded, setIsExpanded] = useState(isActive);

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

  // Get custom renderer based on componentKey, or fall back to DefaultRenderer
  const CustomRenderer = getRenderer(phase.componentKey);
  const ContentRenderer = CustomRenderer || DefaultRenderer;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`relative ${className}`}
    >
      {/* Header */}
      <button
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        disabled={!canExpand}
        className={`flex w-full items-center gap-3 rounded-[6px] px-3 py-2 text-left transition-colors ${
          canExpand
            ? "cursor-pointer hover:bg-neutral-100/80 dark:hover:bg-neutral-700/30"
            : "cursor-default"
        } ${isActive ? "bg-neutral-100/50 dark:bg-neutral-700/20" : ""}`}
      >
        {/* Status Indicator */}
        <StatusIndicator status={phase.status} />

        {/* Step Title */}
        <span className="flex-1 text-sm font-medium text-neutral-700 dark:text-neutral-300 truncate">
          {phase.name}
        </span>

        {/* Right side: status text or chevron */}
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
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pl-9 pr-3 pb-2">
              {/* Tool Calls as Pills */}
              {toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {toolCalls.map((toolCall) => (
                    <ToolCallPill key={toolCall.id} toolCall={toolCall} />
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
 * Status indicator icon matching the design spec
 */
function StatusIndicator({ status }: { status: ExecutionStatus }) {
  switch (status) {
    case "completed":
      return (
        <motion.div
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-green-500 dark:bg-green-600"
        >
          <CheckIcon className="h-3 w-3 text-white" />
        </motion.div>
      );

    case "running":
      return (
        <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-blue-500 dark:border-blue-400 bg-white dark:bg-neutral-900">
          <LoadingMessage size="small" />
        </div>
      );

    case "failed":
      return (
        <motion.div
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-red-500 dark:bg-red-600"
        >
          <span className="text-white text-xs font-bold">!</span>
        </motion.div>
      );

    case "skipped":
      return (
        <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-yellow-400 dark:bg-yellow-500">
          <span className="text-white text-xs">-</span>
        </div>
      );

    case "pending":
    default:
      return (
        <div className="h-[22px] w-[22px] rounded-full border-2 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900" />
      );
  }
}

/**
 * Right side indicator (status text or chevron)
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
    return (
      <span className="text-xs text-neutral-400 dark:text-neutral-500">
        pending
      </span>
    );
  }

  if (status === "running" && !hasContent) {
    return (
      <span className="text-xs text-blue-500 dark:text-blue-400">
        running...
      </span>
    );
  }

  if (!canExpand) {
    return null;
  }

  // Has content - show expand toggle
  return (
    <motion.div
      animate={{ rotate: isExpanded ? 180 : 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      <ChevronDownIcon className="h-4 w-4 text-neutral-400" />
    </motion.div>
  );
}
