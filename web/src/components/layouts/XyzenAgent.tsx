"use client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import { Badge } from "@/components/base/Badge";
import { useAuth } from "@/hooks/useAuth";
import { formatTime } from "@/lib/formatDate";
import {
  PencilIcon,
  ShoppingBagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { motion, type Variants } from "framer-motion";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import AddAgentModal from "@/components/modals/AddAgentModal";
import AgentSettingsModal from "@/components/modals/AgentSettingsModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { useMyMarketplaceListings } from "@/hooks/useMarketplace";
import { useXyzen } from "@/store";

// Import types from separate file
import type { Agent } from "@/types/agents";

interface AgentCardProps {
  agent: Agent;
  isMarketplacePublished?: boolean;
  lastConversationTime?: string;
  onClick?: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
}

// 定义动画变体
const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 12,
    },
  },
};

// 右键菜单组件
interface ContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  isDefaultAgent?: boolean;
  isMarketplacePublished?: boolean;
  agent?: Agent;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onEdit,
  onDelete,
  onClose,
  isDefaultAgent = false,
  isMarketplacePublished = false,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-50 w-48 rounded-sm border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => {
          onEdit();
          onClose();
        }}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700 ${
          isDefaultAgent ? "rounded-lg" : "rounded-t-lg"
        }`}
      >
        <PencilIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        {t("agents.editAgent")}
      </button>
      {isMarketplacePublished ? (
        <Tooltip side="right">
          <TooltipTrigger asChild>
            <span className="block w-full">
              <button
                disabled
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex w-full cursor-not-allowed items-center gap-2 rounded-b-lg px-4 py-2.5 text-left text-sm text-neutral-700 opacity-50 transition-colors dark:text-neutral-300"
              >
                <TrashIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                {t("agents.deleteAgent")}
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t("agents.deleteBlockedMessage", {
              defaultValue:
                "This agent is published to Agent Market. Please unpublish it first, then delete it.",
            })}
          </TooltipContent>
        </Tooltip>
      ) : (
        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-b-lg px-4 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-red-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <TrashIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
          {t("agents.deleteAgent")}
        </button>
      )}
    </motion.div>
  );
};

// 详细版本-包括名字，描述，头像，标签以及GPT模型
const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  isMarketplacePublished = false,
  lastConversationTime,
  onClick,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    isLongPress.current = false;
    const touch = e.touches[0];
    const { clientX, clientY } = touch;

    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: clientX, y: clientY });
      // Haptic feedback (best-effort)
      try {
        if ("vibrate" in navigator) {
          navigator.vibrate(10);
        }
      } catch {
        // ignore
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Check if it's a default agent based on tags
  const isDefaultAgent = agent.tags?.some((tag) => tag.startsWith("default_"));

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  return (
    <>
      <motion.div
        layout
        variants={itemVariants}
        whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (isLongPress.current) return;
          onClick?.(agent);
        }}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        className={`
        group relative flex cursor-pointer items-start gap-4 rounded-sm border p-3
        border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60
        ${agent.id === "default-chat" ? "select-none" : ""}
      `}
      >
        {/* 头像 */}
        <div className="h-10 w-10 shrink-0 avatar-glow">
          <img
            src={
              agent.avatar ||
              "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
            }
            alt={agent.name}
            className="h-10 w-10 rounded-full border border-neutral-200 object-cover dark:border-neutral-700"
          />
        </div>

        {/* 内容 */}
        <div className="flex flex-1 flex-col min-w-0 select-none">
          <div className="flex items-center gap-2">
            <h3
              className="text-sm font-semibold text-neutral-800 dark:text-white truncate shrink"
              title={agent.name}
            >
              {agent.name}
            </h3>

            {/* Marketplace published badge */}
            {isMarketplacePublished && (
              <Tooltip side="right">
                <TooltipTrigger asChild>
                  <span className="shrink-0">
                    <Badge
                      variant="yellow"
                      className="flex items-center justify-center px-1.5!"
                    >
                      <motion.div
                        whileHover={{
                          rotate: [0, -15, 15, -15, 15, 0],
                          scale: 1.2,
                          transition: { duration: 0.5, ease: "easeInOut" },
                        }}
                      >
                        <ShoppingBagIcon className="h-3.5 w-3.5" />
                      </motion.div>
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {t("agents.badges.marketplace", {
                    defaultValue: "Published to Marketplace",
                  })}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Knowledge set badge */}
            {/* {knowledgeSetName && (
              <div title={`Bound to knowledge set: ${knowledgeSetName}`}>
                <Badge
                  variant="purple"
                  className="flex items-center gap-1 shrink-0"
                >
                  📚 {knowledgeSetName}
                </Badge>
              </div>
            )} */}
          </div>

          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
            {agent.description}
          </p>

          {/* Last conversation time */}
          {lastConversationTime && (
            <p className="mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
              {formatTime(lastConversationTime)}
            </p>
          )}
        </div>
      </motion.div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={() => onEdit?.(agent)}
          onDelete={() => onDelete?.(agent)}
          onClose={() => setContextMenu(null)}
          isDefaultAgent={isDefaultAgent}
          isMarketplacePublished={isMarketplacePublished}
          agent={agent}
        />
      )}
    </>
  );
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

interface XyzenAgentProps {
  systemAgentType?: "chat" | "all";
}

export default function XyzenAgent({
  systemAgentType = "all",
}: XyzenAgentProps) {
  const { t } = useTranslation();
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const {
    agents,

    createDefaultChannel,
    deleteAgent,
    updateAgentAvatar,

    chatHistory,
    channels,
    activateChannel,

    fetchMcpServers,
    fetchMyProviders,
    llmProviders,
    llmProvidersLoading,
  } = useXyzen();

  // Get auth state
  const { isAuthenticated } = useAuth();

  // Fetch marketplace listings to check if deleted agent has a published version
  const { data: myListings } = useMyMarketplaceListings();

  const publishedAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const listing of myListings ?? []) {
      if (listing.is_published) ids.add(listing.agent_id);
    }
    return ids;
  }, [myListings]);

  // Compute last conversation time per agent from chat history
  const lastConversationTimeByAgent = useMemo(() => {
    const timeMap: Record<string, string> = {};
    for (const topic of chatHistory) {
      const channel = channels[topic.id];
      if (!channel?.agentId) continue;
      const agentId = channel.agentId;
      const existing = timeMap[agentId];
      if (!existing || topic.updatedAt > existing) {
        timeMap[agentId] = topic.updatedAt;
      }
    }
    return timeMap;
  }, [chatHistory, channels]);

  // Note: fetchAgents is called in App.tsx during initial load
  // No need to fetch again here - agents are already in the store

  // Ensure providers are loaded on mount (only if authenticated)
  useEffect(() => {
    if (isAuthenticated && llmProviders.length === 0 && !llmProvidersLoading) {
      fetchMyProviders().catch((error) => {
        console.error("Failed to fetch providers:", error);
      });
    }
  }, [
    isAuthenticated,
    llmProviders.length,
    llmProvidersLoading,
    fetchMyProviders,
  ]);

  // Ensure MCP servers are loaded first
  useEffect(() => {
    const loadMcps = async () => {
      try {
        await fetchMcpServers();
      } catch (error) {
        console.error("Failed to load MCP servers:", error);
      }
    };

    loadMcps();
  }, [fetchMcpServers]);

  const handleAgentClick = async (agent: Agent) => {
    // 使用实际的 agent ID（系统助手和普通助手都有真实的 ID）
    const agentId = agent.id;

    // Ensure providers are loaded before creating a channel
    if (llmProviders.length === 0) {
      try {
        await fetchMyProviders();
      } catch (error) {
        console.error("Failed to fetch providers:", error);
      }
    }

    // 1. 从 chatHistory 中找到该 agent 的所有 topics
    const agentTopics = chatHistory.filter((topic) => {
      const channel = channels[topic.id];
      if (!channel) return false;

      // 严格匹配 agentId
      return channel.agentId === agentId;
    });

    if (agentTopics.length === 0) {
      await createDefaultChannel(agentId);
    } else {
      const latestTopic = agentTopics.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
      await activateChannel(latestTopic.id);
    }
  };

  const handleEditClick = (agent: Agent) => {
    setEditingAgent(agent);
    setEditModalOpen(true);
  };

  const handleDeleteClick = (agent: Agent) => {
    setAgentToDelete(agent);
    setConfirmModalOpen(true);
  };

  // Find system agents within the user's agents list using tags
  const filteredSystemAgents = agents.filter((agent) => {
    if (!agent.tags) return false;

    if (systemAgentType === "all") {
      return agent.tags.some((tag) => tag.startsWith("default_"));
    }
    if (systemAgentType === "chat") {
      return agent.tags.includes("default_chat");
    }
    return false;
  });

  // Regular agents (excluding the ones already identified as default)
  const regularAgents = agents.filter(
    (agent) => !agent.tags?.some((tag) => tag.startsWith("default_")),
  );

  const allAgents = [...filteredSystemAgents, ...regularAgents];

  // Clean sidebar with auto-loaded MCPs for system agents
  return (
    <TooltipProvider>
      <motion.div
        className="space-y-2 px-4 custom-scrollbar overflow-y-auto h-full"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {allAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isMarketplacePublished={publishedAgentIds.has(agent.id)}
            lastConversationTime={lastConversationTimeByAgent[agent.id]}
            onClick={handleAgentClick}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
          />
        ))}
        <button
          className="w-full rounded-sm border-2 border-dashed border-neutral-300 bg-transparent py-3 text-sm font-semibold text-neutral-600 transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/50"
          onClick={() => setAddModalOpen(true)}
        >
          {t("agents.addButton")}
        </button>
        <AddAgentModal
          isOpen={isAddModalOpen}
          onClose={() => setAddModalOpen(false)}
        />
        {editingAgent && (
          <AgentSettingsModal
            key={editingAgent.id}
            isOpen={isEditModalOpen}
            onClose={() => {
              setEditModalOpen(false);
              setEditingAgent(null);
            }}
            sessionId=""
            agentId={editingAgent.id}
            agentName={editingAgent.name}
            agent={editingAgent}
            currentAvatar={editingAgent.avatar ?? undefined}
            onAvatarChange={(avatarUrl) => {
              setEditingAgent({ ...editingAgent, avatar: avatarUrl });
              updateAgentAvatar(editingAgent.id, avatarUrl);
            }}
            onGridSizeChange={() => {}}
            onDelete={
              publishedAgentIds.has(editingAgent.id)
                ? undefined
                : () => {
                    deleteAgent(editingAgent.id);
                    setEditModalOpen(false);
                    setEditingAgent(null);
                  }
            }
          />
        )}
        {agentToDelete && (
          <ConfirmationModal
            isOpen={isConfirmModalOpen}
            onClose={() => setConfirmModalOpen(false)}
            onConfirm={() => {
              if (publishedAgentIds.has(agentToDelete.id)) return;
              deleteAgent(agentToDelete.id);
              setConfirmModalOpen(false);
              setAgentToDelete(null);
            }}
            title={
              publishedAgentIds.has(agentToDelete.id)
                ? t("agents.deleteBlockedTitle", {
                    defaultValue: "Can't delete agent",
                  })
                : t("agents.deleteTitle")
            }
            message={
              publishedAgentIds.has(agentToDelete.id)
                ? t("agents.deleteBlockedMessage", {
                    defaultValue:
                      "This agent is published to Agent Market. Please unpublish it first, then delete it.",
                  })
                : t("agents.deleteConfirm", { name: agentToDelete.name })
            }
            confirmLabel={
              publishedAgentIds.has(agentToDelete.id)
                ? t("common.ok")
                : t("agents.deleteAgent")
            }
            cancelLabel={t("common.cancel")}
            destructive={!publishedAgentIds.has(agentToDelete.id)}
          />
        )}
      </motion.div>
    </TooltipProvider>
  );
}
