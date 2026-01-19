/**
 * Final Report Renderer
 *
 * Clean presentation for the final research report.
 * Content-focused with minimal decoration.
 */

import Markdown from "@/lib/Markdown";
import { motion } from "framer-motion";
import type { ComponentRendererProps } from "../registry";

/**
 * FinalReportRenderer displays the research report with clean styling.
 */
export default function FinalReportRenderer({
  phase,
  isActive,
}: ComponentRendererProps) {
  const content = phase.streamedContent || phase.outputSummary;

  if (!content) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      {/* Subtle left accent */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-emerald-400/50 dark:bg-emerald-500/40" />

      {/* Content */}
      <div className="pl-3">
        {isActive && (
          <motion.div
            className="mb-2 flex items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Writing Report
            </span>
          </motion.div>
        )}
        <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-700">
          <div className="prose prose-sm max-w-none text-neutral-700 dark:prose-invert dark:text-neutral-200 prose-headings:font-medium prose-headings:text-neutral-800 prose-headings:dark:text-neutral-100 prose-h1:mb-2 prose-h1:mt-4 prose-h1:text-base prose-h1:first:mt-0 prose-h2:mb-1.5 prose-h2:mt-3 prose-h2:text-[15px] prose-h3:mb-1 prose-h3:mt-2 prose-h3:text-sm prose-p:my-1.5 prose-p:leading-relaxed prose-ul:my-1.5 prose-li:my-0.5">
            <Markdown content={content} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
