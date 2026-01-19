/**
 * Clarification Renderer
 *
 * Minimal design for clarification questions.
 * Clean, content-focused with subtle accents.
 */

import Markdown from "@/lib/Markdown";
import { motion } from "framer-motion";
import type { ComponentRendererProps } from "../registry";

/**
 * ClarificationRenderer displays clarification questions with minimal styling.
 */
export default function ClarificationRenderer({
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
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-sky-400/50 dark:bg-sky-500/40" />

      {/* Content */}
      <div className="pl-3">
        {isActive && (
          <motion.div
            className="mb-2 flex items-center gap-1.5"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
              Clarifying
            </span>
          </motion.div>
        )}
        <div className="prose prose-sm max-w-none text-neutral-600 dark:prose-invert dark:text-neutral-300 prose-p:my-1 prose-p:leading-relaxed prose-ul:my-1 prose-li:my-0.5">
          <Markdown content={content} />
        </div>
      </div>
    </motion.div>
  );
}
