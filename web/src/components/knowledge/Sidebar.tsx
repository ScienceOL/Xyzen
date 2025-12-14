import { fileService } from "@/service/fileService";
import {
  ChevronDownIcon,
  DocumentIcon,
  DocumentTextIcon,
  FolderIcon,
  HomeIcon,
  MicrophoneIcon,
  PhotoIcon,
  PlusIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { KnowledgeTab } from "./types";

interface SidebarProps {
  activeTab: KnowledgeTab;
  onTabChange: (tab: KnowledgeTab) => void;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const [stats, setStats] = useState({
    total_size: 0,
    total_files: 0,
    total_size_mb: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await fileService.getStorageStats();
        // @ts-expect-error - The response type might need update in service definition
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch storage stats", error);
      }
    };
    fetchStats();
  }, []);

  const navItems = [
    { id: "home", label: "Home", icon: HomeIcon },
    { type: "divider" },
    { id: "all", label: "All", icon: FolderIcon },
    { id: "documents", label: "Documents", icon: DocumentTextIcon },
    { id: "pages", label: "Pages", icon: DocumentIcon },
    { id: "images", label: "Images", icon: PhotoIcon },
    { id: "audio", label: "Audio", icon: MicrophoneIcon },
    { id: "videos", label: "Videos", icon: VideoCameraIcon },
  ];

  // Hardcoded total limit for demo (e.g. 100MB)
  const TOTAL_LIMIT = 100 * 1024 * 1024;
  const usagePercent = Math.min((stats.total_size / TOTAL_LIMIT) * 100, 100);

  return (
    <div className="flex w-64 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50">
      {/* Header */}
      <div className="p-4">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
          Knowledge Base
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Manage your knowledge for work, study, and life.
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 overflow-y-auto">
        {navItems.map((item, idx) => {
          if (item.type === "divider") {
            return (
              <div
                key={`divider-${idx}`}
                className="my-2 h-px bg-neutral-200 dark:bg-neutral-800"
              />
            );
          }

          const Icon = item.icon!;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id as KnowledgeTab)}
              className={`group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white text-indigo-600 shadow-sm dark:bg-neutral-800 dark:text-indigo-400"
                  : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${
                  isActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-neutral-400 group-hover:text-neutral-500 dark:text-neutral-500 dark:group-hover:text-neutral-400"
                }`}
              />
              {item.label}
            </button>
          );
        })}

        {/* Knowledge Base Section (Placeholder) */}
        <div className="mt-6 relative">
          <div className="flex w-full items-center justify-between px-3 py-2">
            <button className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200">
              <ChevronDownIcon className="h-3 w-3" />
              Knowledge Base
            </button>
            <button className="rounded-full p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors">
              <PlusIcon className="h-4 w-4 text-neutral-500 hover:text-indigo-600 dark:text-neutral-400 dark:hover:text-indigo-400" />
            </button>
          </div>

          <div className="relative ml-5 mt-1 pl-4">
            {/* Text */}
            <div className="py-2 text-xs text-neutral-400 italic">
              Click + to add a knowledge base
            </div>

            {/* Dotted line decoration
                 The idea is a line starting from "Click +...", going left, then up to the "+" button.
                 We need to position this carefully.
             */}
            <div className="absolute -left-px top-[-20px] bottom-3 w-4 rounded-bl-xl border-b border-l border-dashed border-neutral-300 dark:border-neutral-700 pointer-events-none" />
            {/* Adjusting top/bottom to connect properly.
                 The "Plus" button is in the row above.
                 The text is below.
                 The line should go from the text (bottom-left) up to the header row.
             */}
          </div>
        </div>
      </nav>

      {/* Footer Stats */}
      <div className="border-t border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-black">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-neutral-600 dark:text-neutral-400">
            File storage
          </span>
          <span className="text-neutral-900 dark:text-neutral-200">
            {formatSize(stats.total_size)}{" "}
            <span className="text-neutral-400">
              / {formatSize(TOTAL_LIMIT)}
            </span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${usagePercent}%` }}
            className="h-full bg-neutral-900 dark:bg-neutral-200"
          />
        </div>

        <div className="mt-3 mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-neutral-600 dark:text-neutral-400">
            Embedding storage
          </span>
          <span className="text-neutral-900 dark:text-neutral-200">
            0 <span className="text-neutral-400">/ 100</span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div className="h-full w-0 bg-indigo-500" />
        </div>
      </div>
    </div>
  );
};
