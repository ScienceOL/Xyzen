import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  ChevronRight,
  SkipForward,
} from "lucide-react";
import { useState } from "react";
import type { PhaseExecution } from "@/types/agentEvents";
import Markdown from "@/lib/Markdown";

interface AgentPhaseItemProps {
  phase: PhaseExecution;
  formatDuration: (ms?: number) => string;
}

/**
 * AgentPhaseItem displays a single phase in the agent execution timeline.
 * Can be expanded to show node-level details or streamed content.
 */
export default function AgentPhaseItem({
  phase,
  formatDuration,
}: AgentPhaseItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasNodes = phase.nodes && phase.nodes.length > 0;
  const hasExpandableContent = hasNodes || !!phase.streamedContent;

  // Get status icon for phase
  const getPhaseStatusIcon = () => {
    switch (phase.status) {
      case "running":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-red-500" />;
      case "skipped":
        return <SkipForward className="h-3 w-3 text-yellow-500" />;
      case "pending":
      default:
        return (
          <Circle className="h-3 w-3 text-neutral-300 dark:text-neutral-600" />
        );
    }
  };

  // Get node status icon
  const getNodeStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400" />;
      case "completed":
        return <CheckCircle2 className="h-2.5 w-2.5 text-green-400" />;
      case "failed":
        return <XCircle className="h-2.5 w-2.5 text-red-400" />;
      case "skipped":
        return <SkipForward className="h-2.5 w-2.5 text-yellow-400" />;
      default:
        return <Circle className="h-2.5 w-2.5 text-neutral-300" />;
    }
  };

  return (
    <div className="py-0.5">
      {/* Phase row */}
      <button
        onClick={() => hasExpandableContent && setIsExpanded(!isExpanded)}
        disabled={!hasExpandableContent}
        className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left ${
          hasExpandableContent
            ? "cursor-pointer hover:bg-neutral-100/50 dark:hover:bg-neutral-700/30"
            : "cursor-default"
        }`}
      >
        {/* Expand/collapse indicator */}
        {hasExpandableContent ? (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="h-3 w-3 text-neutral-400" />
          </motion.div>
        ) : (
          <div className="w-3" />
        )}

        {/* Status icon */}
        {getPhaseStatusIcon()}

        {/* Phase name */}
        <span className="flex-1 text-xs text-neutral-700 dark:text-neutral-300">
          {phase.name}
        </span>

        {/* Duration */}
        {phase.durationMs !== undefined && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {formatDuration(phase.durationMs)}
          </span>
        )}
      </button>

      {/* Expanded node details */}
      <AnimatePresence>
        {isExpanded && hasNodes && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-5 mt-1 space-y-0.5 border-l border-neutral-200/50 pl-2 dark:border-neutral-700/50">
              {phase.nodes.map((node) => (
                <div key={node.id} className="flex items-center gap-2 py-0.5">
                  {/* Node status icon */}
                  {getNodeStatusIcon(node.status)}

                  {/* Node name */}
                  <span className="flex-1 text-xs text-neutral-600 dark:text-neutral-400">
                    {node.name}
                    {node.type && (
                      <span className="ml-1 text-neutral-400 dark:text-neutral-500">
                        ({node.type})
                      </span>
                    )}
                  </span>

                  {/* Node duration */}
                  {node.durationMs !== undefined && (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                      {formatDuration(node.durationMs)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expandable streamed content */}
      <AnimatePresence>
        {isExpanded && phase.streamedContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-5 mt-2 border-l border-neutral-200/50 pl-3 dark:border-neutral-700/50">
              <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                <Markdown content={phase.streamedContent} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Output summary (if available and phase is completed) */}
      {phase.outputSummary && phase.status === "completed" && (
        <div className="ml-8 mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 italic">
          {phase.outputSummary}
        </div>
      )}
    </div>
  );
}
