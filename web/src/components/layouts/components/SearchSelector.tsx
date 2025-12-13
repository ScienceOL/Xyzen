"use client";

import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import type { McpServer } from "@/types/mcp";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface SearchSelectorProps {
  searchServers: McpServer[];
  currentSearchServerId?: string | null;
  onSearchServerChange: (serverId: string | null) => void;
}

export function SearchSelector({
  searchServers,
  currentSearchServerId,
  onSearchServerChange,
}: SearchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Find current selection
  const currentServer = useMemo(() => {
    if (!currentSearchServerId) return null;
    return searchServers.find((s) => s.id === currentSearchServerId) || null;
  }, [currentSearchServerId, searchServers]);

  // Get servers with online status first
  const sortedServers = useMemo(() => {
    return [...searchServers].sort((a, b) => {
      if (a.status === "online" && b.status !== "online") return -1;
      if (a.status !== "online" && b.status === "online") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [searchServers]);

  const getSearchEngineBgColor = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("google")) {
      return "bg-blue-500/10 dark:bg-blue-500/20";
    }
    if (lowerName.includes("duckduckgo")) {
      return "bg-orange-500/10 dark:bg-orange-500/20";
    }
    if (lowerName.includes("bing")) {
      return "bg-cyan-500/10 dark:bg-cyan-500/20";
    }
    return "bg-green-500/10 dark:bg-green-500/20";
  };

  const getSearchEngineTextColor = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("google")) {
      return "text-blue-700 dark:text-blue-400";
    }
    if (lowerName.includes("duckduckgo")) {
      return "text-orange-700 dark:text-orange-400";
    }
    if (lowerName.includes("bing")) {
      return "text-cyan-700 dark:text-cyan-400";
    }
    return "text-green-700 dark:text-green-400";
  };

  const getSearchEngineDotColor = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("google")) {
      return "bg-blue-500";
    }
    if (lowerName.includes("duckduckgo")) {
      return "bg-orange-500";
    }
    if (lowerName.includes("bing")) {
      return "bg-cyan-500";
    }
    return "bg-green-500";
  };

  const handleServerClick = (serverId: string | null) => {
    onSearchServerChange(serverId);
    setIsOpen(false);
  };

  if (searchServers.length === 0) {
    return (
      <button
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="无可用搜索引擎"
      >
        <MagnifyingGlassIcon className="h-3.5 w-3.5" />
        <span>未设置</span>
      </button>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* Main Trigger Button */}
      <motion.button
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
          currentServer
            ? `${getSearchEngineBgColor(currentServer.name)} ${getSearchEngineTextColor(currentServer.name)}`
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
        } ${isOpen ? "shadow-md" : "shadow-sm"}`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[140px] truncate">
          {currentServer?.name || "选择搜索"}
        </span>
        <ChevronDownIcon
          className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </motion.button>

      {/* Hover Dropdown - Search Engine List */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full left-0 mb-1 z-50 w-[280px] rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 p-2"
          >
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              选择搜索引擎
            </div>

            {/* None Option */}
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0, duration: 0.2 }}
              onClick={() => handleServerClick(null)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                !currentSearchServerId
                  ? "bg-neutral-200 dark:bg-neutral-700"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 shrink-0 rounded-full bg-neutral-400" />
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  无搜索
                </span>
              </div>
            </motion.button>

            {/* Search Server List */}
            <div
              className="mt-1 space-y-1 overflow-y-auto custom-scrollbar"
              style={{ maxHeight: "min(400px, 60vh)" }}
            >
              {sortedServers.map((server, index) => (
                <motion.button
                  key={server.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (index + 1) * 0.03, duration: 0.2 }}
                  onClick={() => handleServerClick(server.id)}
                  disabled={server.status !== "online"}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    currentSearchServerId === server.id
                      ? `${getSearchEngineBgColor(server.name)} ${getSearchEngineTextColor(server.name)}`
                      : server.status === "online"
                        ? "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        : "opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        server.status === "online"
                          ? getSearchEngineDotColor(server.name)
                          : "bg-red-500"
                      }`}
                    />
                    <div className="min-w-0 flex-1 text-left">
                      <div className="font-medium truncate">{server.name}</div>
                      {server.description && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                          {server.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {server.tools && server.tools.length > 0 && (
                      <span className="text-xs text-neutral-400">
                        {server.tools.length} 工具
                      </span>
                    )}
                    {server.status !== "online" && (
                      <span className="text-xs text-red-500">离线</span>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
