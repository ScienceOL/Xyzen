import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentExecutionState } from "@/types/agentEvents";
import { useEffect, useRef } from "react";
import AgentTimeline from "./AgentTimeline";
import AgentStepAccordion from "./AgentStepAccordion";

interface AgentExecutionTimelineProps {
  execution: AgentExecutionState;
  isExecuting: boolean;
}

/**
 * AgentExecutionTimeline displays agent execution as a vertical timeline of collapsible step accordions.
 * Shows only the timeline steps - no header card.
 */
export default function AgentExecutionTimeline({
  execution,
  isExecuting,
}: AgentExecutionTimelineProps) {
  const { t } = useTranslation();
  const activePhaseRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active phase during execution
  useEffect(() => {
    if (isExecuting && activePhaseRef.current) {
      activePhaseRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [execution.currentPhase, isExecuting]);

  // Format duration in human-readable format
  const formatDuration = (ms?: number): string => {
    if (ms === undefined) return "";
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(0);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="space-y-3">
      {/* Phase Timeline with Vertical Dashed Line */}
      {execution.phases.length > 0 && (
        <AgentTimeline>
          {execution.phases.map((phase, index) => {
            const isActive = phase.status === "running";
            const isFinalPhase = index === execution.phases.length - 1;

            // Show content for:
            // 1. Active phase (currently streaming)
            // 2. Any non-final phase (their content is always shown)
            // Final phase content is shown below timeline after completion
            const phaseForDisplay = {
              ...phase,
              // Clear content for final completed phase - it will be shown below
              streamedContent:
                isFinalPhase && phase.status === "completed"
                  ? undefined
                  : phase.streamedContent,
              outputSummary:
                isFinalPhase && phase.status === "completed"
                  ? undefined
                  : phase.outputSummary,
            };

            return (
              <div key={phase.id} ref={isActive ? activePhaseRef : null}>
                <AgentStepAccordion
                  phase={phaseForDisplay}
                  isActive={isActive}
                  toolCalls={phase.toolCalls}
                />
              </div>
            );
          })}
        </AgentTimeline>
      )}

      {/* Subagents */}
      {execution.subagents.length > 0 && (
        <div className="rounded-[12px] border border-neutral-200/60 bg-neutral-50/30 px-3 py-2 dark:border-neutral-700/40 dark:bg-neutral-800/20">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
            {t("app.chat.agent.subagents", {
              defaultValue: "Subagents",
            })}
          </div>
          {execution.subagents.map((subagent) => (
            <div
              key={subagent.id}
              className="flex items-center gap-2 py-1"
              style={{ paddingLeft: `${subagent.depth * 12}px` }}
            >
              <span className="text-neutral-300 dark:text-neutral-600">└─</span>
              {subagent.status === "running" ? (
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              ) : subagent.status === "completed" ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500" />
              )}
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                {subagent.name}
              </span>
              {subagent.durationMs && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  {formatDuration(subagent.durationMs)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error Display */}
      {execution.error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[12px] border border-red-300 bg-red-50/50 p-3 dark:border-red-700/50 dark:bg-red-900/10"
        >
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-red-700 dark:text-red-300">
                {execution.error.type}
              </div>
              <div className="text-sm text-red-600 dark:text-red-400 mt-1">
                {execution.error.message}
              </div>
              {execution.error.nodeId && (
                <div className="text-xs text-red-500 dark:text-red-500 mt-1">
                  Node: {execution.error.nodeId}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
