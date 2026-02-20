import { mergeChannelPreservingRuntime } from "@/core/chat";
import { HttpError } from "@/service/http/client";
import { llmProviderService } from "@/service/llmProviderService";
import { sessionService, type SessionCreate } from "@/service/sessionService";
import { topicService } from "@/service/topicService";
import { providerCore } from "@/core/provider";
import xyzenService from "@/service/xyzenService";
import { cleanupTopicResources, pendingChannelOps } from "./helpers";
import type {
  ChatChannel,
  ChatHistoryItem,
  ChatSlice,
  GetState,
  Helpers,
  SetState,
  XyzenState,
} from "./types";

export function createChannelActions(
  set: SetState,
  get: GetState,
  helpers: Helpers,
) {
  const {
    reconcileChannelFromBackend,
    getAgentNameById,
    waitForChannelConnection,
  } = helpers;

  return {
    setActiveChatChannel: (channelId: string | null) =>
      set({ activeChatChannel: channelId }),

    fetchChatHistory: async () => {
      const { setLoading } = get();
      setLoading("chatHistory", true);

      try {
        const history = await sessionService.getSessions();

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

        const chatHistory: ChatHistoryItem[] = history.flatMap((session) => {
          return (
            session.topics?.map((topic) => {
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
                isPinned: topic.is_pinned ?? false,
              };
            }) || []
          );
        });

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
              // preserve messages/runtime state from the live Immer draft.
              // Skip entirely if the channel is actively responding to avoid
              // clobbering in-flight streaming state with stale DB data.
              if (existing.responding) continue;

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
        get().setLoading("chatHistory", false);
      }
    },

    togglePinChat: (chatId: string) => {
      const chat = get().chatHistory.find((c) => c.id === chatId);
      if (!chat) return;

      const newPinned = !chat.isPinned;

      // Optimistic update
      set((state: ChatSlice) => {
        const item = state.chatHistory.find((c) => c.id === chatId);
        if (item) {
          item.isPinned = newPinned;
        }
      });

      // Persist to backend
      topicService
        .updateTopic(chatId, { is_pinned: newPinned })
        .catch((error) => {
          console.error("Failed to persist pin state:", error);
          // Revert on failure
          set((state: ChatSlice) => {
            const item = state.chatHistory.find((c) => c.id === chatId);
            if (item) {
              item.isPinned = !newPinned;
            }
          });
        });
    },

    activateChannel: async (topicId: string) => {
      const { channels, activeChatChannel, connectToChannel } = get();

      console.debug(
        `[activateChannel] topic=${topicId.slice(0, 8)} current=${activeChatChannel?.slice(0, 8)} connected=${channels[topicId]?.connected} msgs=${channels[topicId]?.messages.length} responding=${channels[topicId]?.responding}`,
      );

      if (topicId === activeChatChannel && channels[topicId]?.connected) {
        console.debug(`[activateChannel] SKIP (already active & connected)`);
        return;
      }

      // Track active topic per agent (optimistic — channel may already be in state)
      const existingChannel = channels[topicId];
      if (existingChannel?.agentId) {
        set((state: ChatSlice) => {
          state.activeTopicByAgent[existingChannel.agentId!] = topicId;
        });
      }

      let channel = channels[topicId];

      if (!channel) {
        try {
          const sessions = await sessionService.getSessions();
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
              sessionAgentId = session.agent_id;
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
              agentId: sessionAgentId,
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
              return;
            }
          }
        } catch (error) {
          console.error("Failed to find session for topic:", error);
          return;
        }
      }

      if (channel) {
        // Channel is confirmed to exist — NOW set it as active.
        set({ activeChatChannel: topicId });

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

          console.debug(
            `[activateChannel] noLiveWs, msgs=${channel.messages.length} stale=${hasUnresolvedRuntimeState} → ${channel.messages.length === 0 || hasUnresolvedRuntimeState ? "RECONCILE" : "SKIP"}`,
          );

          // Reconcile with backend when no messages OR when runtime flags may be
          // stale (e.g. WS died during streaming and missed terminal events).
          if (channel.messages.length === 0 || hasUnresolvedRuntimeState) {
            await reconcileChannelFromBackend(topicId);
          }
        } else {
          console.debug(`[activateChannel] hasLiveWs, skipping reconcile`);
        }
        connectToChannel(channel.sessionId, channel.id);

        // Wait for connection to be established.
        await waitForChannelConnection(topicId, { logFailure: true });
      }
    },

    activateChannelForAgent: async (agentId: string) => {
      const guardKey = `activate:${agentId}`;
      if (pendingChannelOps.has(guardKey)) return;
      pendingChannelOps.add(guardKey);
      try {
        try {
          // Try to get existing session for this agent
          const session = await sessionService.getSessionByAgent(agentId);

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
            const newTopic = await topicService.createTopic({
              name: "新的聊天",
              session_id: session.id,
            });

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
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) {
            // No session exists, create one via createDefaultChannel
            await get().createDefaultChannel(agentId);
          } else {
            console.error("Failed to activate channel for agent:", error);
            // Fallback to createDefaultChannel
            await get().createDefaultChannel(agentId);
          }
        }
      } finally {
        pendingChannelOps.delete(guardKey);
      }
    },

    createDefaultChannel: async (agentId?: string) => {
      const guardKey = `create:${agentId || "default"}`;
      if (pendingChannelOps.has(guardKey)) return;
      pendingChannelOps.add(guardKey);
      try {
        const agentIdParam = agentId || "default";

        // First, try to find an existing session for this user-agent combination
        let existingSession;
        try {
          existingSession =
            await sessionService.getSessionByAgent(agentIdParam);
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) {
            // No session exists — will create below
            existingSession = null;
          } else {
            // Network errors, 500s — do NOT fall through to session creation
            throw error;
          }
        }

        if (existingSession) {
          // Found existing session, create a new topic for it

          // If existing session doesn't have provider/model, update it with defaults
          if (!existingSession.provider_id || !existingSession.model) {
            console.log(
              "  - Existing session missing provider/model, updating with defaults...",
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
                const providers = await llmProviderService.getMyProviders();
                const defaults =
                  await providerCore.getDefaultProviderAndModel(providers);
                providerId = providerId || defaults.providerId || undefined;
                model = model || defaults.model || undefined;
              }

              if (providerId && model) {
                await sessionService.updateSession(existingSession.id, {
                  provider_id: providerId,
                  model: model,
                });
                existingSession.provider_id = providerId;
                existingSession.model = model;
                console.log(
                  `  - Updated session with provider (${providerId}) and model (${model})`,
                );
              }
            } catch (error) {
              console.warn(
                "  - Failed to update session with defaults:",
                error,
              );
            }
          }

          const newTopic = await topicService.createTopic({
            name: "新的聊天",
            session_id: existingSession.id,
          });

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

        // No existing session found, create a new session
        const agent = get().resolveAgent(agentId ?? null);

        const sessionPayload: SessionCreate = {
          name: "New Session",
          agent_id: agentId,
        };

        // Include MCP server IDs if agent has them
        if (agent?.mcp_servers?.length) {
          sessionPayload.mcp_server_ids = agent.mcp_servers.map((s) => s.id);
        }

        // Fetch providers for default model resolution
        let currentProviders: Awaited<
          ReturnType<typeof llmProviderService.getMyProviders>
        > = [];
        try {
          currentProviders = await llmProviderService.getMyProviders();
        } catch (error) {
          console.error("Failed to fetch providers:", error);
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

        const newSession = await sessionService.createSession(sessionPayload);

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
          const newTopic = await topicService.createTopic({
            name: "新的聊天",
            session_id: newSession.id,
          });

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
      } finally {
        pendingChannelOps.delete(guardKey);
      }
    },

    updateTopicName: async (topicId: string, newName: string) => {
      try {
        await topicService.updateTopic(topicId, { name: newName });

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
        await topicService.deleteTopic(topicId);

        // Clean up WebSocket and timers before removing from state
        cleanupTopicResources(topicId);

        // Find the sessionId before mutating state
        const chatHistory = get().chatHistory;
        const deletedItem = chatHistory.find((item) => item.id === topicId);
        const deletedSessionId = deletedItem?.sessionId;
        const wasActive = get().activeChatChannel === topicId;

        // Find next topic in the same session (excluding the one being deleted)
        const nextTopicId = wasActive
          ? (chatHistory.find(
              (item) =>
                item.id !== topicId && item.sessionId === deletedSessionId,
            )?.id ?? null)
          : null;

        set((state: XyzenState) => {
          // Remove from channels
          delete state.channels[topicId];

          // Remove from chatHistory
          state.chatHistory = state.chatHistory.filter(
            (item) => item.id !== topicId,
          );

          // If the deleted topic was active, switch to sibling or clear
          if (wasActive) {
            state.activeChatChannel = nextTopicId;
          }
        });

        // Activate the new channel outside of Immer set()
        if (wasActive && nextTopicId) {
          get().activateChannel(nextTopicId);
        }

        console.log(`Topic ${topicId} deleted`);
      } catch (error) {
        console.error("Failed to delete topic:", error);
        throw error;
      }
    },

    clearSessionTopics: async (sessionId: string) => {
      try {
        // Clean up WebSocket connections and timers for all topics in this session
        // BEFORE the backend call, so we don't send/receive on stale channels.
        const channels = get().channels;
        for (const [topicId, ch] of Object.entries(channels)) {
          if (ch.sessionId === sessionId) {
            cleanupTopicResources(topicId);
          }
        }

        await sessionService.clearSessionTopics(sessionId);

        // Reset activeChatChannel if it pointed to a topic in the cleared session
        const activeCh = get().activeChatChannel;
        if (activeCh && channels[activeCh]?.sessionId === sessionId) {
          set({ activeChatChannel: null });
        }

        // Refresh chat history to get the new default topic
        await get().fetchChatHistory();

        console.log(`Session ${sessionId} topics cleared`);
      } catch (error) {
        console.error("Failed to clear session topics:", error);
      }
    },

    updateSessionConfig: async (
      sessionId: string,
      config: {
        provider_id?: string;
        model?: string;
        model_tier?: "ultra" | "pro" | "standard" | "lite";
        knowledge_set_id?: string | null;
      },
    ) => {
      try {
        const updatedSession = await sessionService.updateSession(
          sessionId,
          config,
        );

        set((state) => {
          // Update ALL channels that belong to this session, not just the active one
          for (const ch of Object.values(state.channels)) {
            if (ch.sessionId === sessionId) {
              ch.provider_id = updatedSession.provider_id;
              ch.model = updatedSession.model;
              ch.model_tier = updatedSession.model_tier;
              ch.knowledge_set_id = updatedSession.knowledge_set_id;
            }
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

    updateSessionProviderAndModel: async (
      sessionId: string,
      providerId: string,
      model: string,
    ) => {
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
  };
}
