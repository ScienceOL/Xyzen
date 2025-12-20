import { folderService, type Folder } from "@/service/folderService";
import {
  ClockIcon,
  DocumentIcon,
  FolderIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import type { KnowledgeTab } from "./types";

interface SidebarProps {
  activeTab: KnowledgeTab;
  currentFolderId: string | null;
  onTabChange: (tab: KnowledgeTab, folderId?: string | null) => void;
  refreshTrigger?: number;
  onCreateRootFolder: () => void;
}

const SidebarComp = ({
  activeTab,
  currentFolderId,
  onTabChange,
  refreshTrigger,
  onCreateRootFolder,
}: SidebarProps) => {
  const [rootFolders, setRootFolders] = useState<Folder[]>([]);

  useEffect(() => {
    const fetchRootFolders = async () => {
      try {
        const folders = await folderService.listFolders(null);
        setRootFolders(folders);
      } catch (error) {
        console.error("Failed to fetch root folders", error);
      }
    };
    fetchRootFolders();
  }, [refreshTrigger]);

  const navGroups = [
    {
      title: "Favorites",
      items: [
        { id: "home", label: "Recents", icon: ClockIcon },
        { id: "all", label: "All Files", icon: DocumentIcon },
      ],
    },
    {
      title: "Media",
      items: [
        { id: "images", label: "Images", icon: PhotoIcon },
        { id: "documents", label: "Documents", icon: DocumentIcon },
      ],
    },
  ];

  return (
    <div className="flex h-full w-56 flex-col border-r border-neutral-200 bg-neutral-100/80 pt-4 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/80">
      {/* Navigation */}
      <nav className="flex-1 space-y-6 px-3 overflow-y-auto custom-scrollbar">
        {/* Static Groups */}
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            <h3 className="mb-1 px-2 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
              {group.title}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id as KnowledgeTab)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-neutral-300/50 text-neutral-900 dark:bg-white/10 dark:text-white"
                        : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-neutral-500 dark:text-neutral-400"}`}
                    />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Dynamic Knowledge Section */}
        <div>
          <div className="mb-1 flex items-center justify-between px-2 pr-1">
            <h3 className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
              Knowledge
            </h3>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateRootFolder();
              }}
              className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              title="New Root Folder"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {rootFolders.map((folder) => {
              // Active if we are in "folders" tab AND the current folder ID matches
              const isActive =
                activeTab === "folders" && currentFolderId === folder.id;

              return (
                <button
                  key={folder.id}
                  onClick={() => onTabChange("folders", folder.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors group ${
                    isActive
                      ? "bg-neutral-300/50 text-neutral-900 dark:bg-white/10 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
                  }`}
                >
                  <FolderIcon
                    className={`h-4 w-4 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-neutral-400 group-hover:text-neutral-500"}`}
                  />
                  <span className="truncate">{folder.name}</span>
                </button>
              );
            })}
            {rootFolders.length === 0 && (
              <div className="px-2 py-1 text-xs text-neutral-400 italic">
                No folders
              </div>
            )}
          </div>
        </div>

        {/* Locations */}
        <div>
          <h3 className="mb-1 px-2 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
            Locations
          </h3>
          <div className="space-y-0.5">
            <button
              onClick={() => onTabChange("trash")}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                activeTab === "trash"
                  ? "bg-neutral-300/50 text-neutral-900 dark:bg-white/10 dark:text-white"
                  : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
              }`}
            >
              <TrashIcon
                className={`h-4 w-4 ${activeTab === "trash" ? "text-red-500" : "text-neutral-500 dark:text-neutral-400"}`}
              />
              Trash
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
};

export const Sidebar = React.memo(SidebarComp);
