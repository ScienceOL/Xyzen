"use client";

import { TooltipProvider } from "@/components/animate-ui/components/animate/tooltip";
import { AgentList } from "@/components/agents";
import CeoAgentCard from "@/components/agents/CeoAgentCard";
import {
  useActiveTopicCountByAgent,
  useChannelAgentIdMap,
} from "@/hooks/useChannelSelectors";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** Whether to show the CEO agent card at the top. Defaults to true. */
  showCeoCard?: boolean;
  /** External ref to the scroll container, used by parent for overscroll detection. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export default function XyzenAgent({
  onNavigateToChat,
  showCeoCard = true,
  scrollRef: externalScrollRef,
}: XyzenAgentProps = {}) {
  const { t } = useTranslation();
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [loadingAgentId, setLoadingAgentId] = useState<string | null>(null);
  const {
    agents,
    rootAgent,

    deleteAgent,
    updateAgentAvatar,
    reorderAgents,

    chatHistory,
    activateChannelForAgent,

    fetchMcpServers,
    fetchRootAgent,
  } = useXyzen(
    useShallow((s) => ({
      agents: s.agents,
      rootAgent: s.rootAgent,
      deleteAgent: s.deleteAgent,
      updateAgentAvatar: s.updateAgentAvatar,
      reorderAgents: s.reorderAgents,
      chatHistory: s.chatHistory,
      activateChannelForAgent: s.activateChannelForAgent,
      fetchMcpServers: s.fetchMcpServers,
      fetchRootAgent: s.fetchRootAgent,
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

  // Ensure MCP servers and root agent are loaded
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        await Promise.all([fetchMcpServers(), fetchRootAgent()]);
      } catch (error) {
        console.error("Failed to load initial data:", error);
      }
    };

    loadInitialData();
  }, [fetchMcpServers, fetchRootAgent]);

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

  const handleRootAgentClick = handleAgentClick;

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

  // Merge external scroll ref with internal ref
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      (
        internalScrollRef as React.MutableRefObject<HTMLDivElement | null>
      ).current = el;
      if (externalScrollRef) {
        (
          externalScrollRef as React.MutableRefObject<HTMLDivElement | null>
        ).current = el;
      }
    },
    [externalScrollRef],
  );

  // Clean sidebar with auto-loaded MCPs for system agents
  return (
    <TooltipProvider>
      <motion.div
        className="relative flex h-full flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Scrollable agent list — extra bottom padding so last items aren't hidden behind CEO card */}
        <div
          ref={scrollRefCallback}
          className="custom-scrollbar flex-1 overflow-y-auto px-4 pt-4"
          style={{ overscrollBehaviorY: "none" }}
        >
          <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-900">
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
          </div>
          <button
            className="mt-3 mb-4 w-full rounded-xl border-2 border-dashed border-neutral-300 bg-transparent py-3 text-sm font-semibold text-neutral-600 transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/50"
            onClick={() => setAddModalOpen(true)}
          >
            {t("agents.addButton")}
          </button>
          {/* Spacer so content can scroll past the floating CEO card */}
          {showCeoCard && rootAgent && <div className="h-24" />}
        </div>

        {/* CEO card floating above the list */}
        {showCeoCard && rootAgent && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
            {/* Upward fade — list content dissolves before reaching the card */}
            <div className="h-16 bg-gradient-to-t from-neutral-50 dark:from-neutral-950 to-transparent" />
            {/* Transparent wrapper — no bg so card's backdrop-blur can see through to the list */}
            <div className="pointer-events-auto px-4">
              <CeoAgentCard
                agent={rootAgent}
                isLoading={loadingAgentId === rootAgent.id}
                activeTopicCount={activeTopicCountByAgent[rootAgent.id] ?? 0}
                onClick={handleRootAgentClick}
              />
            </div>
            {/* Opaque base below the card — fills bottom gap without blocking backdrop-blur */}
            <div className="h-4 bg-neutral-50 dark:bg-neutral-950" />
          </div>
        )}

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
