/**
 * GroupNode — collapsible container for non-CEO parent agents ("ministers").
 *
 * Expanded: semi-transparent container with dashed indigo border + header bar.
 * Collapsed: compact indigo-tinted card showing avatar, name, child count, stacked avatars.
 */
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { GROUP_HEADER_HEIGHT } from "./constants";
import type { GroupFlowNodeProps } from "./types";

export const GroupNode = memo(function GroupNode({
  id,
  data,
}: GroupFlowNodeProps) {
  const { t } = useTranslation();
  const { isExpanded, name, avatar, childCount, childAvatars, onToggleExpand } =
    data;

  if (!isExpanded) {
    // Collapsed — compact card (indigo accent)
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.02 }}
        transition={{
          scale: { type: "spring", stiffness: 400, damping: 25 },
          opacity: { duration: 0.2 },
        }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand(id);
        }}
        className={cn(
          "relative cursor-pointer select-none rounded-lg px-4 py-3",
          "bg-indigo-50/80 dark:bg-indigo-950/30",
          "border border-indigo-300/40 dark:border-indigo-700/40",
          "shadow-sm hover:shadow-md transition-shadow",
        )}
        style={{ width: 280 }}
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <img
            src={avatar}
            alt={name}
            className="h-8 w-8 shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900/40 object-cover"
          />

          {/* Name + count */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-indigo-900 dark:text-indigo-200">
              {name}
            </div>
            <div className="text-xs text-indigo-500 dark:text-indigo-400">
              {t("agents.group.agents", { count: childCount })}
            </div>
          </div>

          {/* Child avatar stack */}
          {childAvatars.length > 0 && (
            <div className="flex -space-x-2">
              {childAvatars.slice(0, 3).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="h-6 w-6 rounded-full border-2 border-indigo-50 dark:border-indigo-950 object-cover"
                />
              ))}
              {childAvatars.length > 3 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-indigo-50 bg-indigo-200 text-[10px] font-medium text-indigo-700 dark:border-indigo-950 dark:bg-indigo-800 dark:text-indigo-300">
                  +{childAvatars.length - 3}
                </div>
              )}
            </div>
          )}

          {/* Expand chevron */}
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-indigo-400 dark:text-indigo-500" />
        </div>
      </motion.div>
    );
  }

  // Expanded — transparent container + header bar
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative rounded-lg",
        "bg-indigo-50/30 dark:bg-indigo-950/10",
        "border border-dashed border-indigo-300/40 dark:border-indigo-700/30",
      )}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Header bar */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand(id);
        }}
        className={cn(
          "flex cursor-pointer select-none items-center gap-3 rounded-t-lg px-4",
          "bg-indigo-100/50 dark:bg-indigo-900/20",
          "border-b border-indigo-200/40 dark:border-indigo-800/30",
          "hover:bg-indigo-100/70 dark:hover:bg-indigo-900/30 transition-colors",
        )}
        style={{ height: GROUP_HEADER_HEIGHT }}
      >
        <img
          src={avatar}
          alt={name}
          className="h-7 w-7 shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900/40 object-cover"
        />
        <div className="min-w-0 flex-1">
          <span className="truncate text-[13px] font-semibold text-indigo-900 dark:text-indigo-200">
            {name}
          </span>
          <span className="ml-2 text-xs text-indigo-500 dark:text-indigo-400">
            {t("agents.group.agents", { count: childCount })}
          </span>
        </div>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-indigo-400 dark:text-indigo-500" />
      </div>
    </motion.div>
  );
});
