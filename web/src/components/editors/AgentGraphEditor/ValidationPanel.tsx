import type { ValidationIssue } from "@/types/graphConfig";
import {
  ExclamationTriangleIcon,
  XCircleIcon,
  ChevronDownIcon,
} from "@heroicons/react/16/solid";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";

interface ValidationPanelProps {
  issues: ValidationIssue[];
}

/**
 * Collapsible bar at the bottom of the graph canvas showing validation
 * errors (red) and warnings (amber). Clicking the summary toggles the
 * full issue list.
 */
function ValidationPanel({ issues }: ValidationPanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  // Determine bar colour based on severity
  const hasErrors = errors.length > 0;

  return (
    <div className="absolute bottom-3 left-1/2 z-40 w-[min(420px,calc(100%-24px))] -translate-x-1/2">
      <motion.div
        layout
        className={`overflow-hidden rounded-lg shadow-lg backdrop-blur-sm ${
          hasErrors
            ? "bg-red-50/95 dark:bg-red-950/80"
            : "bg-amber-50/95 dark:bg-amber-950/80"
        }`}
      >
        {/* Summary bar */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2"
        >
          {hasErrors ? (
            <XCircleIcon className="h-4 w-4 shrink-0 text-red-500" />
          ) : (
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" />
          )}
          <span
            className={`flex-1 text-left text-xs font-medium ${
              hasErrors
                ? "text-red-700 dark:text-red-300"
                : "text-amber-700 dark:text-amber-300"
            }`}
          >
            {errors.length > 0 &&
              t("agents.graphEditor.validation.errorCount", {
                count: errors.length,
              })}
            {errors.length > 0 && warnings.length > 0 && " · "}
            {warnings.length > 0 &&
              t("agents.graphEditor.validation.warningCount", {
                count: warnings.length,
              })}
          </span>
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 transition-transform ${
              expanded ? "rotate-180" : ""
            } ${
              hasErrors
                ? "text-red-400 dark:text-red-500"
                : "text-amber-400 dark:text-amber-500"
            }`}
          />
        </button>

        {/* Expanded issue list */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="custom-scrollbar max-h-40 overflow-y-auto border-t border-neutral-200/40 dark:border-white/10"
            >
              <ul className="space-y-0.5 px-3 py-2">
                {issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {issue.level === "error" ? (
                      <XCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    ) : (
                      <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span
                      className={`text-xs ${
                        issue.level === "error"
                          ? "text-red-700 dark:text-red-300"
                          : "text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {t(
                        `agents.graphEditor.validation.${issue.key}`,
                        issue.params ?? {},
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default memo(ValidationPanel);
