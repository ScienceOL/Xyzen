import {
  useActiveChannelMessages,
  useActiveChannelStatus,
} from "@/hooks/useChannelSelectors";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

export interface XyzenChatConfig {
  theme: "indigo";
  systemAgentTag: string;
  storageKeys: {
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

export function useXyzenChat(config: XyzenChatConfig) {
  // --- Fine-grained store subscriptions ---

  // Scalar channel status (no messages — stable between chunks)
  const channelStatus = useActiveChannelStatus();
  const { channelId: activeChatChannel, responding, aborting } = channelStatus;

  // Messages (hot data — changes every chunk, but ChatBubble is memoized)
  const messages: Message[] = useActiveChannelMessages();

  // Scalar error selector (avoids subscribing to full channel object)
  const error = useXyzen((s) => {
    const id = s.activeChatChannel;
    return id ? (s.channels[id]?.error ?? null) : null;
  });

  // Actions via useShallow (stable references)
  const {
    sendMessage,
    connectToChannel,
    updateTopicName,
    createDefaultChannel,
    activateChannel,
    abortGeneration,
    closeNotification,
    setPendingInput,
  } = useXyzen(
    useShallow((s) => ({
      sendMessage: s.sendMessage,
      connectToChannel: s.connectToChannel,
      updateTopicName: s.updateTopicName,
      createDefaultChannel: s.createDefaultChannel,
      activateChannel: s.activateChannel,
      abortGeneration: s.abortGeneration,
      closeNotification: s.closeNotification,
      setPendingInput: s.setPendingInput,
    })),
  );

  // Individual scalar selectors
  const agents = useXyzen((s) => s.agents);
  const notification = useXyzen((s) => s.notification);
  const pendingInput = useXyzen((s) => s.pendingInput);
  const chatHistoryLoading = useXyzen((s) => s.chatHistoryLoading);

  // Computed from channel status
  const connected = channelStatus.connected;
  const currentAgent = channelStatus.agentId
    ? agents.find((a) => a.id === channelStatus.agentId)
    : null;

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isCreatingChannelRef = useRef(false);

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
  const [sendBlocked, setSendBlocked] = useState(false);

  // Abort handler
  const handleAbortGeneration = useCallback(() => {
    if (activeChatChannel && responding && !aborting) {
      abortGeneration(activeChatChannel);
    }
  }, [activeChatChannel, responding, aborting, abortGeneration]);

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
      if (!inputMessage.trim() || !activeChatChannel) return false;
      if (responding) {
        setSendBlocked(true);
        // Auto-hide the hint after 2 seconds
        window.setTimeout(() => setSendBlocked(false), 2000);
        return false;
      }
      sendMessage(inputMessage);
      // Clear pending input after sending
      if (pendingInput) {
        setPendingInput("");
      }
      setAutoScroll(true);
      setTimeout(() => scrollToBottom(true), 100);
      return true;
    },
    [
      activeChatChannel,
      responding,
      sendMessage,
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

  const handleRetryConnection = useCallback(() => {
    const sessionId = channelStatus.sessionId;
    if (!activeChatChannel || !sessionId) return;
    setIsRetrying(true);
    connectToChannel(sessionId, activeChatChannel);
    setTimeout(() => {
      setIsRetrying(false);
    }, 2000);
  }, [activeChatChannel, channelStatus.sessionId, connectToChannel]);

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

  // Auto-switch to correct system agent channel for this panel
  useEffect(() => {
    if (chatHistoryLoading) return;

    if (agents.length > 0) {
      const targetSystemAgent = agents.find((agent) =>
        agent.tags?.includes(config.systemAgentTag),
      );
      if (targetSystemAgent) {
        // Read channels from getState() to avoid subscribing to every channel change
        const currentChannelObj = activeChatChannel
          ? useXyzen.getState().channels[activeChatChannel]
          : null;

        // Check if we need to create/switch to the correct channel for this panel
        const needsCorrectChannel =
          !activeChatChannel ||
          (currentChannelObj &&
            currentChannelObj.agentId !== targetSystemAgent.id &&
            // Only switch if current agent is a default system agent clone
            agents
              .find((a) => a.id === currentChannelObj.agentId)
              ?.tags?.some((t) => t.startsWith("default_")));

        if (needsCorrectChannel) {
          // Look for existing channel with this system agent first
          const channels = useXyzen.getState().channels;
          const existingChannel = Object.values(channels).find(
            (channel) => channel.agentId === targetSystemAgent.id,
          );

          if (existingChannel) {
            // Switch to existing channel for this system agent
            console.log(
              `Switching to existing channel for default agent: ${targetSystemAgent.name}`,
            );
            activateChannel(existingChannel.id).catch((error) => {
              console.error("Failed to activate existing channel:", error);
            });
          } else {
            // Create new channel for this system agent
            if (isCreatingChannelRef.current) return;
            isCreatingChannelRef.current = true;
            console.log(
              `Creating new channel for default agent: ${targetSystemAgent.name}`,
            );
            createDefaultChannel(targetSystemAgent.id)
              .catch((error) => {
                console.error(
                  "Failed to create default channel with system agent:",
                  error,
                );
              })
              .finally(() => {
                isCreatingChannelRef.current = false;
              });
          }
        }
      }
    }
  }, [
    agents,
    config.systemAgentTag,
    createDefaultChannel,
    activeChatChannel,
    activateChannel,
    chatHistoryLoading,
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
  }, [activeChatChannel, handleScroll]);

  return {
    // State
    autoScroll,
    isRetrying,
    showHistory,
    sendBlocked,

    // Computed
    channelTitle: channelStatus.title,
    currentAgent,
    messages,
    connected,
    error,
    responding,
    aborting,

    // Refs
    messagesEndRef,
    messagesContainerRef,

    // Handlers
    handleSendMessage,
    handleToggleHistory,
    handleCloseHistory,
    handleSelectTopic,
    handleRetryConnection,
    handleScrollToBottom,
    handleScroll,
    handleAbortGeneration,

    // Store values
    activeChatChannel,
    notification,
    closeNotification,
    pendingInput,
    updateTopicName,
  };
}
