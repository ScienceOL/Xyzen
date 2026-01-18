/**
 * Supervisor Renderer
 *
 * Renders the research supervisor phase output.
 * Shows research progress with iteration info and current action.
 */

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Markdown from "@/lib/Markdown";
import type { ComponentRendererProps } from "../registry";

/**
 * SupervisorRenderer displays the research supervisor's progress,
 * including the current action and accumulated notes.
 */
export default function SupervisorRenderer({
  phase,
  isActive,
}: ComponentRendererProps) {
  const content = phase.streamedContent || phase.outputSummary;

  if (!content) return null;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
        <MagnifyingGlassIcon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {isActive ? "Researching..." : "Research Progress"}
        </span>
        {isActive && (
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-purple-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30 p-3 max-h-48 overflow-y-auto">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 text-neutral-600 dark:text-neutral-400">
          <Markdown content={content} />
        </div>
      </div>
    </div>
  );
}
