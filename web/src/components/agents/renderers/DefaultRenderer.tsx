/**
 * Default Renderer
 *
 * Fallback renderer for phases without a specialized component renderer.
 * Minimal, content-focused design.
 */

import Markdown from "@/lib/Markdown";
import { motion } from "framer-motion";
import type { ComponentRendererProps } from "./registry";

/**
 * DefaultRenderer renders phase content as Markdown.
 * Used when no specialized renderer is registered for a component key.
 */
export default function DefaultRenderer({
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
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700" />

      {/* Content */}
      <div className="pl-3">
        {isActive && (
          <motion.div
            className="mb-2 flex items-center gap-1.5"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
              Processing
            </span>
          </motion.div>
        )}
        <div className="max-h-56 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-700">
          <div className="prose prose-sm max-w-none text-neutral-600 dark:prose-invert dark:text-neutral-300 prose-p:my-1 prose-p:leading-relaxed">
            <Markdown content={content} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
