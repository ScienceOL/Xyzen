import type { ReactNode } from "react";

interface AgentTimelineProps {
  children: ReactNode;
  className?: string;
}

/**
 * AgentTimeline provides a vertical timeline container with a dashed line
 * connecting child step items. Used to display agent execution phases.
 */
export default function AgentTimeline({
  children,
  className = "",
}: AgentTimelineProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Vertical dashed line - positioned to align with step indicators */}
      <div
        className="absolute left-[11px] top-4 bottom-4 w-px border-l border-dashed border-neutral-300 dark:border-neutral-600"
        aria-hidden="true"
      />

      {/* Timeline items container */}
      <div className="relative space-y-1">{children}</div>
    </div>
  );
}
