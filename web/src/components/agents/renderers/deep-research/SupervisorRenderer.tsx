/**
 * Supervisor Renderer
 *
 * Compact display for research progress.
 * Minimal, content-focused design.
 */

import Markdown from "@/lib/Markdown";
import { motion } from "framer-motion";
import type { ComponentRendererProps } from "../registry";

/**
 * SupervisorRenderer displays research progress with minimal styling.
 */
export default function SupervisorRenderer({
  phase,
  isActive,
}: ComponentRendererProps) {
  const content = phase.streamedContent || phase.outputSummary;

  if (!content) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="relative"
    >
      {/* Subtle left accent */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-violet-400/50 dark:bg-violet-500/40" />

      {/* Content */}
      <div className="pl-3">
        {isActive && (
          <motion.div
            className="mb-2 flex items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="h-1.5 w-1.5 rounded-full bg-violet-500"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
              Researching
            </span>
          </motion.div>
        )}
        <div className="max-h-40 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-700">
          <div className="prose prose-sm max-w-none text-neutral-500 dark:prose-invert dark:text-neutral-400 prose-p:my-0.5 prose-p:leading-relaxed prose-ul:my-0.5 prose-li:my-0">
            <Markdown content={content} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
