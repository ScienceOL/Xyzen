"use client";

import { TooltipProvider } from "@/components/animate-ui/components/animate/tooltip";
import { AgentList } from "@/components/agents";
import {
  useActiveTopicCountByAgent,
  useChannelAgentIdMap,
} from "@/hooks/useChannelSelectors";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import AddAgentModal from "@/components/modals/AddAgentModal";
import AgentSettingsModal from "@/components/modals/AgentSettingsModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { useMyMarketplaceListings } from "@/hooks/useMarketplace";
import { useXyzen } from "@/store";
import { useShallow } from "zustand/react/shallow";

// Import types from separate file
import type { Agent } from "@/types/agents";

interface XyzenAgentProps {
  /** Called after a channel has been activated for the clicked agent. */
  onNavigateToChat?: () => void;
}

export default function XyzenAgent({ onNavigateToChat }: XyzenAgentProps = {}) {
  const { t } = useTranslation();
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [loadingAgentId, setLoadingAgentId] = useState<string | null>(null);
  const {
    agents,

    deleteAgent,
    updateAgentAvatar,
    reorderAgents,

    chatHistory,
    activateChannelForAgent,

    fetchMcpServers,
  } = useXyzen(
    useShallow((s) => ({
      agents: s.agents,
      deleteAgent: s.deleteAgent,
      updateAgentAvatar: s.updateAgentAvatar,
      reorderAgents: s.reorderAgents,
      chatHistory: s.chatHistory,
      activateChannelForAgent: s.activateChannelForAgent,
      fetchMcpServers: s.fetchMcpServers,
    })),
  );

  // Derived state from store (stable across streaming chunks)
  const activeTopicCountByAgent = useActiveTopicCountByAgent();
  const channelAgentIdMap = useChannelAgentIdMap();

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
      const agentId = channelAgentIdMap[topic.id];
      if (!agentId) continue;
      const existing = timeMap[agentId];
      if (!existing || topic.updatedAt > existing) {
        timeMap[agentId] = topic.updatedAt;
      }
    }
    return timeMap;
  }, [chatHistory, channelAgentIdMap]);

  // Note: fetchAgents is called in App.tsx during initial load
  // No need to fetch again here - agents are already in the store

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
    const agentId = agent.id;

    setLoadingAgentId(agentId);
    try {
      // Use unified logic that always fetches from backend and gets the latest topic
      await activateChannelForAgent(agentId);
      onNavigateToChat?.();
    } finally {
      setLoadingAgentId(null);
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

  const handleReorder = useCallback(
    async (agentIds: string[]) => {
      try {
        await reorderAgents(agentIds);
      } catch (error) {
        console.error("Failed to reorder agents:", error);
      }
    },
    [reorderAgents],
  );

  // Clean sidebar with auto-loaded MCPs for system agents
  return (
    <TooltipProvider>
      <motion.div
        className="space-y-2 px-4 custom-scrollbar overflow-y-auto h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <AgentList
          agents={agents}
          variant="detailed"
          sortable={true}
          publishedAgentIds={publishedAgentIds}
          lastConversationTimeByAgent={lastConversationTimeByAgent}
          activeTopicCountByAgent={activeTopicCountByAgent}
          onAgentClick={handleAgentClick}
          loadingAgentId={loadingAgentId}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
          onReorder={handleReorder}
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
