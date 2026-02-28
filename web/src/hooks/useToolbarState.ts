"use client";

import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import { useSubscriptionInfo } from "@/hooks/ee";
import { useIsMobile } from "@/hooks/useMediaQuery";
import {
  selectCurrentToolbarAgent,
  selectCurrentToolbarMcpInfo,
} from "@/hooks/toolbarSelectors";
import { useXyzen } from "@/store";
import type { ModelTier } from "@/components/layouts/components/TierSelector";
import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

export function useToolbarState() {
  const {
    createDefaultChannel,
    fetchAgents,
    updateSessionConfig,
    updateAgent,
    openSettingsModal,
  } = useXyzen(
    useShallow((s) => ({
      createDefaultChannel: s.createDefaultChannel,
      fetchAgents: s.fetchAgents,
      updateSessionConfig: s.updateSessionConfig,
      updateAgent: s.updateAgent,
      openSettingsModal: s.openSettingsModal,
    })),
  );

  const agents = useXyzen((s) => s.agents);
  const mcpServers = useXyzen((s) => s.mcpServers);
  const uploadedFiles = useXyzen((s) => s.uploadedFiles);
  const isUploading = useXyzen((s) => s.isUploading);

  // Subscription tier limit
  const subInfo = useSubscriptionInfo();
  const maxTier = subInfo?.maxTier ?? "lite";
  const userPlan = subInfo?.userPlan ?? "free";

  // Fine-grained channel status (no messages)
  const channelStatus = useActiveChannelStatus();
  const activeChatChannel = channelStatus.channelId;

  // Get current agent
  const currentAgent = useMemo(() => {
    return selectCurrentToolbarAgent(
      agents,
      activeChatChannel,
      channelStatus.agentId,
    );
  }, [agents, activeChatChannel, channelStatus.agentId]);

  // Get current channel and associated MCP tools
  const currentMcpInfo = useMemo(() => {
    return selectCurrentToolbarMcpInfo(
      activeChatChannel,
      currentAgent,
      mcpServers,
    );
  }, [activeChatChannel, currentAgent, mcpServers]);

  // Get current channel status for tier/knowledge
  const currentSessionTier = channelStatus.model_tier;
  const currentChannelSessionId = channelStatus.sessionId;
  const currentChannelKnowledgeSetId = channelStatus.knowledge_set_id;

  // State for new chat creation loading
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Detect if we're on mobile
  const isMobile = useIsMobile();

  // Tier change handler
  const handleTierChange = useCallback(
    async (tier: ModelTier) => {
      if (!currentChannelSessionId) return;

      try {
        await updateSessionConfig(currentChannelSessionId, {
          model_tier: tier,
        });
      } catch (error) {
        console.error("Failed to update session tier:", error);
      }
    },
    [currentChannelSessionId, updateSessionConfig],
  );

  // Knowledge set change handler
  const handleKnowledgeSetChange = useCallback(
    async (knowledgeSetId: string | null) => {
      if (!currentChannelSessionId) return;

      try {
        await updateSessionConfig(currentChannelSessionId, {
          knowledge_set_id: knowledgeSetId,
        });
      } catch (error) {
        console.error("Failed to update session knowledge set:", error);
      }
    },
    [currentChannelSessionId, updateSessionConfig],
  );

  const handleNewChat = useCallback(async () => {
    if (isCreatingNewChat) return;

    try {
      setIsCreatingNewChat(true);
      await createDefaultChannel(currentAgent?.id);
    } catch (error) {
      console.error("Failed to create new chat:", error);
    } finally {
      setIsCreatingNewChat(false);
    }
  }, [isCreatingNewChat, createDefaultChannel, currentAgent?.id]);

  return {
    // Store values
    agents,
    mcpServers,
    uploadedFiles,
    isUploading,
    maxTier,
    userPlan,
    activeChatChannel,
    allAgents: agents,
    currentMcpInfo,
    currentAgent,
    currentSessionTier,
    currentChannelKnowledgeSetId,
    isMobile,

    // State
    isCreatingNewChat,
    showMoreMenu,
    setShowMoreMenu,

    // Handlers
    handleTierChange,
    handleKnowledgeSetChange,
    handleNewChat,

    // Store actions
    fetchAgents,
    updateAgent,
    openSettingsModal,
  };
}
