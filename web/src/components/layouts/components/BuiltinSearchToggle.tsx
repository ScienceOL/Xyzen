"use client";

import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { motion } from "motion/react";
import { useState } from "react";

interface BuiltinSearchToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  supportsWebSearch: boolean;
}

export function BuiltinSearchToggle({
  enabled,
  onToggle,
  supportsWebSearch,
}: BuiltinSearchToggleProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Only show for models that support web search
  if (!supportsWebSearch) {
    return null;
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <motion.button
        onClick={() => onToggle(!enabled)}
        className={`flex w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
          enabled
            ? "bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 shadow-sm"
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        title={enabled ? "Built-in Search: 已启用" : "Built-in Search: 已禁用"}
      >
        <GlobeAltIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">
          联网搜索
        </span>
        <div
          className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-blue-500" : "bg-neutral-400"}`}
        />
      </motion.button>

      {/* Tooltip */}
      {showTooltip && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 p-3"
        >
          <div className="flex items-start gap-2">
            <GlobeAltIcon className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                内置搜索
              </div>
              <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                {enabled
                  ? "已启用：模型可以实时搜索互联网获取最新信息"
                  : "已禁用：点击启用模型内置实时搜索功能"}
              </div>
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-6 -translate-x-1/2 border-4 border-transparent border-t-white dark:border-t-neutral-900"></div>
        </motion.div>
      )}
    </div>
  );
}
