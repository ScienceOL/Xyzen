import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface AgentTimelineProps {
  children: ReactNode;
  className?: string;
}

/**
 * AgentTimeline provides a minimal vertical timeline container.
 * Subtle styling to keep focus on content.
 */
export default function AgentTimeline({
  children,
  className = "",
}: AgentTimelineProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`relative ${className}`}
    >
      {/* Subtle vertical line - very light to not distract */}
      <div
        className="absolute left-[9px] top-5 bottom-5 w-px bg-neutral-100 dark:bg-neutral-800"
        aria-hidden="true"
      />

      {/* Timeline items container */}
      <div className="relative space-y-0.5">{children}</div>
    </motion.div>
  );
}
