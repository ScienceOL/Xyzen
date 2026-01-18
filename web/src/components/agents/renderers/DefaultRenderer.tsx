/**
 * Default Renderer
 *
 * Fallback renderer for phases without a specialized component renderer.
 * Renders content as Markdown.
 */

import Markdown from "@/lib/Markdown";
import type { ComponentRendererProps } from "./registry";

/**
 * DefaultRenderer renders phase content as Markdown.
 * Used when no specialized renderer is registered for a component key.
 */
export default function DefaultRenderer({ phase }: ComponentRendererProps) {
  const content = phase.streamedContent || phase.outputSummary;

  if (!content) return null;

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-neutral-600 dark:text-neutral-400 max-h-64 overflow-y-auto">
      <Markdown content={content} />
    </div>
  );
}
