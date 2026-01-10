import { authService } from "@/service/authService";
import xyzenService from "@/service/xyzenService";
import { sessionService } from "@/service/sessionService";
import { providerCore } from "@/core/provider";
import { generateClientId, groupToolMessagesWithAssistant } from "@/core/chat";
import type { StateCreator } from "zustand";
import type {
  ChatChannel,
  ChatHistoryItem,
  SessionResponse,
  TopicResponse,
  XyzenState,
} from "../types";
import type {
  AgentStartData,
  AgentEndData,
  AgentErrorData,
  PhaseStartData,
  PhaseEndData,
  NodeStartData,
  NodeEndData,
  SubagentStartData,
  SubagentEndData,
  ProgressUpdateData,
  IterationStartData,
  IterationEndData,
  AgentExecutionState,
  PhaseExecution,
} from "@/types/agentEvents";

// NOTE: groupToolMessagesWithAssistant and generateClientId have been moved to
// @/core/chat/messageProcessor.ts as part of the frontend refactor.

export interface ChatSlice {
  // Chat panel state
  activeChatChannel: string | null;
  chatHistory: ChatHistoryItem[];
  chatHistoryLoading: boolean;
  channels: Record<string, ChatChannel>;

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
      google_search_enabled?: boolean;
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

  // Knowledge Context
  setKnowledgeContext: (
    channelId: string,
    context: { folderId: string; folderName: string } | null,
  ) => void;

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

  // Helper function to get user-friendly display name for a node ID
  const getNodeDisplayName = (nodeId: string): string => {
    const names: Record<string, string> = {
      clarify_with_user: "Clarification",
      write_research_brief: "Research Brief",
      research_supervisor: "Research",
      final_report_generation: "Final Report",
    };
    return names[nodeId] || nodeId;
  };

  return {
    // Chat panel state
    activeChatChannel: null,
    chatHistory: [],
    chatHistoryLoading: true,
    channels: {},

    // Notification state
    notification: null,

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

        // 获取当前的 channels 状态，避免覆盖现有的连接和消息
        const currentChannels = get().channels;
        const newChannels: Record<string, ChatChannel> = { ...currentChannels };

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

        set({
          chatHistory,
          channels: newChannels,
          chatHistoryLoading: false,
          // 不要自动设置 activeChatChannel，保持当前选中的
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

      if (topicId === activeChatChannel && channels[topicId]?.connected) {
        return;
      }

      set({ activeChatChannel: topicId });
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
          let googleSearchEnabled = undefined;

          for (const session of sessions) {
            const topic = session.topics.find((t) => t.id === topicId);
            if (topic) {
              sessionId = session.id;
              topicName = topic.name;
              sessionAgentId = session.agent_id; // 获取 session 的 agent_id
              sessionProviderId = session.provider_id;
              sessionModel = session.model;
              googleSearchEnabled = session.google_search_enabled;
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
              google_search_enabled: googleSearchEnabled,
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
        if (channel.messages.length === 0) {
          const { setLoading } = get();
          const loadingKey = `topicMessages-${topicId}`;
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

              // Process messages to group tool events with assistant messages
              const processedMessages =
                groupToolMessagesWithAssistant(messages);

              set((state: ChatSlice) => {
                if (state.channels[topicId]) {
                  state.channels[topicId].messages = processedMessages;
                }
              });
            } else {
              const errorText = await response.text();
              console.error(
                `ChatSlice: Failed to load messages for topic ${topicId}: ${response.status} ${errorText}`,
              );
              // 如果是认证问题，可以考虑清除消息或显示错误状态
              if (response.status === 401 || response.status === 403) {
                console.error(
                  "ChatSlice: Authentication/authorization issue loading messages",
                );
              }
            }
          } catch (error) {
            console.error("Failed to load topic messages:", error);
          } finally {
            setLoading(loadingKey, false);
          }
        }
        connectToChannel(channel.sessionId, channel.id);

        // Wait for connection to be established
        await new Promise<void>((resolve) => {
          const checkConnection = () => {
            const currentChannel = get().channels[topicId];
            if (currentChannel?.connected) {
              resolve();
            } else if (currentChannel?.error) {
              // Resolve on error too to avoid hanging the UI
              console.warn(
                `Connection failed for topic ${topicId}: ${currentChannel.error}`,
              );
              resolve();
            } else {
              setTimeout(checkConnection, 100);
            }
          };
          // Timeout after 5 seconds to prevent infinite loading
          setTimeout(() => {
            console.warn(`Connection timeout for topic ${topicId}`);
            resolve();
          }, 5000);
          checkConnection();
        });
      }
    },

    connectToChannel: (sessionId: string, topicId: string) => {
      xyzenService.disconnect();
      xyzenService.connect(
        sessionId,
        topicId,
        (message) => {
          set((state: ChatSlice) => {
            const channel = state.channels[topicId];
            if (channel) {
              if (!channel.messages.some((m) => m.id === message.id)) {
                // Mark messages from WebSocket as new (should show typewriter effect)
                channel.messages.push({
                  ...message,
                  isNewMessage: true,
                });
              }
            }
          });
        },
        (status) => {
          set((state: ChatSlice) => {
            const channel = state.channels[topicId];
            if (channel) {
              channel.connected = status.connected;
              channel.error = status.error;
            }
          });
        },
        // Message event handler for loading and streaming
        (event) => {
          set((state: ChatSlice) => {
            const channel = state.channels[topicId];
            if (!channel) return;

            switch (event.type) {
              case "processing": {
                // Treat backend "processing" as our existing "loading" state
                channel.responding = true;
                const loadingMessageId = `loading-${Date.now()}`;
                const existingLoadingIndex = channel.messages.findIndex(
                  (m) => m.isLoading,
                );

                if (existingLoadingIndex === -1) {
                  channel.messages.push({
                    id: loadingMessageId,
                    clientId: generateClientId(),
                    role: "assistant" as const,
                    content: "",
                    created_at: new Date().toISOString(),
                    isLoading: true,
                    isStreaming: false,
                    isNewMessage: true,
                  });
                }
                break;
              }
              case "loading": {
                // Add or update loading message
                channel.responding = true;
                const loadingMessageId = `loading-${Date.now()}`;
                const existingLoadingIndex = channel.messages.findIndex(
                  (m) => m.isLoading,
                );

                if (existingLoadingIndex === -1) {
                  // Add new loading message
                  channel.messages.push({
                    id: loadingMessageId,
                    clientId: generateClientId(),
                    role: "assistant" as const,
                    content: "",
                    created_at: new Date().toISOString(),
                    isLoading: true,
                    isStreaming: false,
                    isNewMessage: true,
                  });
                }
                break;
              }

              case "streaming_start": {
                // Convert loading or thinking message to streaming message
                channel.responding = true;
                const eventData = event.data as { id: string };

                // First check for loading message
                const loadingIndex = channel.messages.findIndex(
                  (m) => m.isLoading,
                );
                if (loadingIndex !== -1) {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { isLoading: _, ...messageWithoutLoading } =
                    channel.messages[loadingIndex];
                  channel.messages[loadingIndex] = {
                    ...messageWithoutLoading,
                    id: eventData.id,
                    isStreaming: true,
                    content: "",
                  };
                  break;
                }

                // Check for existing message with same ID (e.g., after thinking_end set isThinking=false)
                const existingIndex = channel.messages.findIndex(
                  (m) => m.id === eventData.id,
                );
                if (existingIndex !== -1) {
                  // Convert existing message to streaming - keep thinking content if present
                  channel.messages[existingIndex] = {
                    ...channel.messages[existingIndex],
                    isThinking: false,
                    isStreaming: true,
                  };
                  break;
                }

                // Check for agent execution message (streaming goes into phases, not a new message)
                // Use findLastIndex to get the MOST RECENT running agent execution
                // to avoid routing to old completed messages from previous conversations
                const agentMsgIndex = channel.messages.findLastIndex(
                  (m) => m.agentExecution?.status === "running",
                );
                if (agentMsgIndex !== -1) {
                  // Agent execution exists, mark it as streaming but don't create a new message
                  // Content will be routed to phase.streamedContent in streaming_chunk
                  channel.messages[agentMsgIndex] = {
                    ...channel.messages[agentMsgIndex],
                    isStreaming: true,
                  };
                  break;
                }

                // No loading, existing, or agent message found, create a streaming message now
                channel.messages.push({
                  id: eventData.id,
                  clientId: generateClientId(),
                  role: "assistant" as const,
                  content: "",
                  isNewMessage: true,
                  created_at: new Date().toISOString(),
                  isStreaming: true,
                });
                break;
              }

              case "streaming_chunk": {
                // Update streaming message content
                const eventData = event.data as { id: string; content: string };

                // Check for RUNNING agent execution message (most recent)
                // Use findLastIndex to avoid routing to old completed messages
                const agentMsgIndex = channel.messages.findLastIndex(
                  (m) => m.agentExecution?.status === "running",
                );

                if (agentMsgIndex !== -1) {
                  const execution =
                    channel.messages[agentMsgIndex].agentExecution;
                  if (execution && execution.phases.length > 0) {
                    // Use currentNode to find the correct phase (more reliable than status)
                    let targetPhase = execution.currentNode
                      ? execution.phases.find(
                          (p) => p.id === execution.currentNode,
                        )
                      : null;

                    // Fallback to running phase if currentNode doesn't match
                    if (!targetPhase) {
                      targetPhase = execution.phases.find(
                        (p) => p.status === "running",
                      );
                    }

                    // Final fallback: last phase (for late chunks after agent_end)
                    if (!targetPhase) {
                      targetPhase =
                        execution.phases[execution.phases.length - 1];
                    }

                    // Fix: Detect and handle duplicate full-content chunks
                    // The backend sometimes sends the complete content as a final chunk
                    // after already streaming it incrementally. Detect this by checking
                    // if the chunk starts with the same content as existing streamedContent.
                    const existingContent = targetPhase.streamedContent || "";
                    if (
                      existingContent.length > 0 &&
                      eventData.content.length > 100 && // Only check substantial chunks
                      existingContent.startsWith(
                        eventData.content.slice(0, 100),
                      )
                    ) {
                      // This chunk contains content from the beginning - it's a full-content chunk
                      // Replace instead of append to avoid duplication
                      targetPhase.streamedContent = eventData.content;
                    } else {
                      targetPhase.streamedContent =
                        existingContent + eventData.content;
                    }
                    break; // Don't fall through to other handling
                  }
                }

                // Fallback: try to find message by ID (for non-agent messages only)
                const streamingIndex = channel.messages.findIndex(
                  (m) => m.id === eventData.id,
                );

                if (streamingIndex === -1) {
                  // If we somehow missed streaming_start, create the message on first chunk
                  channel.messages.push({
                    id: eventData.id,
                    clientId: generateClientId(),
                    role: "assistant" as const,
                    content: eventData.content,
                    created_at: new Date().toISOString(),
                    isStreaming: true,
                  });
                } else {
                  const msg = channel.messages[streamingIndex];

                  // Skip agent messages here - they're handled above
                  if (msg.agentExecution) {
                    break;
                  }

                  // Append to message.content (for non-agent messages only)
                  const currentContent = msg.content;
                  channel.messages[streamingIndex].content =
                    currentContent + eventData.content;
                }
                break;
              }

              case "streaming_end": {
                // Finalize streaming message
                channel.responding = false;
                const eventData = event.data as {
                  id: string;
                  created_at?: string;
                };

                // First try to find by ID
                let endingIndex = channel.messages.findIndex(
                  (m) => m.id === eventData.id,
                );

                // If not found, check for agent execution message that's streaming
                if (endingIndex === -1) {
                  endingIndex = channel.messages.findIndex(
                    (m) => m.agentExecution && m.isStreaming,
                  );
                }

                if (endingIndex !== -1) {
                  const messageFinal = {
                    ...channel.messages[endingIndex],
                  } as Omit<import("../types").Message, never> & {
                    isLoading?: boolean;
                    isStreaming?: boolean;
                  };
                  // Remove transient flags
                  delete messageFinal.isLoading;
                  delete messageFinal.isStreaming;
                  channel.messages[endingIndex] = {
                    ...messageFinal,
                    created_at:
                      eventData.created_at || new Date().toISOString(),
                  } as import("../types").Message;
                }
                break;
              }

              case "message": {
                // Handle regular message (fallback)
                const regularMessage = event.data as import("../types").Message;
                if (!channel.messages.some((m) => m.id === regularMessage.id)) {
                  channel.messages.push({
                    ...regularMessage,
                    isNewMessage: true,
                  });
                }
                break;
              }

              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore - search_citations is a valid event type from backend
              case "search_citations": {
                // Attach search citations to the most recent assistant message
                const eventData = event.data as {
                  citations: Array<{
                    url?: string;
                    title?: string;
                    cited_text?: string;
                    start_index?: number;
                    end_index?: number;
                    search_queries?: string[];
                  }>;
                };

                // Find the most recent assistant message that's streaming or just finished
                const lastAssistantIndex = channel.messages
                  .slice()
                  .reverse()
                  .findIndex(
                    (m) =>
                      m.role === "assistant" && (m.isStreaming || !m.citations),
                  );

                if (lastAssistantIndex !== -1) {
                  const actualIndex =
                    channel.messages.length - 1 - lastAssistantIndex;
                  const targetMessage = channel.messages[actualIndex];
                  console.log(
                    `[Citation Debug] Attaching ${eventData.citations.length} citations to message ${targetMessage.id}`,
                  );
                  console.log(
                    "[Citation Debug] Citations data:",
                    eventData.citations,
                  );
                  console.log("[Citation Debug] Message before:", {
                    id: targetMessage.id,
                    role: targetMessage.role,
                    hasCitations: !!targetMessage.citations,
                    citationsLength: targetMessage.citations?.length || 0,
                  });

                  channel.messages[actualIndex].citations = eventData.citations;

                  console.log("[Citation Debug] Message after:", {
                    id: channel.messages[actualIndex].id,
                    role: channel.messages[actualIndex].role,
                    hasCitations: !!channel.messages[actualIndex].citations,
                    citationsLength:
                      channel.messages[actualIndex].citations?.length || 0,
                  });
                  console.log(
                    `Attached ${eventData.citations.length} citations to message ${targetMessage.id}`,
                  );
                } else {
                  console.warn(
                    "[Citation Debug] Could not find assistant message to attach citations",
                  );
                }
                break;
              }

              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore - generated_files is a valid event type from backend
              case "generated_files": {
                const eventData = event.data as unknown as {
                  files: Array<{
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    category: "images" | "documents" | "audio" | "others";
                    download_url?: string;
                    thumbnail_url?: string;
                  }>;
                };

                // Find the most recent assistant message that's streaming or just finished
                const lastAssistantIndex = channel.messages
                  .slice()
                  .reverse()
                  .findIndex(
                    (m) =>
                      m.role === "assistant" &&
                      (m.isStreaming || !m.attachments),
                  );

                if (lastAssistantIndex !== -1) {
                  const actualIndex =
                    channel.messages.length - 1 - lastAssistantIndex;
                  const targetMessage = channel.messages[actualIndex];

                  // Initialize attachments if null
                  if (!targetMessage.attachments) {
                    channel.messages[actualIndex].attachments = [];
                  }

                  // Append new files
                  const currentAttachments =
                    channel.messages[actualIndex].attachments || [];
                  const newAttachments = eventData.files.filter(
                    (newFile) =>
                      !currentAttachments.some(
                        (curr) => curr.id === newFile.id,
                      ),
                  );

                  channel.messages[actualIndex].attachments = [
                    ...currentAttachments,
                    ...newAttachments,
                  ];
                }
                break;
              }

              case "message_saved": {
                // Update the streaming message with the real database ID
                const eventData = event.data as {
                  stream_id: string;
                  db_id: string;
                  created_at: string;
                };
                const messageIndex = channel.messages.findIndex(
                  (m) => m.id === eventData.stream_id,
                );
                if (messageIndex !== -1) {
                  channel.messages[messageIndex] = {
                    ...channel.messages[messageIndex],
                    id: eventData.db_id,
                    created_at: eventData.created_at,
                  };
                }
                break;
              }

              case "tool_call_request": {
                channel.responding = true;
                const toolCallData = event.data as {
                  id: string;
                  name: string;
                  description?: string;
                  arguments: Record<string, unknown>;
                  status: string;
                  timestamp: number;
                };

                // Clear any existing loading messages
                const loadingIndex = channel.messages.findIndex(
                  (m) => m.isLoading,
                );
                if (loadingIndex !== -1) {
                  channel.messages.splice(loadingIndex, 1);
                }

                // Create a new assistant message with the tool call
                const toolCallMessageId = `tool-call-${toolCallData.id}`;
                const newMessage = {
                  id: toolCallMessageId,
                  clientId: generateClientId(),
                  role: "assistant" as const,
                  content: "",
                  created_at: new Date().toISOString(),
                  isLoading: false,
                  isStreaming: false,
                  isNewMessage: true,
                  toolCalls: [
                    {
                      id: toolCallData.id,
                      name: toolCallData.name,
                      description: toolCallData.description,
                      arguments: toolCallData.arguments,
                      status: toolCallData.status as
                        | "waiting_confirmation"
                        | "executing"
                        | "completed"
                        | "failed",
                      timestamp: new Date(toolCallData.timestamp).toISOString(),
                    },
                  ],
                };

                channel.messages.push(newMessage);
                console.log(
                  `ChatSlice: Created new tool call message with tool ${toolCallData.name}`,
                );
                break;
              }

              case "tool_call_response": {
                const responseData = event.data as {
                  toolCallId: string;
                  status: string;
                  result?: unknown;
                  error?: string;
                };

                // Find and update the tool call
                channel.messages.forEach((message) => {
                  if (message.toolCalls) {
                    message.toolCalls.forEach((toolCall) => {
                      if (toolCall.id === responseData.toolCallId) {
                        toolCall.status = responseData.status as
                          | "waiting_confirmation"
                          | "executing"
                          | "completed"
                          | "failed";
                        if (responseData.result) {
                          toolCall.result = JSON.stringify(responseData.result);
                        }
                        if (responseData.error) {
                          toolCall.error = responseData.error;
                        }
                      }
                    });
                  }
                });

                // Note: Backend will send a 'loading' event before streaming the final response
                // We don't need to create loading message here anymore
                break;
              }

              case "error": {
                // Handle error - remove loading messages and show error
                channel.responding = false;
                const errorData = event.data as { error: string };
                const errorLoadingIndex = channel.messages.findIndex(
                  (m) => m.isLoading,
                );

                if (errorLoadingIndex !== -1) {
                  channel.messages[errorLoadingIndex] = {
                    ...channel.messages[errorLoadingIndex],
                    content: `Error: ${errorData.error}`,
                    isLoading: false,
                    isStreaming: false,
                  };
                } else {
                  // Fallback: If no loading message found, create a new error message
                  // This ensures the error is visible in the chat usage context without duplicate notifications
                  const errorMessageId = `error-${Date.now()}`;
                  channel.messages.push({
                    id: errorMessageId,
                    clientId: generateClientId(),
                    role: "assistant", // Use assistant role to show on left side
                    content: `⚠️ Error: ${errorData.error || "An error occurred"}`,
                    created_at: new Date().toISOString(),
                    isNewMessage: true,
                  });
                }

                console.error("Chat error:", errorData.error);
                break;
              }

              case "insufficient_balance": {
                // Handle insufficient balance error
                const balanceData = event.data as {
                  error_code?: string;
                  message?: string;
                  message_cn?: string;
                  details?: Record<string, unknown>;
                  action_required?: string;
                };

                console.warn("Insufficient balance:", balanceData);

                // Reset responding state to unblock input
                channel.responding = false;

                // Update loading message to show error
                const balanceLoadingIndex = channel.messages.findIndex(
                  (m) => m.isLoading,
                );
                if (balanceLoadingIndex !== -1) {
                  channel.messages[balanceLoadingIndex] = {
                    ...channel.messages[balanceLoadingIndex],
                    content: `⚠️ ${balanceData.message_cn || "光子余额不足，请充值后继续使用"}`,
                    isLoading: false,
                    isStreaming: false,
                  };
                }

                // Show notification to user
                state.notification = {
                  isOpen: true,
                  title: "余额不足",
                  message:
                    balanceData.message_cn ||
                    balanceData.message ||
                    "Your photon balance is insufficient. Please recharge to continue.",
                  type: "warning",
                  actionLabel: "去充值",
                  onAction: () => {
                    window.open(
                      "https://bohrium.dp.tech/personal/center/recharge",
                      "_blank",
                    );
                  },
                };
                break;
              }

              case "thinking_start": {
                // Start thinking mode - find or create the assistant message
                channel.responding = true;
                const eventData = event.data as { id: string };
                const loadingIndex = channel.messages.findIndex(
                  (m) => m.isLoading,
                );
                if (loadingIndex !== -1) {
                  // Convert loading message to thinking message
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { isLoading: _, ...messageWithoutLoading } =
                    channel.messages[loadingIndex];
                  channel.messages[loadingIndex] = {
                    ...messageWithoutLoading,
                    id: eventData.id,
                    isThinking: true,
                    thinkingContent: "",
                    content: "",
                  };
                } else {
                  // No loading present, create a thinking message
                  channel.messages.push({
                    id: eventData.id,
                    clientId: `thinking-${Date.now()}`,
                    role: "assistant" as const,
                    content: "",
                    isNewMessage: true,
                    created_at: new Date().toISOString(),
                    isThinking: true,
                    thinkingContent: "",
                  });
                }
                break;
              }

              case "thinking_chunk": {
                // Append to thinking content
                const eventData = event.data as { id: string; content: string };
                const thinkingIndex = channel.messages.findIndex(
                  (m) => m.id === eventData.id,
                );
                if (thinkingIndex !== -1) {
                  const currentThinking =
                    channel.messages[thinkingIndex].thinkingContent ?? "";
                  channel.messages[thinkingIndex].thinkingContent =
                    currentThinking + eventData.content;
                }
                break;
              }

              case "thinking_end": {
                // End thinking mode
                const eventData = event.data as { id: string };
                const endThinkingIndex = channel.messages.findIndex(
                  (m) => m.id === eventData.id,
                );
                if (endThinkingIndex !== -1) {
                  channel.messages[endThinkingIndex].isThinking = false;
                }
                break;
              }

              case "topic_updated": {
                const eventData = event.data as {
                  id: string;
                  name: string;
                  updated_at: string;
                };
                channel.title = eventData.name;
                const historyItem = state.chatHistory.find(
                  (h) => h.id === eventData.id,
                );
                if (historyItem) {
                  historyItem.title = eventData.name;
                  historyItem.updatedAt = eventData.updated_at;
                }
                break;
              }

              // === Agent Execution Events ===

              case "agent_start": {
                channel.responding = true;
                const data = event.data as AgentStartData;
                const { context } = data;

                // Find or create a message for this agent execution
                // First check for existing loading message
                const loadingIndex = channel.messages.findIndex(
                  (m) => m.isLoading,
                );

                const executionState: AgentExecutionState = {
                  agentId: context.agent_id,
                  agentName: context.agent_name,
                  agentType: context.agent_type,
                  executionId: context.execution_id,
                  status: "running",
                  startedAt: context.started_at,
                  phases: [],
                  subagents: [],
                };

                if (loadingIndex !== -1) {
                  // Convert loading message to agent execution message
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { isLoading: _, ...messageWithoutLoading } =
                    channel.messages[loadingIndex];
                  channel.messages[loadingIndex] = {
                    ...messageWithoutLoading,
                    id: `agent-${context.execution_id}`,
                    agentExecution: executionState,
                  };
                } else {
                  // Create a new message with agent execution
                  channel.messages.push({
                    id: `agent-${context.execution_id}`,
                    clientId: generateClientId(),
                    role: "assistant" as const,
                    content: "",
                    created_at: new Date().toISOString(),
                    isNewMessage: true,
                    agentExecution: executionState,
                  });
                }
                break;
              }

              case "agent_end": {
                channel.responding = false;
                const data = event.data as AgentEndData;
                const { context } = data;

                // Find the message with this agent execution
                const msgIndex = channel.messages.findIndex(
                  (m) => m.agentExecution?.executionId === context.execution_id,
                );

                if (msgIndex !== -1) {
                  const execution = channel.messages[msgIndex].agentExecution;
                  if (execution) {
                    execution.status =
                      data.status === "completed"
                        ? "completed"
                        : data.status === "cancelled"
                          ? "cancelled"
                          : "failed";
                    execution.endedAt = Date.now();
                    execution.durationMs = data.duration_ms;
                  }
                }
                break;
              }

              case "agent_error": {
                channel.responding = false;
                const data = event.data as AgentErrorData;
                const { context } = data;

                // Find the message with this agent execution
                const msgIndex = channel.messages.findIndex(
                  (m) => m.agentExecution?.executionId === context.execution_id,
                );

                if (msgIndex !== -1) {
                  const execution = channel.messages[msgIndex].agentExecution;
                  if (execution) {
                    execution.status = "failed";
                    execution.endedAt = Date.now();
                    execution.error = {
                      type: data.error_type,
                      message: data.error_message,
                      recoverable: data.recoverable,
                      nodeId: data.node_id,
                    };
                  }
                }
                break;
              }

              case "phase_start": {
                const data = event.data as PhaseStartData;
                const { context } = data;

                // Find the message with this agent execution
                const msgIndex = channel.messages.findIndex(
                  (m) => m.agentExecution?.executionId === context.execution_id,
                );

                if (msgIndex !== -1) {
                  const execution = channel.messages[msgIndex].agentExecution;
                  if (execution) {
                    execution.currentPhase = data.phase_name;

                    // Add phase to phases array
                    const newPhase: PhaseExecution = {
                      id: data.phase_id,
                      name: data.phase_name,
                      description: data.description,
                      status: "running",
                      startedAt: Date.now(),
                      nodes: [],
                    };
                    execution.phases.push(newPhase);
                  }
                }
                break;
              }

              case "phase_end": {
                const data = event.data as PhaseEndData;
                const { context } = data;

                // Find the message with this agent execution
                const msgIndex = channel.messages.findIndex(
                  (m) => m.agentExecution?.executionId === context.execution_id,
                );

                if (msgIndex !== -1) {
                  const execution = channel.messages[msgIndex].agentExecution;
                  if (execution) {
                    // Find and update the phase
                    const phase = execution.phases.find(
                      (p) => p.id === data.phase_id,
                    );
                    if (phase) {
                      phase.status =
                        data.status === "completed"
                          ? "completed"
                          : data.status === "skipped"
                            ? "skipped"
                            : "failed";
                      phase.endedAt = Date.now();
                      phase.durationMs = data.duration_ms;
                      phase.outputSummary = data.output_summary;
                    }
                  }
                }
                break;
              }

              case "node_start": {
                const data = event.data as NodeStartData;
                const { context } = data;

                // Find the main agent execution message
                const agentMsgIndex = channel.messages.findIndex(
                  (m) => m.agentExecution?.executionId === context.execution_id,
                );

                if (agentMsgIndex !== -1) {
                  const execution =
                    channel.messages[agentMsgIndex].agentExecution;
                  if (execution) {
                    // Mark any currently running phase as completed
                    const runningPhase = execution.phases.find(
                      (p) => p.status === "running",
                    );
                    if (runningPhase) {
                      runningPhase.status = "completed";
                      runningPhase.endedAt = Date.now();
                      if (runningPhase.startedAt) {
                        runningPhase.durationMs =
                          Date.now() - runningPhase.startedAt;
                      }
                    }

                    // Get display name for this node
                    const displayName = getNodeDisplayName(data.node_id);

                    // Check if phase already exists (from phase_start event)
                    const existingPhase = execution.phases.find(
                      (p) => p.id === data.node_id,
                    );
                    if (existingPhase) {
                      existingPhase.status = "running";
                      existingPhase.name = displayName; // Update name in case it was set differently
                      existingPhase.startedAt = Date.now();
                      existingPhase.streamedContent = "";
                    } else {
                      // Add new phase for this node
                      execution.phases.push({
                        id: data.node_id,
                        name: displayName,
                        status: "running",
                        startedAt: Date.now(),
                        nodes: [],
                        streamedContent: "",
                      });
                    }

                    execution.currentPhase = displayName;
                    execution.currentNode = data.node_id;
                  }
                }
                break;
              }

              case "node_end": {
                const data = event.data as NodeEndData;
                const { context } = data;

                // Find the main agent execution message
                const agentMsgIndex = channel.messages.findIndex(
                  (m) => m.agentExecution?.executionId === context.execution_id,
                );

                if (agentMsgIndex !== -1) {
                  const execution =
                    channel.messages[agentMsgIndex].agentExecution;
                  if (execution) {
                    // Find and update the phase
                    const phase = execution.phases.find(
                      (p) => p.id === data.node_id,
                    );
                    if (phase) {
                      phase.status =
                        data.status === "completed"
                          ? "completed"
                          : data.status === "skipped"
                            ? "skipped"
                            : "failed";
                      phase.endedAt = Date.now();
                      phase.durationMs = data.duration_ms;
                      phase.outputSummary = data.output_summary;
                    }
                  }
                }
                break;
              }

              case "subagent_start": {
                const data = event.data as SubagentStartData;
                const { context } = data;

                // Find the root agent execution (parent)
                const msgIndex = channel.messages.findIndex(
                  (m) =>
                    m.agentExecution &&
                    (m.agentExecution.executionId ===
                      context.parent_execution_id ||
                      m.agentExecution.executionId === context.execution_id),
                );

                if (msgIndex !== -1) {
                  const execution = channel.messages[msgIndex].agentExecution;
                  if (execution) {
                    execution.subagents.push({
                      id: data.subagent_id,
                      name: data.subagent_name,
                      type: data.subagent_type,
                      status: "running",
                      depth: context.depth,
                      executionPath: context.execution_path,
                      startedAt: context.started_at,
                    });
                  }
                }
                break;
              }

              case "subagent_end": {
                const data = event.data as SubagentEndData;

                // Find the message containing this subagent
                const msgIndex = channel.messages.findIndex((m) =>
                  m.agentExecution?.subagents?.some(
                    (s) => s.id === data.subagent_id,
                  ),
                );

                if (msgIndex !== -1) {
                  const execution = channel.messages[msgIndex].agentExecution;
                  if (execution) {
                    const subagent = execution.subagents.find(
                      (s) => s.id === data.subagent_id,
                    );
                    if (subagent) {
                      subagent.status =
                        data.status === "completed" ? "completed" : "failed";
                      subagent.endedAt = Date.now();
                      subagent.durationMs = data.duration_ms;
                      subagent.outputSummary = data.output_summary;
                    }
                  }
                }
                break;
              }

              case "progress_update": {
                const data = event.data as ProgressUpdateData;
                const { context } = data;

                // Find the message with this agent execution
                const msgIndex = channel.messages.findIndex(
                  (m) => m.agentExecution?.executionId === context.execution_id,
                );

                if (msgIndex !== -1) {
                  const execution = channel.messages[msgIndex].agentExecution;
                  if (execution) {
                    execution.progressPercent = data.progress_percent;
                    execution.progressMessage = data.message;
                  }
                }
                break;
              }

              case "iteration_start": {
                const data = event.data as IterationStartData;
                const { context } = data;

                // Find the message with this agent execution
                const msgIndex = channel.messages.findIndex(
                  (m) => m.agentExecution?.executionId === context.execution_id,
                );

                if (msgIndex !== -1) {
                  const execution = channel.messages[msgIndex].agentExecution;
                  if (execution) {
                    execution.iteration = {
                      current: data.iteration_number,
                      max: data.max_iterations,
                      reason: data.reason,
                    };
                  }
                }
                break;
              }

              case "iteration_end": {
                const data = event.data as IterationEndData;
                const { context } = data;

                // Find the message with this agent execution
                const msgIndex = channel.messages.findIndex(
                  (m) => m.agentExecution?.executionId === context.execution_id,
                );

                if (msgIndex !== -1) {
                  const execution = channel.messages[msgIndex].agentExecution;
                  if (execution && execution.iteration) {
                    execution.iteration.current = data.iteration_number;
                    if (!data.will_continue) {
                      // Iteration complete, clear the reason
                      execution.iteration.reason = data.reason;
                    }
                  }
                }
                break;
              }

              case "state_update": {
                // State updates are informational, we don't need to store them
                // but we could add them to a debug log if needed
                break;
              }
            }
          });
        },
      );
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
      } = get();

      if (!activeChatChannel) return;

      // Don't allow sending while files are uploading
      if (isUploading) {
        console.warn("Cannot send message while files are uploading");
        return;
      }

      // Mark the channel as responding immediately for snappier UX
      set((state: ChatSlice) => {
        const channel = state.channels[activeChatChannel];
        if (channel) channel.responding = true;
      });

      // Collect completed file IDs
      const completedFiles = uploadedFiles.filter(
        (f) => f.status === "completed" && f.uploadedId,
      );

      const payload: Record<string, unknown> = { message };
      if (completedFiles.length > 0) {
        payload.file_ids = completedFiles.map((f) => f.uploadedId!);
      }

      const channel = channels[activeChatChannel];
      if (channel?.knowledgeContext) {
        payload.context = channel.knowledgeContext;
      }

      xyzenService.sendStructuredMessage(payload);

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
              google_search_enabled: existingSession.google_search_enabled,
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
            google_search_enabled: newSession.google_search_enabled,
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
            state.channels[activeChannelId].google_search_enabled =
              updatedSession.google_search_enabled;
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

    setKnowledgeContext: (channelId, context) => {
      set((state: ChatSlice) => {
        if (state.channels[channelId]) {
          state.channels[channelId].knowledgeContext = context || undefined;
        }
      });
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
