"use client";

import { cn } from "@/lib/utils";
import {
  knowledgeSetService,
  type KnowledgeSet,
} from "@/service/knowledgeSetService";
import { useXyzen } from "@/store";
import {
  BookOpenIcon,
  ChevronDownIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

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
  const {
    activeChatChannel,
    setKnowledgeContext,
    channels,
    agents,
    updateAgent,
  } = useXyzen();
  const [knowledgeSets, setKnowledgeSets] = useState<KnowledgeSet[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedKnowledgeSet, setSelectedKnowledgeSet] =
    useState<KnowledgeSet | null>(null);

  // Get current agent
  const currentAgent = activeChatChannel
    ? agents.find((a) => a.id === channels[activeChatChannel]?.agentId)
    : null;

  // Fetch knowledge sets when connected
  useEffect(() => {
    if (isConnected) {
      const fetchKnowledgeSets = async () => {
        try {
          const sets = await knowledgeSetService.listKnowledgeSets();
          setKnowledgeSets(sets);

          // Sync selection with agent
          if (currentAgent?.knowledge_set_id) {
            const boundSet = sets.find(
              (s) => s.id === currentAgent.knowledge_set_id,
            );
            if (boundSet) {
              setSelectedKnowledgeSet(boundSet);
            }
          }
        } catch (error) {
          console.error("Failed to fetch knowledge sets:", error);
        }
      };
      fetchKnowledgeSets();
    }
  }, [isConnected, currentAgent?.knowledge_set_id]);

  const handleSelect = async (ks: KnowledgeSet) => {
    setSelectedKnowledgeSet(ks);

    // Update local context (legacy/UI)
    if (activeChatChannel) {
      setKnowledgeContext(activeChatChannel, {
        folderId: ks.id,
        folderName: ks.name,
      });
    }

    // Update Agent
    if (currentAgent) {
      try {
        await updateAgent({ ...currentAgent, knowledge_set_id: ks.id });
      } catch (error) {
        console.error("Failed to bind knowledge set to agent:", error);
      }
    }

    setIsOpen(false);
  };

  const handleDisconnectClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedKnowledgeSet(null);

    // Unbind from Agent if just disconnecting the set, but keep MCP?
    // The prop onDisconnect usually disconnects the MCP server entirely.
    // If we just want to unbind the set, we should do it here.
    // But onDisconnect is passed from parent.
    // Let's assume onDisconnect handles the MCP level.
    // We should probably also clear the knowledge_set_id.

    if (currentAgent && currentAgent.knowledge_set_id) {
      try {
        await updateAgent({ ...currentAgent, knowledge_set_id: null });
      } catch (error) {
        console.error("Failed to unbind knowledge set from agent:", error);
      }
    }

    onDisconnect();
  };

  if (!isConnected) {
    return (
      <motion.button
        onClick={onConnect}
        className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="连接知识库"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">知识库</span>
      </motion.button>
    );
  }

  const displayName = selectedKnowledgeSet?.name || "选择知识库";

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <motion.div
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none",
          "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400",
          isOpen
            ? "shadow-md bg-indigo-100 dark:bg-indigo-900/30"
            : "shadow-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/30",
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <BookOpenIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left max-w-[100px] truncate">
          {displayName}
        </span>
        <ChevronDownIcon className="h-3 w-3 shrink-0" />

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
            className="absolute bottom-full left-0 mb-1 z-50 w-64 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="px-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                选择知识库
              </span>
            </div>

            <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-0.5">
              {knowledgeSets.length === 0 ? (
                <div className="px-2 py-4 text-xs text-neutral-400 text-center">
                  <p className="mb-1">暂无知识库</p>
                  <p className="text-[10px]">请先在知识库面板创建</p>
                </div>
              ) : (
                knowledgeSets.map((ks, index) => (
                  <motion.button
                    key={ks.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.2 }}
                    onClick={() => handleSelect(ks)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors text-left",
                      selectedKnowledgeSet?.id === ks.id
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 font-medium"
                        : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                    )}
                  >
                    <BookOpenIcon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 mt-0.5",
                        selectedKnowledgeSet?.id === ks.id
                          ? "text-indigo-500"
                          : "text-neutral-400",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{ks.name}</div>
                      {ks.description && (
                        <div className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                          {ks.description}
                        </div>
                      )}
                    </div>
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
