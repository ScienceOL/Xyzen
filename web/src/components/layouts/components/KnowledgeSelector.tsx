"use client";

import { useEffect, useState } from "react";
import {
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  XMarkIcon,
  ArchiveBoxXMarkIcon,
} from "@heroicons/react/24/outline";
import { useXyzen } from "@/store";
import { folderService, type Folder } from "@/service/folderService";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";

interface KnowledgeSelectorProps {
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function KnowledgeSelector({
  isConnected,
  onConnect,
  onDisconnect,
}: KnowledgeSelectorProps) {
  const { activeChatChannel, channels, setKnowledgeContext } = useXyzen();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const activeChannel = activeChatChannel ? channels[activeChatChannel] : null;
  const currentFolderId = activeChannel?.knowledgeContext?.folderId;
  const currentFolderName =
    activeChannel?.knowledgeContext?.folderName || "知识库";

  useEffect(() => {
    if (isConnected) {
      const fetchFolders = async () => {
        try {
          const roots = await folderService.listFolders(null);
          setFolders(roots);
        } catch (error) {
          console.error("Failed to fetch root folders for selector:", error);
        }
      };
      fetchFolders();
    }
  }, [isConnected]);

  const handleSelect = (folder: Folder | null) => {
    if (!activeChatChannel) return;

    if (folder) {
      setKnowledgeContext(activeChatChannel, {
        folderId: folder.id,
        folderName: folder.name,
      });
    } else {
      setKnowledgeContext(activeChatChannel, null);
    }
    setIsOpen(false);
  };

  const handleDisconnectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDisconnect();
  };

  if (!isConnected) {
    return (
      <motion.button
        onClick={onConnect}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="连接知识库"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        <span>知识库</span>
      </motion.button>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <motion.div
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-default select-none",
          "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400",
          isOpen
            ? "shadow-md bg-indigo-100 dark:bg-indigo-900/30"
            : "shadow-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/30",
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {currentFolderId ? (
          <FolderOpenIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <FolderIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="max-w-[100px] truncate">{currentFolderName}</span>

        <div
          role="button"
          onClick={handleDisconnectClick}
          className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors cursor-pointer text-indigo-600 dark:text-indigo-400"
          title="断开连接"
        >
          <XMarkIcon className="h-3 w-3" />
        </div>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full left-0 mb-1 z-50 w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="px-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                选择文件夹
              </span>
            </div>

            <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-0.5">
              {/* Clear / Root Option */}
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0, duration: 0.2 }}
                onClick={() => handleSelect(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors text-left",
                  !currentFolderId
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 font-medium"
                    : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                )}
              >
                <ArchiveBoxXMarkIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">无上下文</span>
              </motion.button>

              {folders.length === 0 && (
                <div className="px-2 py-2 text-xs text-neutral-400 text-center">
                  无文件夹
                </div>
              )}

              {folders.map((folder, index) => (
                <motion.button
                  key={folder.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (index + 1) * 0.03, duration: 0.2 }}
                  onClick={() => handleSelect(folder)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors text-left",
                    currentFolderId === folder.id
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 font-medium"
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                  )}
                >
                  <FolderIcon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      currentFolderId === folder.id
                        ? "text-indigo-500"
                        : "text-neutral-400",
                    )}
                  />
                  <span className="truncate">{folder.name}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
