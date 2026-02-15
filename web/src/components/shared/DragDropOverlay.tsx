import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export interface DragDropOverlayProps {
  isVisible: boolean;
  title?: string;
  subtitle?: string;
  maxFiles?: number;
  canAddMore?: boolean;
  className?: string;
}

/**
 * Reusable overlay component shown when files are being dragged over a drop zone.
 * Designed to blend with the chat input card aesthetic.
 */
export function DragDropOverlay({
  isVisible,
  title,
  subtitle,
  maxFiles,
  canAddMore = true,
  className,
}: DragDropOverlayProps) {
  const { t } = useTranslation();

  const titleText = title || t("app.dragDrop.dropHere");
  const subtitleText =
    subtitle ||
    (canAddMore
      ? maxFiles
        ? t("app.dragDrop.maxFiles", { count: maxFiles })
        : t("app.dragDrop.dropFiles")
      : t("app.dragDrop.maxReached"));

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={clsx(
            "absolute inset-0 z-50 flex items-center justify-center",
            "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm",
            "border-2 border-dashed",
            canAddMore
              ? "border-orange-300 dark:border-orange-700"
              : "border-red-300 dark:border-red-700",
            className,
          )}
        >
          <div className="flex flex-col items-center gap-1.5 pointer-events-none">
            <motion.div
              initial={{ y: 4 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <svg
                className={clsx(
                  "h-7 w-7",
                  canAddMore
                    ? "text-orange-400 dark:text-orange-500"
                    : "text-red-400 dark:text-red-500",
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
                />
              </svg>
            </motion.div>
            <p
              className={clsx(
                "text-sm font-medium",
                canAddMore
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {titleText}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {subtitleText}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
