/**
 * Clarification Renderer
 *
 * Renders the clarification phase output with a distinct UI.
 * Shows clarification questions or follow-up responses.
 */

import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import Markdown from "@/lib/Markdown";
import type { ComponentRendererProps } from "../registry";

/**
 * ClarificationRenderer displays clarification questions or follow-up responses
 * with a distinctive UI that makes it clear the agent is asking for input.
 */
export default function ClarificationRenderer({
  phase,
  isActive,
}: ComponentRendererProps) {
  const content = phase.streamedContent || phase.outputSummary;

  if (!content) return null;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
        <QuestionMarkCircleIcon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {isActive ? "Clarifying..." : "Clarification"}
        </span>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 p-3">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1">
          <Markdown content={content} />
        </div>
      </div>
    </div>
  );
}
