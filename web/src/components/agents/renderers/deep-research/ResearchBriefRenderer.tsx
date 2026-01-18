/**
 * Research Brief Renderer
 *
 * Renders the research brief phase output in a card format.
 * Shows the structured research objectives and scope.
 */

import { DocumentTextIcon } from "@heroicons/react/24/outline";
import Markdown from "@/lib/Markdown";
import type { ComponentRendererProps } from "../registry";

/**
 * ResearchBriefRenderer displays the generated research brief
 * in a card format with clear visual distinction.
 */
export default function ResearchBriefRenderer({
  phase,
  isActive,
}: ComponentRendererProps) {
  const content = phase.streamedContent || phase.outputSummary;

  if (!content) return null;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <DocumentTextIcon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {isActive ? "Generating Brief..." : "Research Brief"}
        </span>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 p-3">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-p:my-1">
          <Markdown content={content} />
        </div>
      </div>
    </div>
  );
}
