import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import { useCallback, useEffect, useRef, useState } from "react";

export interface WorkShopChatConfig {
  theme: "indigo" | "purple";
  systemAgentId: string;
  storageKeys: {
    inputHeight: string;
    historyPinned?: string;
  };
  defaultTitle: string;
  placeholders: {
    responding: string;
    default: string;
  };
  connectionMessages: {
    connecting: string;
    retrying: string;
  };
  responseMessages: {
    generating: string;
    creating: string;
  };
  emptyState: {
    title: string;
    description: string;
    icon: string;
    features?: string[];
  };
  welcomeMessage?: {
    title: string;
    description: string;
    icon: string;
    tags?: string[];
  };
}

export function useWorkShopChat(config: WorkShopChatConfig) {
  const {
    activeWorkshopChannel,
    workshopChannels,
    agents,
    systemAgents,
    sendWorkshopMessage,
    connectToWorkshopChannel,
    updateWorkshopTopicName,
    fetchMyProviders,
    fetchSystemAgents,
    fetchWorkshopHistory,
    createDefaultWorkshopChannel,
    activateWorkshopChannel,
    llmProviders,
    notification,
    closeNotification,
    pendingInput,
    setPendingInput,
  } = useXyzen();

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // State
  const [autoScroll, setAutoScroll] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showHistory, setShowHistory] = useState(() => {
    if (config.storageKeys.historyPinned) {
      const savedHistoryState = localStorage.getItem(
        config.storageKeys.historyPinned,
      );
      return savedHistoryState === "true";
    }
    return false;
  });
  const [inputHeight, setInputHeight] = useState(() => {
    const savedHeight = localStorage.getItem(config.storageKeys.inputHeight);
    return savedHeight ? parseInt(savedHeight, 10) : 80;
  });
  const [sendBlocked, setSendBlocked] = useState(false);

  // Computed values
  const currentChannel = activeWorkshopChannel
    ? workshopChannels[activeWorkshopChannel]
    : null;
  const currentAgent = currentChannel?.agentId
    ? agents.find((a) => a.id === currentChannel.agentId) ||
      systemAgents.find((a) => a.id === currentChannel.agentId)
    : null;
  const messages: Message[] = currentChannel?.messages || [];
  const connected = currentChannel?.connected || false;
  const error = currentChannel?.error || null;
  const responding = currentChannel?.responding || false;

  // Scroll management
  const scrollToBottom = useCallback(
    (force = false) => {
      if (!autoScroll && !force) return;
      setTimeout(() => {
        messagesContainerRef.current?.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: force ? "auto" : "smooth",
        });
      }, 50);
    },
    [autoScroll],
  );

  const handleScroll = useCallback(() => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
      setAutoScroll(isNearBottom);
    }
  }, []);

  // Event handlers
  const handleSendMessage = useCallback(
    (inputMessage: string) => {
      if (!inputMessage.trim() || !activeWorkshopChannel) return false;
      if (responding) {
        setSendBlocked(true);
        // Auto-hide the hint after 2 seconds
        window.setTimeout(() => setSendBlocked(false), 2000);
        return false;
      }
      sendWorkshopMessage(inputMessage);
      // Clear pending input after sending
      if (pendingInput) {
        setPendingInput("");
      }
      setAutoScroll(true);
      setTimeout(() => scrollToBottom(true), 100);
      return true;
    },
    [
      activeWorkshopChannel,
      responding,
      sendWorkshopMessage,
      pendingInput,
      setPendingInput,
      scrollToBottom,
    ],
  );

  const handleToggleHistory = useCallback(() => {
    const newState = !showHistory;
    setShowHistory(newState);
    if (config.storageKeys.historyPinned) {
      localStorage.setItem(
        config.storageKeys.historyPinned,
        newState.toString(),
      );
    }
  }, [showHistory, config.storageKeys.historyPinned]);

  const handleCloseHistory = useCallback(() => {
    setShowHistory(false);
    if (config.storageKeys.historyPinned) {
      localStorage.setItem(config.storageKeys.historyPinned, "false");
    }
  }, [config.storageKeys.historyPinned]);

  const handleSelectTopic = useCallback((_topicId: string) => {
    // Keep history panel open when selecting a topic for better UX
  }, []);

  const handleInputHeightChange = useCallback(
    (height: number) => {
      setInputHeight(height);
      localStorage.setItem(config.storageKeys.inputHeight, height.toString());
    },
    [config.storageKeys.inputHeight],
  );

  const handleRetryConnection = useCallback(() => {
    if (!currentChannel) return;
    setIsRetrying(true);
    connectToWorkshopChannel(currentChannel.sessionId, currentChannel.id);
    setTimeout(() => {
      setIsRetrying(false);
    }, 2000);
  }, [currentChannel, connectToWorkshopChannel]);

  const handleScrollToBottom = useCallback(() => {
    setAutoScroll(true);
    scrollToBottom(true);
  }, [scrollToBottom]);

  // Effects
  useEffect(() => {
    if (autoScroll) {
      scrollToBottom();
    }
  }, [messages.length, autoScroll, scrollToBottom]);

  // Fetch providers on mount if not already loaded
  useEffect(() => {
    if (llmProviders.length === 0) {
      fetchMyProviders().catch((error) => {
        console.error("Failed to fetch providers:", error);
      });
    }
  }, [llmProviders.length, fetchMyProviders]);

  // Fetch system agents on mount if not already loaded
  useEffect(() => {
    if (systemAgents.length === 0) {
      fetchSystemAgents().catch((error) => {
        console.error("Failed to fetch system agents:", error);
      });
    }
  }, [systemAgents.length, fetchSystemAgents]);

  // Fetch workshop history on mount (non-blocking)
  useEffect(() => {
    // Don't block workshop initialization if history fetching fails
    fetchWorkshopHistory().catch((error) => {
      console.error("Failed to fetch workshop history:", error);
    });
  }, [fetchWorkshopHistory]);
  // Auto-switch to correct system agent channel for this panel
  useEffect(() => {
    if (systemAgents.length > 0) {
      const targetSystemAgent = systemAgents.find(
        (agent) => agent.id === config.systemAgentId,
      );
      if (targetSystemAgent) {
        // Check if we need to create/switch to the correct channel for this panel
        const needsCorrectChannel =
          !activeWorkshopChannel ||
          (currentChannel &&
            currentChannel.agentId !== config.systemAgentId &&
            // Only switch if current agent is a system agent (not user's regular/graph agent)
            // This preserves user's regular/graph agent selections while allowing panel switching
            (currentChannel.agentId ===
              "00000000-0000-0000-0000-000000000001" ||
              currentChannel.agentId ===
                "00000000-0000-0000-0000-000000000002"));

        if (needsCorrectChannel) {
          // Look for existing channel with this system agent first
          const existingChannel = Object.values(workshopChannels).find(
            (channel) => channel.agentId === config.systemAgentId,
          );

          if (existingChannel) {
            // Switch to existing channel for this system agent
            console.log(
              `Switching to existing channel for system agent: ${config.systemAgentId}`,
            );
            activateWorkshopChannel(existingChannel.id).catch(
              (error: Error) => {
                console.error("Failed to activate existing channel:", error);
              },
            );
          } else {
            // Create new channel for this system agent
            console.log(
              `Creating new workshop channel for system agent: ${config.systemAgentId}`,
            );
            createDefaultWorkshopChannel(config.systemAgentId).catch(
              (error: Error) => {
                console.error(
                  "Failed to create default workshop channel with system agent:",
                  error,
                );
              },
            );
          }
        }
      }
    }
  }, [
    systemAgents,
    config.systemAgentId,
    createDefaultWorkshopChannel,
    activeWorkshopChannel,
    currentChannel,
    workshopChannels,
    activateWorkshopChannel,
  ]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      setAutoScroll(true);
      // Force scroll to bottom on channel change
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight;
        }
      }, 50);

      container.addEventListener("scroll", handleScroll, { passive: true });
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [activeWorkshopChannel, handleScroll]);

  return {
    // State
    autoScroll,
    isRetrying,
    showHistory,
    inputHeight,
    sendBlocked,

    // Computed
    currentChannel,
    currentAgent,
    messages,
    connected,
    error,
    responding,

    // Refs
    messagesEndRef,
    messagesContainerRef,

    // Handlers
    handleSendMessage,
    handleToggleHistory,
    handleCloseHistory,
    handleSelectTopic,
    handleInputHeightChange,
    handleRetryConnection,
    handleScrollToBottom,
    handleScroll,

    // Store values
    activeChatChannel: activeWorkshopChannel,
    notification,
    closeNotification,
    pendingInput,
    updateTopicName: updateWorkshopTopicName,
  };
}
