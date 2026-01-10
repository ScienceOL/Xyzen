import { motion } from "framer-motion";
import type { PhaseExecution } from "@/types/agentEvents";

interface AgentProgressBarProps {
  percent: number;
  phases?: PhaseExecution[];
}

/**
 * AgentProgressBar displays an animated progress bar with optional phase indicators.
 */
export default function AgentProgressBar({
  percent,
  phases = [],
}: AgentProgressBarProps) {
  // Calculate phase positions if phases are provided
  const phaseCount = phases.length;
  const completedPhases = phases.filter(
    (p) => p.status === "completed" || p.status === "skipped",
  ).length;
  const runningPhase = phases.findIndex((p) => p.status === "running");

  // Use phase-based progress if phases exist, otherwise use percent
  const displayPercent =
    phaseCount > 0
      ? Math.min(
          100,
          ((completedPhases + (runningPhase >= 0 ? 0.5 : 0)) / phaseCount) *
            100,
        )
      : percent;

  return (
    <div className="relative">
      {/* Background track */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/30">
        {/* Animated progress fill */}
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-400"
          initial={{ width: 0 }}
          animate={{ width: `${displayPercent}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />

        {/* Shimmer effect on the progress bar */}
        <motion.div
          className="absolute inset-0 h-full w-8 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          style={{ left: `${Math.max(0, displayPercent - 10)}%` }}
          animate={{
            opacity:
              displayPercent > 0 && displayPercent < 100 ? [0.3, 0.7, 0.3] : 0,
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Phase dots (if phases exist) */}
      {phaseCount > 1 && (
        <div className="absolute inset-x-0 top-0 flex h-1.5 items-center justify-between px-0.5">
          {phases.map((phase, index) => {
            const position = ((index + 1) / phaseCount) * 100;
            return (
              <motion.div
                key={phase.id}
                className={`h-2 w-2 rounded-full border-2 ${
                  phase.status === "completed"
                    ? "border-blue-500 bg-blue-500"
                    : phase.status === "running"
                      ? "border-blue-500 bg-white dark:bg-neutral-800"
                      : phase.status === "failed"
                        ? "border-red-500 bg-red-500"
                        : "border-blue-200 bg-white dark:border-blue-800 dark:bg-neutral-800"
                }`}
                style={{
                  position: "absolute",
                  left: `calc(${position}% - 4px)`,
                }}
                initial={{ scale: 0.8 }}
                animate={{
                  scale: phase.status === "running" ? [1, 1.2, 1] : 1,
                }}
                transition={
                  phase.status === "running"
                    ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}

      {/* Percentage text */}
      {displayPercent > 0 && (
        <div className="absolute right-0 -top-4 text-xs text-blue-600 dark:text-blue-400">
          {Math.round(displayPercent)}%
        </div>
      )}
    </div>
  );
}
