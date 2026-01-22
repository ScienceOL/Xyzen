"use client";

import { TooltipProvider } from "@/components/animate-ui/components/animate/tooltip";
import { AgentList } from "@/components/agents";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import AddAgentModal from "@/components/modals/AddAgentModal";
import AgentSettingsModal from "@/components/modals/AgentSettingsModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { useMyMarketplaceListings } from "@/hooks/useMarketplace";
import { useXyzen } from "@/store";

// Import types from separate file
import type { Agent } from "@/types/agents";

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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <AgentList
          agents={allAgents}
          variant="detailed"
          publishedAgentIds={publishedAgentIds}
          lastConversationTimeByAgent={lastConversationTimeByAgent}
          onAgentClick={handleAgentClick}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
        />
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
