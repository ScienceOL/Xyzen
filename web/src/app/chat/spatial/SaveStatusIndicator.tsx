/**
 * SaveStatusIndicator - Shows auto-save status in the top-right corner
 */
import {
  CheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  onRetry?: () => void;
}

export function SaveStatusIndicator({
  status,
  onRetry,
}: SaveStatusIndicatorProps) {
  if (status === "idle") return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="fixed top-20 right-4 z-50"
      >
        {status === "saving" && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 shadow-sm">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-4 h-4 border-2 border-neutral-300 dark:border-neutral-600 border-t-indigo-500 rounded-full"
            />
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Saving...
            </span>
          </div>
        )}

        {status === "saved" && (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 shadow-sm"
          >
            <CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">
              Saved
            </span>
          </motion.div>
        )}

        {status === "failed" && (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 shadow-sm cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
            onClick={onRetry}
          >
            <ExclamationTriangleIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium text-red-700 dark:text-red-400">
              Failed - Click to retry
            </span>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
