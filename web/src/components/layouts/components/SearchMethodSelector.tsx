"use client";

import { GlobeAltIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { motion } from "motion/react";
import { useState } from "react";

export type SearchMethod = "none" | "builtin" | "searxng";

interface SearchMethodSelectorProps {
  method: SearchMethod;
  onMethodChange: (method: SearchMethod) => void;
  supportsBuiltinSearch: boolean;
  mcpEnabled: boolean;
  onMcpConflict?: () => void;
}

export function SearchMethodSelector({
  method,
  onMethodChange,
  supportsBuiltinSearch,
  mcpEnabled,
  onMcpConflict,
}: SearchMethodSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleMethodSelect = (newMethod: SearchMethod) => {
    // If selecting builtin search while MCP is enabled, warn about conflict
    if (newMethod === "builtin" && mcpEnabled) {
      onMcpConflict?.();
      // Still allow selection - the parent should handle disconnecting MCP
    }
    onMethodChange(newMethod);
    setShowDropdown(false);
  };

  const getMethodLabel = () => {
    switch (method) {
      case "builtin":
        return "内置搜索";
      case "searxng":
        return "通用搜索";
      case "none":
      default:
        return "搜索";
    }
  };

  const getMethodIcon = () => {
    switch (method) {
      case "builtin":
        return <GlobeAltIcon className="h-3.5 w-3.5 shrink-0" />;
      case "searxng":
        return <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0" />;
      case "none":
      default:
        return <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0" />;
    }
  };

  const getStatusColor = () => {
    switch (method) {
      case "builtin":
        return "bg-blue-500";
      case "searxng":
        return "bg-emerald-500";
      case "none":
      default:
        return "bg-neutral-400";
    }
  };

  const getButtonStyle = () => {
    if (method === "builtin") {
      return "bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 shadow-sm";
    }
    if (method === "searxng") {
      return "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 shadow-sm";
    }
    return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <motion.button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${getButtonStyle()}`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {getMethodIcon()}
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">
          {getMethodLabel()}
        </span>
        <div className={`h-1.5 w-1.5 rounded-full ${getStatusColor()}`} />
      </motion.button>

      {/* Tooltip and Dropdown Menu */}
      {(showTooltip || showDropdown) && (
        <>
          {/* Backdrop to close dropdown */}
          {showDropdown && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
          )}
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute bottom-full left-0 z-50 w-56 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden"
          >
            {/* Off option */}
            <button
              onClick={() => handleMethodSelect("none")}
              className={`w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors ${
                method === "none"
                  ? "bg-neutral-100 dark:bg-neutral-800"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              }`}
            >
              <MagnifyingGlassIcon className="h-4 w-4 text-neutral-400" />
              <div className="flex-1">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  关闭
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  不使用搜索功能
                </div>
              </div>
              {method === "none" && (
                <div className="h-2 w-2 rounded-full bg-neutral-400" />
              )}
            </button>

            {/* Divider */}
            <div className="border-t border-neutral-200 dark:border-neutral-700" />

            {/* Built-in Search option */}
            <button
              onClick={() => handleMethodSelect("builtin")}
              disabled={!supportsBuiltinSearch || mcpEnabled}
              className={`w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors ${
                method === "builtin"
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : !supportsBuiltinSearch || mcpEnabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              }`}
            >
              <GlobeAltIcon className="h-4 w-4 text-blue-500" />
              <div className="flex-1">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  内置搜索
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {!supportsBuiltinSearch
                    ? "当前模型不支持"
                    : mcpEnabled
                      ? "与 MCP 工具冲突，不可使用"
                      : "使用模型原生搜索能力"}
                </div>
              </div>
              {method === "builtin" && (
                <div className="h-2 w-2 rounded-full bg-blue-500" />
              )}
            </button>

            {/* SearXNG Search option */}
            <button
              onClick={() => handleMethodSelect("searxng")}
              className={`w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors ${
                method === "searxng"
                  ? "bg-emerald-50 dark:bg-emerald-900/20"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              }`}
            >
              <MagnifyingGlassIcon className="h-4 w-4 text-emerald-500" />
              <div className="flex-1">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  通用搜索
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  使用通用搜索引擎进行搜索
                </div>
              </div>
              {method === "searxng" && (
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
              )}
            </button>
          </motion.div>
        </>
      )}
    </div>
  );
}
