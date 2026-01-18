/**
 * Final Report Renderer
 *
 * Renders the final research report with enhanced formatting.
 * Shows the comprehensive report with proper structure.
 */

import { DocumentChartBarIcon } from "@heroicons/react/24/outline";
import Markdown from "@/lib/Markdown";
import type { ComponentRendererProps } from "../registry";

/**
 * FinalReportRenderer displays the final research report
 * with enhanced formatting and a distinct visual style.
 */
export default function FinalReportRenderer({
  phase,
  isActive,
}: ComponentRendererProps) {
  const content = phase.streamedContent || phase.outputSummary;

  if (!content) return null;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <DocumentChartBarIcon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {isActive ? "Writing Report..." : "Research Report"}
        </span>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 p-3 max-h-96 overflow-y-auto">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-h1:mt-4 prose-h1:first:mt-0 prose-h2:mt-3 prose-h3:mt-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5">
          <Markdown content={content} />
        </div>
      </div>
    </div>
  );
}
