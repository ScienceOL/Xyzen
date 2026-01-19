import type { AgentExecutionState } from "@/types/agentEvents";
import { AnimatePresence, motion } from "framer-motion";
import { XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import AgentStepAccordion from "./AgentStepAccordion";
import AgentTimeline from "./AgentTimeline";

interface AgentExecutionTimelineProps {
  execution: AgentExecutionState;
  isExecuting: boolean;
}

/**
 * AgentExecutionTimeline displays agent execution as a minimal, content-focused timeline.
 * Subtle UI that keeps user attention on the actual content.
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {/* Phase Timeline */}
      {execution.phases.length > 0 && (
        <AgentTimeline>
          <AnimatePresence mode="popLayout">
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
                <motion.div
                  key={phase.id}
                  ref={isActive ? activePhaseRef : null}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <AgentStepAccordion
                    phase={phaseForDisplay}
                    isActive={isActive}
                    toolCalls={phase.toolCalls}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </AgentTimeline>
      )}

      {/* Subagents - Minimal display */}
      {execution.subagents.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="ml-2 border-l border-neutral-100 pl-3 dark:border-neutral-800"
        >
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            {t("app.chat.agent.subagents", {
              defaultValue: "Subagents",
            })}
          </div>
          <div className="space-y-1">
            {execution.subagents.map((subagent) => (
              <motion.div
                key={subagent.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 py-0.5"
                style={{ paddingLeft: `${subagent.depth * 12}px` }}
              >
                {/* Minimal status dot */}
                {subagent.status === "running" ? (
                  <motion.div
                    className="h-1.5 w-1.5 rounded-full bg-blue-500"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                ) : subagent.status === "completed" ? (
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                ) : (
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                )}
                <span className="text-[13px] text-neutral-500 dark:text-neutral-400">
                  {subagent.name}
                </span>
                {subagent.durationMs && (
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                    {formatDuration(subagent.durationMs)}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Error Display - Minimal but visible */}
      <AnimatePresence>
        {execution.error && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            className="rounded-lg border border-red-200/60 bg-red-50/50 px-3 py-2.5 dark:border-red-800/40 dark:bg-red-950/20"
          >
            <div className="flex items-start gap-2.5">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-red-700 dark:text-red-300">
                  {execution.error.type}
                </div>
                <div className="mt-0.5 text-[13px] text-red-600/80 dark:text-red-400/80">
                  {execution.error.message}
                </div>
                {execution.error.nodeId && (
                  <div className="mt-1 text-[11px] text-red-500/60 dark:text-red-500/60">
                    Node: {execution.error.nodeId}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
