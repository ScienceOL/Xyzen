/**
 * Research Brief Renderer
 *
 * Minimal design for research brief content.
 * Clean, content-focused with subtle accents.
 */

import Markdown from "@/lib/Markdown";
import { motion } from "framer-motion";
import type { ComponentRendererProps } from "../registry";

/**
 * ResearchBriefRenderer displays the research brief with minimal styling.
 */
export default function ResearchBriefRenderer({
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
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-amber-400/50 dark:bg-amber-500/40" />

      {/* Content */}
      <div className="pl-3">
        {isActive && (
          <motion.div
            className="mb-2 flex items-center gap-1.5"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Generating Brief
            </span>
          </motion.div>
        )}
        <div className="prose prose-sm max-w-none text-neutral-600 dark:prose-invert dark:text-neutral-300 prose-headings:text-neutral-700 prose-headings:dark:text-neutral-200 prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-p:my-1 prose-p:leading-relaxed">
          <Markdown content={content} />
        </div>
      </div>
    </motion.div>
  );
}
