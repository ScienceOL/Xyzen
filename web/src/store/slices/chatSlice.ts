import {
  groupToolMessagesWithAssistant,
  isValidUuid,
  mergeChannelPreservingRuntime,
} from "@/core/chat";
import { generateClientId } from "@/core/chat/messageProcessor";
import { syncChannelResponding } from "@/core/chat/channelHelpers";
import { ChunkBuffer } from "@/core/chat/chunkBuffer";
import {
  handleAgentEnd,
  handleAgentError,
  handleAgentStart,
  handleError,
  handleGeneratedFiles,
  handleInsufficientBalance,
  handleMessage,
  handleMessageSaved,
  handleNodeEnd,
  handleNodeStart,
  handleParallelChatLimit,
  handleProcessingOrLoading,
  handleProgressUpdate,
  handleSearchCitations,
  handleStreamAborted,
  handleStreamingEnd,
  handleStreamingStart,
  handleSubagentEnd,
  handleSubagentStart,
  handleThinkingEnd,
  handleThinkingStart,
  handleToolCallRequest,
  handleToolCallResponse,
  handleTopicUpdated,
} from "@/core/chat/handlers";
import { deriveTopicStatus } from "@/core/chat/channelStatus";
import { providerCore } from "@/core/provider";
import { authService } from "@/service/authService";
import { sessionService } from "@/service/sessionService";
import xyzenService from "@/service/xyzenService";
import type { MessageEventCallback } from "@/service/xyzenService";
import type { StateCreator } from "zustand";
import type {
  ChatChannel,
  ChatHistoryItem,
  SessionResponse,
  TopicResponse,
  XyzenState,
} from "../types";

// NOTE: groupToolMessagesWithAssistant and generateClientId live in
// @/core/chat/messageProcessor.ts as part of the frontend refactor.

// Track abort timeout IDs per channel to allow cleanup
// Using a module-level Map since NodeJS.Timeout is not serializable in store
const abortTimeoutIds = new Map<string, ReturnType<typeof setTimeout>>();
const CHANNEL_CONNECT_TIMEOUT_MS = 5000;
const CHANNEL_CONNECT_POLL_INTERVAL_MS = 100;

// Per-topic stale-state watchdog interval IDs (separate from abort timeouts)
const staleWatchdogIds = new Map<string, ReturnType<typeof setInterval>>();

export interface ChatSlice {
  // Chat panel state
  activeChatChannel: string | null;
  activeTopicByAgent: Record<string, string>; // agentId -> topicId mapping
  chatHistory: ChatHistoryItem[];
  chatHistoryLoading: boolean;
  channels: Record<string, ChatChannel>;

  // Derived state — updated on state transitions only (NOT on streaming_chunk)
  respondingChannelIds: Set<string>;
  runningAgentIds: Set<string>;
  activeTopicCountByAgent: Record<string, number>;

  // Notification state
  notification: {
    isOpen: boolean;
    title: string;
    message: string;
    type: "info" | "warning" | "error" | "success";
    actionLabel?: string;
    onAction?: () => void;
  } | null;

  // Chat panel methods
  setActiveChatChannel: (channelUUID: string | null) => void;
  fetchChatHistory: () => Promise<void>;
  togglePinChat: (chatId: string) => void;
  activateChannel: (topicId: string) => Promise<void>;
  activateChannelForAgent: (agentId: string) => Promise<void>;
  connectToChannel: (sessionId: string, topicId: string) => void;
  disconnectFromChannel: () => void;
  sendMessage: (message: string) => Promise<void>;
  createDefaultChannel: (agentId?: string) => Promise<void>;
  updateTopicName: (topicId: string, newName: string) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  clearSessionTopics: (sessionId: string) => Promise<void>;
  updateSessionConfig: (
    sessionId: string,
    config: {
      provider_id?: string;
      model?: string;
      model_tier?: "ultra" | "pro" | "standard" | "lite";
      knowledge_set_id?: string | null;
    },
  ) => Promise<void>;
  updateSessionProviderAndModel: (
    sessionId: string,
    providerId: string,
    model: string,
  ) => Promise<void>;

  // Tool call confirmation methods
  confirmToolCall: (channelId: string, toolCallId: string) => void;
  cancelToolCall: (channelId: string, toolCallId: string) => void;

  // Abort/interrupt generation
  abortGeneration: (channelId: string) => void;

  // Knowledge Context
  setKnowledgeContext: (
    channelId: string,
    context: { parentId: string; folderName: string } | null,
  ) => void;

  // Message editing state
  editingMessageId: string | null;
  editingContent: string;
  editingMode: "edit_only" | "edit_and_regenerate" | null;

  // Message editing methods
  startEditMessage: (
    messageId: string,
    content: string,
    mode: "edit_only" | "edit_and_regenerate",
  ) => void;
  cancelEditMessage: () => void;
  submitEditMessage: () => Promise<void>;
  triggerRegeneration: () => void;

  // Message deletion
  deleteMessage: (messageId: string) => Promise<void>;

  // Notification methods
  showNotification: (
    title: string,
    message: string,
    type?: "info" | "warning" | "error" | "success",
    actionLabel?: string,
    onAction?: () => void,
  ) => void;
  closeNotification: () => void;
}

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

  // --- Channel helpers imported from @/core/chat/channelHelpers ---

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
          console.warn(
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
    const { backendUrl, setLoading } = get();
    const loadingKey = `topicMessages-${topicId}`;
    const ch = get().channels[topicId];

    // Guard: never reconcile from DB while streaming is active.
    // In-memory state is the source of truth during streaming — DB lacks
    // runtime fields (agentExecution, streamId, isStreaming, etc.).
    // If the stream truly stalled, the 60s stale watchdog will handle it.
    if (ch?.responding) {
      console.warn(
        `[reconcile] SKIP — channel is responding, topic=${topicId.slice(0, 8)} msgs=${ch.messages.length}`,
      );
      return;
    }

    console.warn(
      `[reconcile] ENTER topic=${topicId.slice(0, 8)} responding=${ch?.responding} msgs=${ch?.messages.length}`,
      new Error().stack?.split("\n").slice(1, 5).join(" <- "),
    );
    setLoading(loadingKey, true);

    try {
      const token = authService.getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${backendUrl}/xyzen/api/v1/topics/${topicId}/messages`,
        { headers },
      );
      if (response.ok) {
        const messages = await response.json();
        const processedMessages = groupToolMessagesWithAssistant(messages);

        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (channel) {
            // Build a set of DB message IDs for quick lookup
            const dbMessageIds = new Set(processedMessages.map((m) => m.id));

            // Collect in-memory-only messages that should be preserved:
            // these are messages created by streaming events (agent execution,
            // loading placeholders, streaming content) that haven't been
            // persisted to DB yet. Without preservation, reconciliation
            // during active streaming destroys the running agent execution.
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
            // After WS reconnect, the Celery worker is still streaming with the
            // original stream_id, but DB messages don't have streamId. Without
            // this, incoming chunks can't find the message and create a new bubble.
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
            // instead of preserving them as separate duplicates.
            // The in-memory message has a temp ID (e.g. "agent-exec_...") while
            // the DB message has a real UUID — they're the same logical message.
            const usedDbIndices = new Set<number>();
            const trulyNewMessages: typeof inMemoryMessages = [];

            for (const memMsg of inMemoryMessages) {
              // Find a DB assistant message that could be the persisted version
              // of this in-memory message. Match by role and pick the latest
              // unmatched assistant message from DB.
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
                // No DB counterpart — truly a new in-memory-only message
                trulyNewMessages.push(memMsg);
              }
            }

            // Merge: DB messages (with merged runtime state) + truly new messages
            const mergedMessages = [...processedMessages, ...trulyNewMessages];

            console.warn(
              `[reconcile] OVERWRITE topic=${topicId.slice(0, 8)} oldMsgs=${channel.messages.length} dbMsgs=${processedMessages.length} preserved=${inMemoryMessages.length} merged=${inMemoryMessages.length - trulyNewMessages.length} new=${trulyNewMessages.length} responding=${channel.responding}`,
            );
            channel.messages = mergedMessages;
            syncChannelResponding(channel);
          }
        });
        updateDerivedStatus();
      } else {
        const errorText = await response.text();
        console.error(
          `ChatSlice: Failed to reconcile messages for topic ${topicId}: ${response.status} ${errorText}`,
        );
      }
    } catch (error) {
      console.error("Failed to reconcile topic messages:", error);
    } finally {
      setLoading(loadingKey, false);
    }
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

    setActiveChatChannel: (channelId) => set({ activeChatChannel: channelId }),

    fetchChatHistory: async () => {
      const { setLoading } = get();
      setLoading("chatHistory", true);

      try {
        const token = authService.getToken();
        if (!token) {
          console.error("ChatSlice: No authentication token available");
          set({ chatHistoryLoading: false });
          return;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };

        const response = await fetch(
          `${get().backendUrl}/xyzen/api/v1/sessions/`,
          {
            headers,
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `ChatSlice: Sessions API error: ${response.status} - ${errorText}`,
          );
          throw new Error(
            `Failed to fetch chat history: ${response.status} ${errorText}`,
          );
        }

        const history: SessionResponse[] = await response.json();

        // Snapshot current channels AFTER fetch completes (not before).
        // Use get() to read the latest Immer-committed state.
        const currentChannels = get().channels;
        const newChannels: Record<string, ChatChannel> = { ...currentChannels };

        // Diagnostic: detect if any channel is responding when we're about to overwrite
        const respondingTopics = Object.entries(currentChannels)
          .filter(([, ch]) => ch.responding)
          .map(([id, ch]) => `${id.slice(0, 8)}(msgs=${ch.messages.length})`);
        if (respondingTopics.length > 0) {
          console.warn(
            `[fetchChatHistory] DANGER: overwriting channels while responding:`,
            respondingTopics.join(", "),
          );
        }

        const chatHistory: ChatHistoryItem[] = history.flatMap(
          (session: SessionResponse) => {
            return (
              session.topics?.map((topic: TopicResponse) => {
                // 只有当频道不存在时才创建新的频道，否则保留现有状态
                if (!newChannels[topic.id]) {
                  newChannels[topic.id] = {
                    id: topic.id,
                    sessionId: session.id,
                    title: topic.name,
                    messages: [],
                    agentId: session.agent_id,
                    provider_id: session.provider_id,
                    model: session.model,
                    model_tier: session.model_tier,
                    connected: false,
                    error: null,
                  };
                } else {
                  // 更新现有频道的基本信息，但保留消息和连接状态
                  newChannels[topic.id] = {
                    ...newChannels[topic.id],
                    sessionId: session.id,
                    title: topic.name,
                    agentId: session.agent_id,
                  };
                }

                return {
                  id: topic.id,
                  sessionId: session.id,
                  title: topic.name,
                  updatedAt: topic.updated_at,
                  assistantTitle: getAgentNameById(session.agent_id),
                  lastMessage: "",
                  isPinned: false,
                };
              }) || []
            );
          },
        );

        set((state: ChatSlice) => {
          state.chatHistory = chatHistory;
          state.chatHistoryLoading = false;

          for (const [topicId, incomingChannel] of Object.entries(
            newChannels,
          )) {
            const existing = state.channels[topicId];
            if (!existing) {
              // New topic — safe to insert
              state.channels[topicId] = incomingChannel;
            } else {
              // Existing topic — only update metadata fields,
              // preserve messages/runtime state from the live Immer draft
              existing.sessionId = incomingChannel.sessionId;
              existing.title = incomingChannel.title;
              existing.agentId = incomingChannel.agentId;
              if (incomingChannel.provider_id !== undefined)
                existing.provider_id = incomingChannel.provider_id;
              if (incomingChannel.model !== undefined)
                existing.model = incomingChannel.model;
              if (incomingChannel.model_tier !== undefined)
                existing.model_tier = incomingChannel.model_tier;
            }
          }
        });
      } catch (error) {
        console.error("ChatSlice: Failed to fetch chat history:", error);
        set({ chatHistoryLoading: false });
      } finally {
        setLoading("chatHistory", false);
      }
    },

    togglePinChat: (chatId: string) => {
      set((state: ChatSlice) => {
        const chat = state.chatHistory.find((c) => c.id === chatId);
        if (chat) {
          chat.isPinned = !chat.isPinned;
        }
      });
    },

    activateChannel: async (topicId: string) => {
      const { channels, activeChatChannel, connectToChannel, backendUrl } =
        get();

      console.warn(
        `[activateChannel] topic=${topicId.slice(0, 8)} current=${activeChatChannel?.slice(0, 8)} connected=${channels[topicId]?.connected} msgs=${channels[topicId]?.messages.length} responding=${channels[topicId]?.responding}`,
      );

      if (topicId === activeChatChannel && channels[topicId]?.connected) {
        console.warn(`[activateChannel] SKIP (already active & connected)`);
        return;
      }

      set({ activeChatChannel: topicId });

      // Track active topic per agent
      const existingChannel = channels[topicId];
      if (existingChannel?.agentId) {
        set((state: ChatSlice) => {
          state.activeTopicByAgent[existingChannel.agentId!] = topicId;
        });
      }

      let channel = channels[topicId];

      if (!channel) {
        try {
          const token = authService.getToken();
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }

          const response = await fetch(`${backendUrl}/xyzen/api/v1/sessions/`, {
            headers,
          });
          if (!response.ok) throw new Error("Failed to fetch sessions");

          const sessions: SessionResponse[] = await response.json();
          let sessionId = null;
          let topicName = null;
          let sessionAgentId = undefined;
          let sessionProviderId = undefined;
          let sessionModel = undefined;
          let sessionModelTier = undefined;
          let sessionKnowledgeSetId = undefined;

          for (const session of sessions) {
            const topic = session.topics.find((t) => t.id === topicId);
            if (topic) {
              sessionId = session.id;
              topicName = topic.name;
              sessionAgentId = session.agent_id; // 获取 session 的 agent_id
              sessionProviderId = session.provider_id;
              sessionModel = session.model;
              sessionModelTier = session.model_tier;
              sessionKnowledgeSetId = session.knowledge_set_id;
              break;
            }
          }

          if (sessionId && topicName) {
            channel = {
              id: topicId,
              sessionId: sessionId,
              title: topicName,
              messages: [],
              agentId: sessionAgentId, // 使用从 session 获取的 agentId
              provider_id: sessionProviderId,
              model: sessionModel,
              model_tier: sessionModelTier,
              knowledge_set_id: sessionKnowledgeSetId,
              connected: false,
              error: null,
            };
            set((state: ChatSlice) => {
              state.channels[topicId] = channel!;
            });
          } else {
            console.error(
              `Topic ${topicId} not found in any session, refetching history...`,
            );
            await get().fetchChatHistory();
            const newChannels = get().channels;
            if (newChannels[topicId]) {
              channel = newChannels[topicId];
            } else {
              console.error(`Topic ${topicId} still not found after refetch.`);
              set({ activeChatChannel: null });
              return;
            }
          }
        } catch (error) {
          console.error("Failed to find session for topic:", error);
          set({ activeChatChannel: null });
          return;
        }
      }

      if (channel) {
        // If the topic already has a live WS connection, the in-memory state is
        // authoritative (events are flowing in real-time). Skip reconciliation
        // to avoid replacing streaming content with stale DB data.
        const hasLiveWs = xyzenService.hasConnection(topicId);

        if (!hasLiveWs) {
          const hasUnresolvedRuntimeState = channel.messages.some((m) =>
            Boolean(
              m.status === "pending" ||
              m.status === "streaming" ||
              m.status === "thinking" ||
              m.isLoading ||
              m.isStreaming ||
              m.isThinking ||
              m.agentExecution?.status === "running",
            ),
          );

          console.warn(
            `[activateChannel] noLiveWs, msgs=${channel.messages.length} stale=${hasUnresolvedRuntimeState} → ${channel.messages.length === 0 || hasUnresolvedRuntimeState ? "RECONCILE" : "SKIP"}`,
          );

          // Reconcile with backend when no messages OR when runtime flags may be
          // stale (e.g. WS died during streaming and missed terminal events).
          if (channel.messages.length === 0 || hasUnresolvedRuntimeState) {
            await reconcileChannelFromBackend(topicId);
          }
        } else {
          console.warn(`[activateChannel] hasLiveWs, skipping reconcile`);
        }
        connectToChannel(channel.sessionId, channel.id);

        // Wait for connection to be established.
        await waitForChannelConnection(topicId, { logFailure: true });
      }
    },

    /**
     * Activate or create a chat channel for a specific agent.
     * This is used by both the sidebar and spatial workspace to open chat with an agent.
     * Always activates the most recent topic (by updated_at) for the agent.
     * - If no session exists, creates one with a default topic
     */
    activateChannelForAgent: async (agentId: string) => {
      const { backendUrl } = get();

      // Fetch from backend to get the most recent topic
      const token = authService.getToken();
      if (!token) {
        console.error("No authentication token available");
        return;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      try {
        // Try to get existing session for this agent
        const sessionResponse = await fetch(
          `${backendUrl}/xyzen/api/v1/sessions/by-agent/${agentId}`,
          { headers },
        );

        if (sessionResponse.ok) {
          const session = await sessionResponse.json();

          // Get the most recent topic for this session, or create one
          if (session.topics && session.topics.length > 0) {
            // Activate the most recent topic (backend returns topics ordered by updated_at descending)
            const latestTopic = session.topics[0];

            // Create channel if doesn't exist
            const channel: ChatChannel = {
              id: latestTopic.id,
              sessionId: session.id,
              title: latestTopic.name,
              messages: [],
              agentId: session.agent_id,
              provider_id: session.provider_id,
              model: session.model,
              model_tier: session.model_tier,
              knowledge_set_id: session.knowledge_set_id,
              connected: false,
              error: null,
            };

            set((state) => {
              const existingChannel = state.channels[latestTopic.id];
              state.channels[latestTopic.id] = mergeChannelPreservingRuntime(
                existingChannel,
                channel,
              );
            });

            await get().activateChannel(latestTopic.id);
          } else {
            // Session exists but no topics, create a default topic
            const topicResponse = await fetch(
              `${backendUrl}/xyzen/api/v1/topics/`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  name: "新的聊天",
                  session_id: session.id,
                }),
              },
            );

            if (topicResponse.ok) {
              const newTopic = await topicResponse.json();

              const channel: ChatChannel = {
                id: newTopic.id,
                sessionId: session.id,
                title: newTopic.name,
                messages: [],
                agentId: session.agent_id,
                provider_id: session.provider_id,
                model: session.model,
                model_tier: session.model_tier,
                knowledge_set_id: session.knowledge_set_id,
                connected: false,
                error: null,
              };

              set((state) => {
                state.channels[newTopic.id] = channel;
              });

              await get().activateChannel(newTopic.id);
            }
          }
        } else {
          // No session exists, create one via createDefaultChannel
          await get().createDefaultChannel(agentId);
        }
      } catch (error) {
        console.error("Failed to activate channel for agent:", error);
        // Fallback to createDefaultChannel
        await get().createDefaultChannel(agentId);
      }
    },

    connectToChannel: (sessionId: string, topicId: string) => {
      console.warn(
        `[connectToChannel] topic=${topicId.slice(0, 8)} hasExistingWs=${xyzenService.hasConnection(topicId)} msgs=${get().channels[topicId]?.messages.length}`,
      );
      // --- 0. Build shared callbacks (defined early so they can be passed to setPrimary or connect) ---

      // Clean up stale watchdog for the *previous* primary topic (not the target)
      const prevPrimary = xyzenService.getPrimaryTopicId();
      if (prevPrimary && prevPrimary !== topicId) {
        const prevTimer = staleWatchdogIds.get(prevPrimary);
        if (prevTimer) {
          clearInterval(prevTimer);
          staleWatchdogIds.delete(prevPrimary);
        }
      }

      // --- Chunk buffering: batch streaming_chunk and thinking_chunk at rAF cadence ---
      const chunkBuffer = new ChunkBuffer((fn) => {
        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (channel) fn(channel);
        });
      });

      // --- Define event callback ---
      const messageEventCallback: MessageEventCallback = (event) => {
        // --- Hot-path: buffer chunk events and flush at rAF cadence ---
        if (event.type === "streaming_chunk") {
          chunkBuffer.pushStreaming(
            event.data.stream_id,
            event.data.content,
            event.data.execution_id,
          );
          return;
        }

        if (event.type === "thinking_chunk") {
          chunkBuffer.pushThinking(event.data.stream_id, event.data.content);
          return;
        }

        // --- Non-chunk events: flush any pending chunks first, then process synchronously ---
        const hadPendingChunks = chunkBuffer.hasPending;
        chunkBuffer.flushSync();

        const preEventResponding = get().channels[topicId]?.responding;

        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (!channel) return;

          // Diagnostic: log every event with timestamp and key state info
          console.log(
            `[ChatEvent] type=${event.type}`,
            `| responding=${channel.responding}`,
            `| msgs=${channel.messages.length}`,
            `| latestAssist=${(() => {
              const la = [...channel.messages]
                .reverse()
                .find((m) => m.role === "assistant");
              return la
                ? `id=${la.id.slice(0, 12)} status=${la.status} isLoading=${la.isLoading} isStreaming=${la.isStreaming} agentExec=${la.agentExecution?.status}`
                : "none";
            })()}`,
          );

          switch (event.type) {
            case "processing":
            case "loading": {
              handleProcessingOrLoading(channel, event.data.stream_id);
              break;
            }

            case "streaming_start": {
              handleStreamingStart(channel, event.data);
              break;
            }

            case "streaming_end": {
              handleStreamingEnd(channel, event.data);
              break;
            }

            case "message": {
              handleMessage(channel, event.data);
              break;
            }

            case "search_citations": {
              handleSearchCitations(channel, event.data);
              break;
            }

            case "generated_files": {
              handleGeneratedFiles(channel, event.data);
              break;
            }

            case "message_saved": {
              handleMessageSaved(channel, event.data);
              break;
            }

            case "message_ack": {
              // Reconcile optimistic user message with server-assigned ID.
              // The backend echoes back the client_id we sent so we can
              // upgrade the temporary clientId-based message to a real DB ID.
              const { message_id, client_id } = event.data;
              if (client_id) {
                const optimisticIdx = channel.messages.findIndex(
                  (m) => m.clientId === client_id,
                );
                if (optimisticIdx !== -1) {
                  const msg = channel.messages[optimisticIdx];
                  msg.id = message_id;
                  if (msg.status === "sending") {
                    msg.status = "completed";
                  }
                }
              }
              break;
            }

            case "tool_call_request": {
              handleToolCallRequest(channel, event.data);
              break;
            }

            case "tool_call_response": {
              handleToolCallResponse(channel, event.data);
              break;
            }

            case "error": {
              handleError(channel, event.data);
              break;
            }

            case "insufficient_balance": {
              const notification = handleInsufficientBalance(
                channel,
                event.data,
              );
              if (notification) {
                state.notification = {
                  ...notification,
                  onAction: notification.actionUrl
                    ? () => window.open(notification.actionUrl, "_blank")
                    : undefined,
                };
              }
              break;
            }

            case "parallel_chat_limit": {
              const notification = handleParallelChatLimit(channel, event.data);
              state.notification = notification;
              break;
            }

            case "stream_aborted": {
              handleStreamAborted(channel, event.data, abortTimeoutIds);
              break;
            }

            case "thinking_start": {
              handleThinkingStart(channel, event.data);
              break;
            }

            case "thinking_end": {
              handleThinkingEnd(channel, event.data);
              break;
            }

            case "topic_updated": {
              handleTopicUpdated(channel, event.data, state.chatHistory);
              break;
            }

            // === Agent Execution Events ===

            case "agent_start": {
              handleAgentStart(channel, event.data);
              break;
            }

            case "agent_end": {
              handleAgentEnd(channel, event.data);
              break;
            }

            case "agent_error": {
              handleAgentError(channel, event.data);
              break;
            }

            case "node_start": {
              handleNodeStart(channel, event.data);
              break;
            }

            case "node_end": {
              handleNodeEnd(channel, event.data);
              break;
            }

            case "subagent_start": {
              handleSubagentStart(channel, event.data);
              break;
            }

            case "subagent_end": {
              handleSubagentEnd(channel, event.data);
              break;
            }

            case "progress_update": {
              handleProgressUpdate(channel, event.data);
              break;
            }
          }

          // Keep channel-level responding state consistent even with concurrent streams.
          syncChannelResponding(channel);
        });

        // Log state transition if responding changed
        const postEventResponding = get().channels[topicId]?.responding;
        if (preEventResponding !== postEventResponding) {
          console.warn(
            `[ChatSlice] responding changed: ${preEventResponding} → ${postEventResponding}`,
            `| event: ${event.type}`,
            `| hadPendingChunks: ${hadPendingChunks}`,
          );
        }

        // Chunk events return early above, so all events reaching here are state transitions
        updateDerivedStatus();
        closeIdleNonPrimaryConnection(topicId);
      };

      // --- Shared callbacks for onMessage, onStatusChange, onReconnect ---
      const onMessage = (
        message: import("../types").Message & { client_id?: string },
      ) => {
        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (!channel) return;

          // Reconcile with optimistic message if client_id matches
          if (message.client_id) {
            const optimisticIdx = channel.messages.findIndex(
              (m) => m.clientId === message.client_id,
            );
            if (optimisticIdx !== -1) {
              channel.messages[optimisticIdx] = {
                ...channel.messages[optimisticIdx],
                ...message,
                id: message.id,
                status: message.status || "completed",
                isNewMessage: false,
              };
              return;
            }
          }

          // Normal path: push if not duplicate
          if (!channel.messages.some((m) => m.id === message.id)) {
            channel.messages.push({
              ...message,
              status: message.status || "completed",
              isNewMessage: true,
            });
          }
        });
      };

      const onStatusChange = (status: {
        connected: boolean;
        error: string | null;
      }) => {
        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (channel) {
            channel.connected = status.connected;
            channel.error = status.error;
          }
        });
      };

      const onReconnect = () => {
        const channel = get().channels[topicId];
        if (!channel) return;

        const hasStaleState = channel.messages.some((m) =>
          Boolean(
            m.status === "pending" ||
            m.status === "streaming" ||
            m.status === "thinking" ||
            m.isLoading ||
            m.isStreaming ||
            m.isThinking ||
            m.agentExecution?.status === "running",
          ),
        );

        if (hasStaleState) {
          console.warn(
            `[onReconnect] stale state detected, reconciling topic=${topicId.slice(0, 8)} msgs=${channel.messages.length} responding=${channel.responding}`,
          );
          reconcileChannelFromBackend(topicId);
        }
      };

      // --- If the target topic already has a live WS, just promote to primary ---
      if (xyzenService.hasConnection(topicId)) {
        xyzenService.setPrimary(
          topicId,
          onMessage,
          onStatusChange,
          messageEventCallback,
          onReconnect,
        );
        // Mark channel as connected (it already is, but ensure store is consistent)
        set((state: ChatSlice) => {
          if (state.channels[topicId]) {
            state.channels[topicId].connected = true;
            state.channels[topicId].error = null;
          }
        });
        return;
      }

      // --- Close non-responding, non-primary idle connections to avoid leaking ---
      const openTopics = xyzenService.getOpenTopicIds();
      for (const openTopic of openTopics) {
        if (openTopic === topicId) continue;
        const ch = get().channels[openTopic];
        if (!ch?.responding) {
          xyzenService.closeConnection(openTopic);
          const timer = staleWatchdogIds.get(openTopic);
          if (timer) {
            clearInterval(timer);
            staleWatchdogIds.delete(openTopic);
          }
        }
      }

      // --- Mark old channels as disconnected (only those we don't have WS for) ---
      set((state: ChatSlice) => {
        Object.entries(state.channels).forEach(([chId, ch]) => {
          // Keep channels with live WS marked as connected
          if (xyzenService.hasConnection(chId)) return;
          ch.connected = false;
        });
        if (state.channels[topicId]) {
          state.channels[topicId].error = null;
        }
      });

      // --- Open new WS for this topic ---
      xyzenService.connect(
        sessionId,
        topicId,
        onMessage,
        onStatusChange,
        messageEventCallback,
        onReconnect,
      );

      // --- Stale state watchdog ---
      const STALE_STATE_TIMEOUT_MS = 60_000;
      const STALE_CHECK_INTERVAL_MS = 15_000;
      let lastActivityTimestamp = Date.now();

      // Wrap the event callback to track activity for the stale watchdog
      const originalOnMessageEvent = messageEventCallback;
      const wrappedCallback: MessageEventCallback = (event) => {
        lastActivityTimestamp = Date.now();
        originalOnMessageEvent(event);
      };
      // Update the connection's event callback to the wrapped version
      xyzenService.setPrimary(
        topicId,
        onMessage,
        onStatusChange,
        wrappedCallback,
        onReconnect,
      );

      const staleCheckIntervalId = setInterval(() => {
        const channel = get().channels[topicId];
        if (!channel?.responding) return;

        const timeSinceActivity = Date.now() - lastActivityTimestamp;
        if (timeSinceActivity > STALE_STATE_TIMEOUT_MS) {
          console.warn(
            `ChatSlice: Stale state detected for topic ${topicId}: ${timeSinceActivity}ms since last activity, reconciling...`,
          );
          reconcileChannelFromBackend(topicId);
          lastActivityTimestamp = Date.now();
        }
      }, STALE_CHECK_INTERVAL_MS);

      const prevStaleCheck = staleWatchdogIds.get(topicId);
      if (prevStaleCheck) clearInterval(prevStaleCheck);
      staleWatchdogIds.set(topicId, staleCheckIntervalId);
    },

    disconnectFromChannel: () => {
      xyzenService.disconnect();
    },

    sendMessage: async (message: string) => {
      const {
        activeChatChannel,
        uploadedFiles,
        clearFiles,
        isUploading,
        channels,
        connectToChannel,
        showNotification,
      } = get();

      if (!activeChatChannel) return;

      // Don't allow sending while files are uploading
      if (isUploading) {
        console.warn("Cannot send message while files are uploading");
        return;
      }

      const activeChannel = channels[activeChatChannel];
      if (!activeChannel) return;

      // Ensure websocket is connected to the active topic before sending.
      if (!activeChannel.connected) {
        connectToChannel(activeChannel.sessionId, activeChannel.id);
        await waitForChannelConnection(activeChatChannel);
      }

      const recheckedChannel = get().channels[activeChatChannel];
      if (!recheckedChannel?.connected) {
        showNotification(
          "Connection not ready",
          "Please wait for chat connection and try again.",
          "warning",
        );
        return;
      }

      // Generate a client_id to correlate the optimistic message with the backend echo
      const clientId = generateClientId();

      // Collect completed file IDs
      const completedFiles = uploadedFiles.filter(
        (f) => f.status === "completed" && f.uploadedId,
      );

      // Build attachment previews from uploaded files for optimistic rendering
      const optimisticAttachments = completedFiles.map((f) => ({
        id: f.uploadedId!,
        name: f.file.name,
        type: f.file.type,
        size: f.file.size,
        category: (f.file.type.startsWith("image/")
          ? "images"
          : f.file.type.startsWith("audio/")
            ? "audio"
            : f.file.type === "application/pdf" ||
                f.file.type.includes("document")
              ? "documents"
              : "others") as "images" | "documents" | "audio" | "others",
      }));

      // --- Optimistic insert: render user message immediately ---
      set((state: ChatSlice) => {
        const channel = state.channels[activeChatChannel];
        if (channel) {
          channel.responding = true;
          channel.messages.push({
            id: clientId,
            clientId,
            role: "user",
            content: message,
            created_at: new Date().toISOString(),
            status: "sending",
            isNewMessage: true,
            ...(optimisticAttachments.length > 0
              ? { attachments: optimisticAttachments }
              : {}),
          });
        }
      });
      updateDerivedStatus();

      const payload: Record<string, unknown> = { message, client_id: clientId };
      if (completedFiles.length > 0) {
        payload.file_ids = completedFiles.map((f) => f.uploadedId!);
      }

      const channel = recheckedChannel;
      if (channel?.knowledgeContext) {
        payload.context = channel.knowledgeContext;
      }

      const sendSuccess = xyzenService.sendStructuredMessage(payload);

      if (!sendSuccess) {
        // Mark optimistic message as failed instead of removing it
        set((state: ChatSlice) => {
          const ch = state.channels[activeChatChannel];
          if (ch) {
            ch.responding = false;
            const optimisticMsg = ch.messages.find(
              (m) => m.clientId === clientId,
            );
            if (optimisticMsg) {
              optimisticMsg.status = "failed";
            }
          }
        });
        updateDerivedStatus();
        return;
      }

      // Clear files after sending (don't delete from server - they're now linked to the message)
      clearFiles(false);
    },

    createDefaultChannel: async (agentId) => {
      try {
        const agentIdParam = agentId || "default";
        const token = authService.getToken();

        if (!token) {
          console.error("No authentication token available");
          return;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };

        // First, try to find an existing session for this user-agent combination
        try {
          const existingSessionResponse = await fetch(
            `${get().backendUrl}/xyzen/api/v1/sessions/by-agent/${agentIdParam}`,
            { headers },
          );

          if (existingSessionResponse.ok) {
            // Found existing session, create a new topic for it
            const existingSession = await existingSessionResponse.json();

            // If existing session doesn't have provider/model, update it with defaults
            if (!existingSession.provider_id || !existingSession.model) {
              console.log(
                "  - 🔄 Existing session missing provider/model, updating with defaults...",
              );
              try {
                const state = get();
                const agent = state.agents.find(
                  (a) => a.id === existingSession.agent_id,
                );

                let providerId = existingSession.provider_id;
                let model = existingSession.model;

                // Use agent's provider/model if available
                if (agent?.provider_id && agent?.model) {
                  providerId = agent.provider_id;
                  model = agent.model;
                } else {
                  // Otherwise use system defaults
                  const defaults =
                    await providerCore.getDefaultProviderAndModel(
                      state.llmProviders,
                    );
                  providerId = providerId || defaults.providerId;
                  model = model || defaults.model;
                }

                if (providerId && model) {
                  // Update the session with provider/model
                  await sessionService.updateSession(existingSession.id, {
                    provider_id: providerId,
                    model: model,
                  });
                  existingSession.provider_id = providerId;
                  existingSession.model = model;
                  console.log(
                    `  - ✅ Updated session with provider (${providerId}) and model (${model})`,
                  );
                }
              } catch (error) {
                console.warn(
                  "  - ⚠️ Failed to update session with defaults:",
                  error,
                );
              }
            }

            const newTopicResponse = await fetch(
              `${get().backendUrl}/xyzen/api/v1/topics/`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  name: "新的聊天",
                  session_id: existingSession.id,
                }),
              },
            );

            if (!newTopicResponse.ok) {
              throw new Error("Failed to create new topic in existing session");
            }

            const newTopic = await newTopicResponse.json();

            const newChannel: ChatChannel = {
              id: newTopic.id,
              sessionId: existingSession.id,
              title: newTopic.name,
              messages: [],
              agentId: existingSession.agent_id,
              provider_id: existingSession.provider_id,
              model: existingSession.model,
              model_tier: existingSession.model_tier,
              knowledge_set_id: existingSession.knowledge_set_id,
              connected: false,
              error: null,
            };

            const newHistoryItem: ChatHistoryItem = {
              id: newTopic.id,
              sessionId: existingSession.id,
              title: newTopic.name,
              updatedAt: newTopic.updated_at,
              assistantTitle: getAgentNameById(existingSession.agent_id),
              lastMessage: "",
              isPinned: false,
            };

            set((state: XyzenState) => {
              state.channels[newTopic.id] = newChannel;
              state.chatHistory.unshift(newHistoryItem);
              state.activeChatChannel = newTopic.id;
              state.activeTabIndex = 1;
            });

            get().connectToChannel(existingSession.id, newTopic.id);
            return;
          }
        } catch {
          // If session lookup fails, we'll create a new session below
          console.log("No existing session found, creating new session");
        }

        // No existing session found, create a new session
        // Get agent data to include MCP servers
        const state = get();
        const agent = state.agents.find((a) => a.id === agentId);

        const sessionPayload: Record<string, unknown> = {
          name: "New Session",
          agent_id: agentId,
        };

        // Include MCP server IDs if agent has them
        if (agent?.mcp_servers?.length) {
          sessionPayload.mcp_server_ids = agent.mcp_servers.map((s) => s.id);
        }

        // Ensure providers are loaded before proceeding
        let currentProviders = state.llmProviders;
        if (currentProviders.length === 0) {
          try {
            await get().fetchMyProviders();
            currentProviders = get().llmProviders;
          } catch (error) {
            console.error("Failed to fetch providers:", error);
          }
        }

        try {
          if (agent?.provider_id && agent?.model) {
            sessionPayload.provider_id = agent.provider_id;
            sessionPayload.model = agent.model;
          } else {
            const { providerId, model } =
              await providerCore.getDefaultProviderAndModel(currentProviders);
            if (providerId && model) {
              sessionPayload.provider_id = providerId;
              sessionPayload.model = model;
            }
          }
        } catch (error) {
          console.error("Error getting provider/model:", error);
        }

        // The backend will automatically extract user_id from the token
        const response = await fetch(
          `${get().backendUrl}/xyzen/api/v1/sessions/`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(sessionPayload),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Session creation failed:", response.status, errorText);
          throw new Error(
            `Failed to create new session: ${response.status} ${errorText}`,
          );
        }

        const newSession: SessionResponse = await response.json();

        if (newSession.topics && newSession.topics.length > 0) {
          const newTopic = newSession.topics[0];

          const newChannel: ChatChannel = {
            id: newTopic.id,
            sessionId: newSession.id,
            title: newTopic.name,
            messages: [],
            agentId: newSession.agent_id,
            provider_id: newSession.provider_id,
            model: newSession.model,
            model_tier: newSession.model_tier,
            connected: false,
            error: null,
          };

          const newHistoryItem: ChatHistoryItem = {
            id: newTopic.id,
            sessionId: newSession.id,
            title: newTopic.name,
            updatedAt: newTopic.updated_at,
            assistantTitle: getAgentNameById(newSession.agent_id),
            lastMessage: "",
            isPinned: false,
          };

          set((state: XyzenState) => {
            state.channels[newTopic.id] = newChannel;
            state.chatHistory.unshift(newHistoryItem);
            state.activeChatChannel = newTopic.id;
            state.activeTabIndex = 1;
          });

          get().connectToChannel(newSession.id, newTopic.id);
        } else {
          // Session created but no default topic - create one manually
          const topicResponse = await fetch(
            `${get().backendUrl}/xyzen/api/v1/topics/`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                name: "新的聊天",
                session_id: newSession.id,
              }),
            },
          );

          if (!topicResponse.ok) {
            const errorText = await topicResponse.text();
            console.error(
              "Failed to create default topic:",
              topicResponse.status,
              errorText,
            );
            throw new Error(
              `Failed to create default topic for new session: ${topicResponse.status} ${errorText}`,
            );
          }

          const newTopic = await topicResponse.json();

          // Same navigation logic as above
          const newChannel: ChatChannel = {
            id: newTopic.id,
            sessionId: newSession.id,
            title: newTopic.name,
            messages: [],
            agentId: newSession.agent_id,
            provider_id: newSession.provider_id,
            model: newSession.model,
            model_tier: newSession.model_tier,
            connected: false,
            error: null,
          };

          const newHistoryItem: ChatHistoryItem = {
            id: newTopic.id,
            sessionId: newSession.id,
            title: newTopic.name,
            updatedAt: newTopic.updated_at,
            assistantTitle: getAgentNameById(newSession.agent_id),
            lastMessage: "",
            isPinned: false,
          };

          set((state: XyzenState) => {
            state.channels[newTopic.id] = newChannel;
            state.chatHistory.unshift(newHistoryItem);
            state.activeChatChannel = newTopic.id;
            state.activeTabIndex = 1;
          });

          get().connectToChannel(newSession.id, newTopic.id);
        }
      } catch (error) {
        console.error("Failed to create channel:", error);
      }
    },

    updateTopicName: async (topicId: string, newName: string) => {
      try {
        const token = authService.getToken();
        if (!token) {
          console.error("No authentication token available");
          return;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };

        const response = await fetch(
          `${get().backendUrl}/xyzen/api/v1/topics/${topicId}`,
          {
            method: "PUT",
            headers,
            body: JSON.stringify({ name: newName }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to update topic name");
        }

        // 更新本地状态
        set((state: XyzenState) => {
          // 更新 channels 中的标题
          if (state.channels[topicId]) {
            state.channels[topicId].title = newName;
          }

          // 更新 chatHistory 中的标题
          const chatHistoryItem = state.chatHistory.find(
            (item) => item.id === topicId,
          );
          if (chatHistoryItem) {
            chatHistoryItem.title = newName;
          }
        });

        console.log(`Topic ${topicId} name updated to: ${newName}`);
      } catch (error) {
        console.error("Failed to update topic name:", error);
        throw error;
      }
    },

    deleteTopic: async (topicId: string) => {
      try {
        const token = authService.getToken();
        if (!token) {
          console.error("No authentication token available");
          return;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };

        const response = await fetch(
          `${get().backendUrl}/xyzen/api/v1/topics/${topicId}`,
          {
            method: "DELETE",
            headers,
          },
        );

        if (!response.ok) {
          throw new Error("Failed to delete topic");
        }

        set((state: XyzenState) => {
          // Remove from channels
          delete state.channels[topicId];

          // Remove from chatHistory
          state.chatHistory = state.chatHistory.filter(
            (item) => item.id !== topicId,
          );

          // If the deleted topic was active, activate another one
          if (state.activeChatChannel === topicId) {
            const nextTopic = state.chatHistory[0];
            if (nextTopic) {
              state.activeChatChannel = nextTopic.id;
              get().activateChannel(nextTopic.id);
            } else {
              state.activeChatChannel = null;
            }
          }
        });

        console.log(`Topic ${topicId} deleted`);
      } catch (error) {
        console.error("Failed to delete topic:", error);
        throw error;
      }
    },

    clearSessionTopics: async (sessionId: string) => {
      try {
        const token = authService.getToken();
        if (!token) {
          console.error("No authentication token available");
          return;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };

        const response = await fetch(
          `${get().backendUrl}/xyzen/api/v1/sessions/${sessionId}/topics`,
          {
            method: "DELETE",
            headers,
          },
        );

        if (!response.ok) {
          throw new Error("Failed to clear session topics");
        }

        // Refresh chat history to get the new default topic
        await get().fetchChatHistory();

        console.log(`Session ${sessionId} topics cleared`);
      } catch (error) {
        console.error("Failed to clear session topics:", error);
      }
    },

    updateSessionConfig: async (sessionId, config) => {
      const { token, backendUrl } = get();
      if (!token) return;

      try {
        const response = await fetch(
          `${backendUrl}/xyzen/api/v1/sessions/${sessionId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(config),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to update session config");
        }

        const updatedSession = await response.json();

        set((state) => {
          // Update active channel if it matches this session
          const activeChannelId = state.activeChatChannel;
          if (
            activeChannelId &&
            state.channels[activeChannelId]?.sessionId === sessionId
          ) {
            state.channels[activeChannelId].provider_id =
              updatedSession.provider_id;
            state.channels[activeChannelId].model = updatedSession.model;
            state.channels[activeChannelId].model_tier =
              updatedSession.model_tier;
            state.channels[activeChannelId].knowledge_set_id =
              updatedSession.knowledge_set_id;
          }
        });
      } catch (error) {
        console.error("Failed to update session config:", error);
        get().showNotification(
          "Error",
          "Failed to update session configuration",
          "error",
        );
      }
    },

    updateSessionProviderAndModel: async (sessionId, providerId, model) => {
      try {
        await sessionService.updateSession(sessionId, {
          provider_id: providerId,
          model: model,
        });

        set((state) => {
          // Update active channel if it matches this session
          const activeChannelId = state.activeChatChannel;
          if (
            activeChannelId &&
            state.channels[activeChannelId]?.sessionId === sessionId
          ) {
            state.channels[activeChannelId].provider_id = providerId;
            state.channels[activeChannelId].model = model;
          }

          // Update all channels that belong to this session
          Object.keys(state.channels).forEach((channelId) => {
            if (state.channels[channelId].sessionId === sessionId) {
              state.channels[channelId].provider_id = providerId;
              state.channels[channelId].model = model;
            }
          });
        });
      } catch (error) {
        console.error("Failed to update session provider and model:", error);
        get().showNotification(
          "Error",
          "Failed to update model selection",
          "error",
        );
      }
    },

    // Tool call confirmation methods
    confirmToolCall: (channelId: string, toolCallId: string) => {
      // Send confirmation to backend via WebSocket
      xyzenService.sendStructuredMessage({
        type: "tool_call_confirm",
        data: { toolCallId },
      });

      // Update tool call status in messages
      set((state: ChatSlice) => {
        if (state.channels[channelId]) {
          state.channels[channelId].messages.forEach((message) => {
            if (message.toolCalls) {
              message.toolCalls.forEach((toolCall) => {
                if (
                  toolCall.id === toolCallId &&
                  toolCall.status === "waiting_confirmation"
                ) {
                  toolCall.status = "executing";
                }
              });
            }
          });
        }
      });
    },

    cancelToolCall: (channelId: string, toolCallId: string) => {
      // Send cancellation to backend via WebSocket
      xyzenService.sendStructuredMessage({
        type: "tool_call_cancel",
        data: { toolCallId },
      });

      // Update tool call status to failed in messages
      set((state: ChatSlice) => {
        if (state.channels[channelId]) {
          state.channels[channelId].messages.forEach((message) => {
            if (message.toolCalls) {
              message.toolCalls.forEach((toolCall) => {
                if (
                  toolCall.id === toolCallId &&
                  toolCall.status === "waiting_confirmation"
                ) {
                  toolCall.status = "failed";
                  toolCall.error = "用户取消执行";
                }
              });
            }
          });
        }
      });
    },

    abortGeneration: (channelId: string) => {
      // Send abort signal to backend via WebSocket
      xyzenService.sendAbort();

      // Clear any existing abort timeout for this channel to prevent stale timers
      const existingTimeout = abortTimeoutIds.get(channelId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        abortTimeoutIds.delete(channelId);
      }

      // Optimistically update UI state
      set((state: ChatSlice) => {
        if (state.channels[channelId]) {
          state.channels[channelId].aborting = true;
        }
      });
      updateDerivedStatus();

      // Timeout fallback: if backend doesn't respond within 10 seconds, reset state
      // This prevents the UI from being stuck in aborting/responding state
      const timeoutId = setTimeout(() => {
        // Clean up the timeout reference
        abortTimeoutIds.delete(channelId);

        const currentState = get();
        const channel = currentState.channels[channelId];
        if (channel?.aborting) {
          console.warn(
            "Abort timeout: Backend did not respond, resetting state",
          );
          set((state: ChatSlice) => {
            if (state.channels[channelId]) {
              state.channels[channelId].aborting = false;
              state.channels[channelId].responding = false;

              // Handle loading message - convert to cancelled message instead of removing
              const loadingIndex = state.channels[channelId].messages.findIndex(
                (m) => m.isLoading,
              );
              if (loadingIndex !== -1) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { isLoading: _, ...messageWithoutLoading } =
                  state.channels[channelId].messages[loadingIndex];
                state.channels[channelId].messages[loadingIndex] = {
                  ...messageWithoutLoading,
                  id: `aborted-${Date.now()}`,
                  agentExecution: {
                    agentId: "",
                    agentName: "",
                    agentType: "react",
                    executionId: `aborted-${Date.now()}`,
                    status: "cancelled",
                    startedAt: Date.now(),
                    endedAt: Date.now(),
                    phases: [],
                    subagents: [],
                  },
                };
              }

              // Finalize any streaming message
              const streamingIndex = state.channels[
                channelId
              ].messages.findIndex((m) => m.isStreaming);
              if (streamingIndex !== -1) {
                state.channels[channelId].messages[streamingIndex].isStreaming =
                  false;
              }

              // Mark running agent executions as cancelled
              const agentMsgIndex = state.channels[
                channelId
              ].messages.findIndex(
                (m) => m.agentExecution?.status === "running",
              );
              if (agentMsgIndex !== -1) {
                const execution =
                  state.channels[channelId].messages[agentMsgIndex]
                    .agentExecution;
                if (execution) {
                  execution.status = "cancelled";
                  execution.phases.forEach((phase) => {
                    if (phase.status === "running") {
                      phase.status = "cancelled";
                    }
                  });
                }
                state.channels[channelId].messages[agentMsgIndex].isStreaming =
                  false;
              }
            }
          });
          updateDerivedStatus();
        }
      }, 10000); // 10 second timeout

      // Track the timeout ID for cleanup
      abortTimeoutIds.set(channelId, timeoutId);
    },

    setKnowledgeContext: (channelId, context) => {
      set((state: ChatSlice) => {
        if (state.channels[channelId]) {
          state.channels[channelId].knowledgeContext = context || undefined;
        }
      });
    },

    // Message editing methods
    startEditMessage: (
      messageId: string,
      content: string,
      mode: "edit_only" | "edit_and_regenerate",
    ) => {
      set({
        editingMessageId: messageId,
        editingContent: content,
        editingMode: mode,
      });
    },

    cancelEditMessage: () => {
      set({
        editingMessageId: null,
        editingContent: "",
        editingMode: null,
      });
    },

    submitEditMessage: async () => {
      const {
        editingMessageId,
        editingContent,
        editingMode,
        activeChatChannel,
        channels,
        backendUrl,
      } = get();
      if (!editingMessageId || !activeChatChannel || !editingMode) return;

      const channel = channels[activeChatChannel];
      if (!channel) return;

      // Verify message belongs to the active channel before editing
      const messageExists = channel.messages.some(
        (m) => m.id === editingMessageId,
      );
      if (!messageExists) {
        console.error("Message not found in active channel, skipping edit");
        get().cancelEditMessage();
        return;
      }

      const truncateAndRegenerate = editingMode === "edit_and_regenerate";

      try {
        const token = authService.getToken();
        if (!token) {
          console.error("No authentication token available");
          return;
        }

        // Call API to edit message
        const response = await fetch(
          `${backendUrl}/xyzen/api/v1/messages/${editingMessageId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: editingContent,
              truncate_and_regenerate: truncateAndRegenerate,
            }),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Failed to edit message:", errorText);
          get().showNotification("Error", "Failed to edit message", "error");
          return;
        }

        const result = await response.json();

        // Update local state based on edit mode
        set((state: ChatSlice) => {
          const ch = state.channels[activeChatChannel];
          if (!ch) return;

          // Find the edited message index
          const editedIndex = ch.messages.findIndex(
            (m) => m.id === editingMessageId,
          );
          if (editedIndex === -1) return;

          // Update the message with server response
          ch.messages[editedIndex].content = result.message.content;
          ch.messages[editedIndex].created_at = result.message.created_at;

          // Only remove subsequent messages if truncate_and_regenerate was requested
          if (truncateAndRegenerate) {
            ch.messages = ch.messages.slice(0, editedIndex + 1);
            // Reset responding state before regeneration to avoid stuck UI
            ch.responding = false;
          }

          // Clear edit mode
          state.editingMessageId = null;
          state.editingContent = "";
          state.editingMode = null;
        });

        // Trigger regeneration if needed
        if (result.regenerate) {
          get().triggerRegeneration();
        }
      } catch (error) {
        console.error("Failed to edit message:", error);
        get().showNotification("Error", "Failed to edit message", "error");
      }
    },

    triggerRegeneration: () => {
      const { activeChatChannel } = get();
      if (!activeChatChannel) return;

      // Send regeneration request via WebSocket
      xyzenService.sendStructuredMessage({
        type: "regenerate",
      });

      // Mark channel as responding
      set((state: ChatSlice) => {
        const channel = state.channels[activeChatChannel];
        if (channel) {
          channel.responding = true;
        }
      });
    },

    deleteMessage: async (messageId: string) => {
      const { activeChatChannel, channels, backendUrl } = get();
      if (!activeChatChannel) return;

      const channel = channels[activeChatChannel];
      if (!channel) return;

      // Check if the message ID is a server-assigned UUID (not a client-generated temporary ID)
      if (!isValidUuid(messageId)) {
        // Find the message to provide contextual error
        const message = channel.messages.find((m) => m.id === messageId);
        const reason = message?.isStreaming
          ? "Message is still streaming"
          : "Message has not been saved to server yet";
        console.error(
          `Cannot delete message: ${reason} (id: ${messageId.slice(0, 20)}...)`,
        );
        get().showNotification("Cannot Delete", reason, "warning");
        return;
      }

      // Verify message belongs to the active channel before deleting
      const messageExists = channel.messages.some((m) => m.id === messageId);
      if (!messageExists) {
        console.error("Message not found in active channel, skipping delete");
        return;
      }

      try {
        const token = authService.getToken();
        if (!token) {
          console.error("No authentication token available");
          return;
        }

        // Call API to delete message
        const response = await fetch(
          `${backendUrl}/xyzen/api/v1/messages/${messageId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Failed to delete message:", errorText);
          get().showNotification("Error", "Failed to delete message", "error");
          return;
        }

        // Remove message from local state
        set((state: ChatSlice) => {
          const channel = state.channels[activeChatChannel];
          if (!channel) return;

          channel.messages = channel.messages.filter((m) => m.id !== messageId);
        });
      } catch (error) {
        console.error("Failed to delete message:", error);
        get().showNotification("Error", "Failed to delete message", "error");
      }
    },

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
  };
};
