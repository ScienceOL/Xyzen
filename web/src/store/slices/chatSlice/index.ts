import { groupToolMessagesWithAssistant } from "@/core/chat";
import { syncChannelResponding } from "@/core/chat/channelHelpers";
import { deriveTopicStatus } from "@/core/chat/channelStatus";
import { topicService } from "@/service/topicService";
import xyzenService from "@/service/xyzenService";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../../types";
import { createChannelActions } from "./channelActions";
import { createConnectionActions } from "./connectionActions";
import {
  CHANNEL_CONNECT_POLL_INTERVAL_MS,
  CHANNEL_CONNECT_TIMEOUT_MS,
  staleWatchdogIds,
} from "./helpers";
import { createMessageActions } from "./messageActions";
import type { ChatSlice, Helpers } from "./types";

export type { ChatSlice } from "./types";

export const createChatSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  ChatSlice
> = (set, get) => {
  // Helper function to get agent name by ID
  const getAgentNameById = (agentId?: string): string => {
    if (!agentId) return "通用助理";

    const state = get();
    const agent = state.agents.find((a) => a.id === agentId);

    return agent?.name || "通用助理";
  };

  const waitForChannelConnection = async (
    topicId: string,
    options?: { logFailure?: boolean },
  ): Promise<boolean> => {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= CHANNEL_CONNECT_TIMEOUT_MS) {
      const currentChannel = get().channels[topicId];
      if (currentChannel?.connected) {
        return true;
      }
      if (currentChannel?.error) {
        if (options?.logFailure) {
          console.warn(
            `Connection failed for topic ${topicId}: ${currentChannel.error}`,
          );
        }
        return false;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, CHANNEL_CONNECT_POLL_INTERVAL_MS);
      });
    }

    if (options?.logFailure) {
      console.warn(`Connection timeout for topic ${topicId}`);
    }
    return false;
  };

  /** Recompute derived status fields from all channels. Call on state transitions only. */
  const updateDerivedStatus = (): void => {
    const prevRespondingIds = get().respondingChannelIds;

    set((state: ChatSlice) => {
      const respondingIds = new Set<string>();
      const runningIds = new Set<string>();
      const topicCounts: Record<string, number> = {};

      for (const channel of Object.values(state.channels)) {
        const status = deriveTopicStatus(channel);
        if (status === "running" || status === "stopping") {
          respondingIds.add(channel.id);
          if (channel.agentId) {
            runningIds.add(channel.agentId);
          }
        }
        if (status === "running" && channel.agentId) {
          topicCounts[channel.agentId] =
            (topicCounts[channel.agentId] || 0) + 1;
        }
      }

      state.respondingChannelIds = respondingIds;
      state.runningAgentIds = runningIds;
      state.activeTopicCountByAgent = topicCounts;

      // Log if the active channel's derived responding status changed
      const activeId = state.activeChatChannel;
      if (activeId) {
        const wasResponding = prevRespondingIds.has(activeId);
        const isResponding = respondingIds.has(activeId);
        if (wasResponding !== isResponding) {
          console.debug(
            `[updateDerivedStatus] active channel ${activeId}: respondingChannelIds ${wasResponding} → ${isResponding}`,
            `| channel.responding: ${state.channels[activeId]?.responding}`,
          );
        }
      }
    });
  };

  /**
   * After a terminal event on a non-primary connection, close it if the channel
   * is no longer responding. Uses setTimeout(0) so Immer set() commits first.
   */
  const closeIdleNonPrimaryConnection = (topicId: string) => {
    setTimeout(() => {
      // Don't close the primary connection
      if (xyzenService.getPrimaryTopicId() === topicId) return;
      // Don't close connections for channels that are still responding
      const ch = get().channels[topicId];
      if (ch?.responding) return;
      // Safe to close
      xyzenService.closeConnection(topicId);
      // Clean up stale watchdog
      const timer = staleWatchdogIds.get(topicId);
      if (timer) {
        clearInterval(timer);
        staleWatchdogIds.delete(topicId);
      }
    }, 0);
  };

  /**
   * Fetch authoritative messages from the REST API and reconcile channel state.
   * Used after reconnect or when stale runtime flags are detected.
   */
  const reconcileChannelFromBackend = async (
    topicId: string,
  ): Promise<void> => {
    const { setLoading } = get();
    const loadingKey = `topicMessages-${topicId}`;
    const ch = get().channels[topicId];

    // Guard: never reconcile from DB while streaming is active.
    if (ch?.responding) {
      console.debug(
        `[reconcile] SKIP — channel is responding, topic=${topicId.slice(0, 8)} msgs=${ch.messages.length}`,
      );
      return;
    }

    console.groupCollapsed(
      `[reconcile] topic=${topicId.slice(0, 8)} responding=${ch?.responding} msgs=${ch?.messages.length}`,
    );
    console.debug(new Error().stack?.split("\n").slice(1, 5).join(" <- "));
    setLoading(loadingKey, true);

    try {
      // Fetch messages and token stats in parallel
      const [messages, tokenStats] = await Promise.all([
        topicService.getMessages(topicId),
        topicService.getTokenStats(topicId).catch(() => null),
      ]);

      const processedMessages = groupToolMessagesWithAssistant(messages);

      set((state: ChatSlice) => {
        const channel = state.channels[topicId];
        if (channel) {
          // Build a set of DB message IDs for quick lookup
          const dbMessageIds = new Set(processedMessages.map((m) => m.id));

          // Collect in-memory-only messages that should be preserved
          const inMemoryMessages = channel.messages.filter((m) => {
            // Skip messages that exist in DB — DB version is authoritative
            if (dbMessageIds.has(m.id)) return false;
            if (m.dbId && dbMessageIds.has(m.dbId)) return false;

            // Preserve messages with active runtime state
            return Boolean(
              m.status === "pending" ||
              m.status === "streaming" ||
              m.status === "thinking" ||
              m.isLoading ||
              m.isStreaming ||
              m.isThinking ||
              m.agentExecution,
            );
          });

          // Preserve streamId from existing messages onto reconciled DB messages.
          if (channel.responding) {
            const existingStreamIds = new Map<string, string>();
            for (const msg of channel.messages) {
              if (msg.streamId && msg.id) {
                existingStreamIds.set(msg.id, msg.streamId);
              }
            }
            for (const msg of processedMessages) {
              const streamId = existingStreamIds.get(msg.id);
              if (streamId) {
                msg.streamId = streamId;
              }
            }
          }

          // Try to merge in-memory runtime state into matching DB messages
          const usedDbIndices = new Set<number>();
          const trulyNewMessages: typeof inMemoryMessages = [];

          for (const memMsg of inMemoryMessages) {
            let dbMatchIdx = -1;
            if (memMsg.role === "assistant") {
              for (let i = processedMessages.length - 1; i >= 0; i--) {
                if (
                  processedMessages[i].role === "assistant" &&
                  !usedDbIndices.has(i)
                ) {
                  dbMatchIdx = i;
                  break;
                }
              }
            }

            if (dbMatchIdx !== -1) {
              // Merge: keep DB message identity but apply in-memory runtime state
              const dbMsg = processedMessages[dbMatchIdx];
              dbMsg.streamId = memMsg.streamId;
              dbMsg.status = memMsg.status;
              dbMsg.isStreaming = memMsg.isStreaming;
              dbMsg.isThinking = memMsg.isThinking;
              dbMsg.isLoading = memMsg.isLoading;
              dbMsg.agentExecution = memMsg.agentExecution;
              dbMsg.thinkingContent = memMsg.thinkingContent;
              usedDbIndices.add(dbMatchIdx);
            } else {
              trulyNewMessages.push(memMsg);
            }
          }

          // Merge: DB messages (with merged runtime state) + truly new messages
          const mergedMessages = [...processedMessages, ...trulyNewMessages];

          console.debug(
            `[reconcile] OVERWRITE topic=${topicId.slice(0, 8)} oldMsgs=${channel.messages.length} dbMsgs=${processedMessages.length} preserved=${inMemoryMessages.length} merged=${inMemoryMessages.length - trulyNewMessages.length} new=${trulyNewMessages.length} responding=${channel.responding}`,
          );
          channel.messages = mergedMessages;
          if (tokenStats?.total_tokens != null) {
            channel.tokenUsage = tokenStats.total_tokens;
          }
          syncChannelResponding(channel);
        }
      });
      updateDerivedStatus();
    } catch (error) {
      console.error("Failed to reconcile topic messages:", error);
    } finally {
      console.groupEnd();
      setLoading(loadingKey, false);
    }
  };

  // Shared helpers passed to action factories
  const helpers: Helpers = {
    reconcileChannelFromBackend,
    updateDerivedStatus,
    closeIdleNonPrimaryConnection,
    getAgentNameById,
    waitForChannelConnection,
  };

  return {
    // Chat panel state
    activeChatChannel: null,
    activeTopicByAgent: {},
    chatHistory: [],
    chatHistoryLoading: true,
    channels: {},

    // Derived state
    respondingChannelIds: new Set<string>(),
    runningAgentIds: new Set<string>(),
    activeTopicCountByAgent: {},

    // Notification state
    notification: null,

    // Message editing state
    editingMessageId: null,
    editingContent: "",
    editingMode: null,

    // Knowledge context
    setKnowledgeContext: (channelId, context) => {
      set((state: ChatSlice) => {
        if (state.channels[channelId]) {
          state.channels[channelId].knowledgeContext = context || undefined;
        }
      });
    },

    // Notification methods
    showNotification: (
      title,
      message,
      type = "info",
      actionLabel,
      onAction,
    ) => {
      set((state) => {
        state.notification = {
          isOpen: true,
          title,
          message,
          type,
          actionLabel,
          onAction,
        };
      });
    },

    closeNotification: () => {
      set({ notification: null });
    },

    // Compose actions from sub-modules
    ...createChannelActions(set, get, helpers),
    ...createMessageActions(set, get, helpers),
    ...createConnectionActions(set, get, helpers),
  };
};
