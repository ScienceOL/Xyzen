import { authService } from "@/service/authService";
import xyzenService from "@/service/xyzenService";
import { sessionService } from "@/service/sessionService";
import { parseToolMessage } from "@/utils/toolMessageParser";
import { providerCore } from "@/core/provider";
import type { StateCreator } from "zustand";
import type {
  ChatChannel,
  ChatHistoryItem,
  Message,
  SessionResponse,
  ToolCall,
  TopicResponse,
  XyzenState,
} from "../types";

/**
 * Group consecutive tool messages with their preceding assistant message
 * This makes history look identical to live chat experience
 * Tool messages that can't be grouped are kept as standalone
 */
const generateClientId = () =>
  `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function groupToolMessagesWithAssistant(messages: Message[]): Message[] {
  const result: Message[] = [];

  const toolCallLookup = new Map<
    string,
    { toolCall: ToolCall; message: Message }
  >();

  const cloneToolCall = (toolCall: ToolCall): ToolCall => ({
    ...toolCall,
    arguments: { ...(toolCall.arguments || {}) },
  });

  const cloneMessage = (message: Message): Message => ({
    ...message,
    toolCalls: message.toolCalls
      ? message.toolCalls.map((toolCall) => cloneToolCall(toolCall))
      : undefined,
  });

  for (const msg of messages) {
    if (msg.role !== "tool") {
      const cloned = cloneMessage(msg);
      result.push(cloned);

      if (cloned.toolCalls) {
        cloned.toolCalls.forEach((toolCall) => {
          toolCallLookup.set(toolCall.id, { toolCall, message: cloned });
        });
      }
      continue;
    }

    const parsed = parseToolMessage(msg.content);
    if (!parsed) {
      result.push(cloneMessage(msg));
      continue;
    }

    if (parsed.event === "tool_call_request") {
      const toolCallId =
        parsed.id || parsed.toolCallId || msg.id || crypto.randomUUID();
      const toolCall: ToolCall = {
        id: toolCallId,
        name: parsed.name || "Unknown Tool",
        description: parsed.description,
        arguments: { ...(parsed.arguments || {}) },
        status: (parsed.status as ToolCall["status"]) || "waiting_confirmation",
        timestamp: parsed.timestamp
          ? new Date(parsed.timestamp).toISOString()
          : msg.created_at,
      };

      const toolMessage: Message = {
        id: msg.id || `tool-call-${toolCallId}`,
        clientId: msg.clientId,
        role: "assistant",
        content: "",
        created_at: msg.created_at,
        toolCalls: [toolCall],
      };

      result.push(toolMessage);
      toolCallLookup.set(toolCallId, { toolCall, message: toolMessage });
      continue;
    }

    const toolCallId = parsed.toolCallId || parsed.id || msg.id || "";
    if (!toolCallId) {
      continue;
    }

    let existingEntry = toolCallLookup.get(toolCallId);
    if (!existingEntry) {
      const toolCall: ToolCall = {
        id: toolCallId,
        name: "工具调用",
        arguments: {},
        status: (parsed.status as ToolCall["status"]) || "completed",
        timestamp: msg.created_at,
      };

      const toolMessage: Message = {
        id: msg.id || `tool-response-${toolCallId}`,
        clientId: msg.clientId,
        role: "assistant",
        content: "工具调用更新",
        created_at: msg.created_at,
        toolCalls: [toolCall],
      };

      result.push(toolMessage);
      existingEntry = { toolCall, message: toolMessage };
      toolCallLookup.set(toolCallId, existingEntry);
    }

    const { toolCall } = existingEntry;

    if (parsed.status) {
      toolCall.status = parsed.status as ToolCall["status"];
    }

    if (parsed.result !== undefined) {
      toolCall.result =
        typeof parsed.result === "string"
          ? parsed.result
          : JSON.stringify(parsed.result);
    }

    if (parsed.error) {
      toolCall.error = parsed.error;
      toolCall.status = "failed";
    }
  }

  return result;
}

export interface ChatSlice {
  // Chat panel state
  activeChatChannel: string | null;
  chatHistory: ChatHistoryItem[];
  chatHistoryLoading: boolean;
  channels: Record<string, ChatChannel>;

  // Workshop panel state
  activeWorkshopChannel: string | null;
  workshopHistory: ChatHistoryItem[];
  workshopHistoryLoading: boolean;
  workshopChannels: Record<string, ChatChannel>;

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
    config: { provider_id?: string; model?: string },
  ) => Promise<void>;
  updateSessionProviderAndModel: (
    sessionId: string,
    providerId: string,
    model: string,
  ) => Promise<void>;

  // Workshop panel methods
  setActiveWorkshopChannel: (channelUUID: string | null) => void;
  fetchWorkshopHistory: () => Promise<void>;
  togglePinWorkshopChat: (chatId: string) => void;
  activateWorkshopChannel: (topicId: string) => Promise<void>;
  connectToWorkshopChannel: (sessionId: string, topicId: string) => void;
  disconnectFromWorkshopChannel: () => void;
  sendWorkshopMessage: (message: string) => void;
  createDefaultWorkshopChannel: (agentId?: string) => Promise<void>;
  updateWorkshopTopicName: (topicId: string, newName: string) => Promise<void>;
  deleteWorkshopTopic: (topicId: string) => Promise<void>;
  clearWorkshopSessionTopics: (sessionId: string) => Promise<void>;

  // Tool call confirmation methods
  confirmToolCall: (channelId: string, toolCallId: string) => void;
  cancelToolCall: (channelId: string, toolCallId: string) => void;

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
> = (set, get) => ({
  // Chat panel state
  activeChatChannel: null,
  chatHistory: [],
  chatHistoryLoading: true,
  channels: {},

  // Workshop panel state
  activeWorkshopChannel: null,
  workshopHistory: [],
  workshopHistoryLoading: true,
  workshopChannels: {},

  notification: null,

  setActiveChatChannel: (channelId) => set({ activeChatChannel: channelId }),

  fetchChatHistory: async () => {
    const { setLoading } = get();
    setLoading("chatHistory", true);

    try {
      const token = authService.getToken();
      if (!token) {
        console.error("ChatSlice: No authentication token available");
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
                assistantTitle: "通用助理",
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
    const { channels, activeChatChannel, connectToChannel, backendUrl } = get();

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

        for (const session of sessions) {
          const topic = session.topics.find((t) => t.id === topicId);
          if (topic) {
            sessionId = session.id;
            topicName = topic.name;
            sessionAgentId = session.agent_id; // 获取 session 的 agent_id
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
            const processedMessages = groupToolMessagesWithAssistant(messages);

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
              channel.messages.push(message);
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
                });
              }
              break;
            }

            case "streaming_start": {
              // Convert loading message to streaming message
              channel.responding = true;
              const loadingIndex = channel.messages.findIndex(
                (m) => m.isLoading,
              );
              const eventData = event.data as { id: string };
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
              } else {
                // No loading present (backend may skip sending "loading"). Create a streaming message now.
                channel.messages.push({
                  id: eventData.id,
                  clientId: generateClientId(),
                  role: "assistant" as const,
                  content: "",
                  created_at: new Date().toISOString(),
                  isStreaming: true,
                });
              }
              break;
            }

            case "streaming_chunk": {
              // Update streaming message content
              const eventData = event.data as { id: string; content: string };
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
                const currentContent = channel.messages[streamingIndex].content;
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
              const endingIndex = channel.messages.findIndex(
                (m) => m.id === eventData.id,
              );
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
                  created_at: eventData.created_at || new Date().toISOString(),
                } as import("../types").Message;
              }
              break;
            }

            case "message": {
              // Handle regular message (fallback)
              const regularMessage = event.data as import("../types").Message;
              if (!channel.messages.some((m) => m.id === regularMessage.id)) {
                channel.messages.push(regularMessage);
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
              get().showNotification(
                "余额不足",
                balanceData.message_cn ||
                  balanceData.message ||
                  "Your photon balance is insufficient. Please recharge to continue.",
                "warning",
                "去充值",
                () => {
                  window.open(
                    "https://bohrium.dp.tech/personal/center/recharge",
                    "_blank",
                  );
                },
              );
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
          }
        });
      },
    );
  },

  disconnectFromChannel: () => {
    xyzenService.disconnect();
  },

  sendMessage: async (message: string) => {
    const { activeChatChannel, uploadedFiles, clearFiles, isUploading } = get();

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

    // Send message with file IDs if files exist
    if (completedFiles.length > 0) {
      const fileIds = completedFiles.map((f) => f.uploadedId!);
      xyzenService.sendStructuredMessage({
        message,
        file_ids: fileIds,
      });
    } else {
      // No files, send message normally
      xyzenService.sendMessage(message);
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
              const agent = [...state.agents, ...state.systemAgents].find(
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
                const defaults = await providerCore.getDefaultProviderAndModel(
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
            connected: false,
            error: null,
          };

          const newHistoryItem: ChatHistoryItem = {
            id: newTopic.id,
            sessionId: existingSession.id,
            title: newTopic.name,
            updatedAt: newTopic.updated_at,
            assistantTitle: "通用助理",
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
      const agent = [...state.agents, ...state.systemAgents].find(
        (a) => a.id === agentId,
      );

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
          connected: false,
          error: null,
        };

        const newHistoryItem: ChatHistoryItem = {
          id: newTopic.id,
          sessionId: newSession.id,
          title: newTopic.name,
          updatedAt: newTopic.updated_at,
          assistantTitle: "通用助理",
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
          assistantTitle: "通用助理",
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
        }

        // Also update workshop channel if applicable
        const activeWorkshopId = state.activeWorkshopChannel;
        if (
          activeWorkshopId &&
          state.workshopChannels[activeWorkshopId]?.sessionId === sessionId
        ) {
          state.workshopChannels[activeWorkshopId].provider_id =
            updatedSession.provider_id;
          state.workshopChannels[activeWorkshopId].model = updatedSession.model;
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

        // Also update workshop channel if applicable
        const activeWorkshopId = state.activeWorkshopChannel;
        if (
          activeWorkshopId &&
          state.workshopChannels[activeWorkshopId]?.sessionId === sessionId
        ) {
          state.workshopChannels[activeWorkshopId].provider_id = providerId;
          state.workshopChannels[activeWorkshopId].model = model;
        }

        // Update all channels that belong to this session
        Object.keys(state.channels).forEach((channelId) => {
          if (state.channels[channelId].sessionId === sessionId) {
            state.channels[channelId].provider_id = providerId;
            state.channels[channelId].model = model;
          }
        });

        Object.keys(state.workshopChannels).forEach((channelId) => {
          if (state.workshopChannels[channelId].sessionId === sessionId) {
            state.workshopChannels[channelId].provider_id = providerId;
            state.workshopChannels[channelId].model = model;
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

  // Workshop panel methods
  setActiveWorkshopChannel: (channelId) =>
    set({ activeWorkshopChannel: channelId }),

  fetchWorkshopHistory: async () => {
    // Reuse the regular fetchChatHistory logic - the backend doesn't have separate workshop endpoints
    // We'll filter the results in the UI layer if needed
    console.log(
      "ChatSlice: Fetching workshop history (reusing chat history endpoints)...",
    );

    try {
      set({ workshopHistoryLoading: true });

      // Call the regular fetchChatHistory which fetches all sessions and topics
      await get().fetchChatHistory();

      // Copy relevant data to workshop state for UI separation
      // In practice, workshopChannels and chatChannels can reference the same data
      // The separation is maintained through activeWorkshopChannel vs activeChatChannel
      const { channels, chatHistory } = get();

      set({
        workshopChannels: channels,
        workshopHistory: chatHistory,
        workshopHistoryLoading: false,
      });

      console.log("ChatSlice: Workshop history synced from chat history");
    } catch (error) {
      console.error("ChatSlice: Error fetching workshop history:", error);
      set({ workshopHistoryLoading: false });
    }
  },

  togglePinWorkshopChat: (chatId: string) => {
    set((state: ChatSlice) => {
      const historyItem = state.workshopHistory.find(
        (item) => item.id === chatId,
      );
      if (historyItem) {
        historyItem.isPinned = !historyItem.isPinned;
      }
    });
  },

  activateWorkshopChannel: async (topicId: string) => {
    // Reuse the regular activateChannel logic but set workshop state
    const { workshopChannels, activeWorkshopChannel } = get();

    if (
      topicId === activeWorkshopChannel &&
      workshopChannels[topicId]?.connected
    ) {
      return;
    }

    console.log(`Activating workshop channel: ${topicId}`);
    set({ activeWorkshopChannel: topicId });

    // Call the regular activateChannel which handles fetching and connecting
    // This will update the channels state, which we sync to workshopChannels
    await get().activateChannel(topicId);

    // Sync the channel to workshop state
    const { channels } = get();
    if (channels[topicId]) {
      set((state: ChatSlice) => {
        state.workshopChannels[topicId] = channels[topicId];
      });
    }
  },

  connectToWorkshopChannel: (sessionId: string, topicId: string) => {
    console.log(
      `Connecting to workshop channel: ${topicId} (reusing chat connection logic)`,
    );

    // Reuse the regular connectToChannel which handles WebSocket connection
    get().connectToChannel(sessionId, topicId);

    // Sync the channel state to workshop state
    const { channels } = get();
    if (channels[topicId]) {
      set((state: ChatSlice) => {
        state.workshopChannels[topicId] = channels[topicId];
      });
    }
  },

  disconnectFromWorkshopChannel: () => {
    const { activeWorkshopChannel } = get();
    if (activeWorkshopChannel) {
      console.log(
        `Disconnecting from workshop channel: ${activeWorkshopChannel}`,
      );

      // Reuse the regular disconnectFromChannel logic
      get().disconnectFromChannel();

      // Update workshop state
      set((state: ChatSlice) => {
        if (state.workshopChannels[activeWorkshopChannel]) {
          state.workshopChannels[activeWorkshopChannel].connected = false;
        }
      });
    }
  },

  sendWorkshopMessage: (message: string) => {
    const { activeWorkshopChannel } = get();
    if (activeWorkshopChannel) {
      // Update workshop channel responding state
      set((state: ChatSlice) => {
        const channel = state.workshopChannels[activeWorkshopChannel];
        if (channel) channel.responding = true;
      });

      // Reuse the regular sendMessage logic
      get().sendMessage(message);

      // 🔧 FIX: Sync messages from chat channel to workshop channel
      // This ensures workshop channel gets the same messages as the underlying chat channel
      const syncMessages = () => {
        const currentState = get();
        const chatChannel =
          currentState.channels[
            currentState.activeChatChannel || activeWorkshopChannel
          ];
        const workshopChannel =
          currentState.workshopChannels[activeWorkshopChannel];

        if (chatChannel && workshopChannel) {
          set((state: ChatSlice) => {
            // Sync all messages from chat channel to workshop channel
            state.workshopChannels[activeWorkshopChannel].messages = [
              ...chatChannel.messages,
            ];
            // Sync responding state
            state.workshopChannels[activeWorkshopChannel].responding =
              chatChannel.responding;
            // Sync connection state
            state.workshopChannels[activeWorkshopChannel].connected =
              chatChannel.connected;
            // Sync error state
            state.workshopChannels[activeWorkshopChannel].error =
              chatChannel.error;
          });
        }
      };

      // Sync immediately and set up periodic syncing during message processing
      syncMessages();

      // Set up periodic syncing to catch real-time message updates
      const syncInterval = setInterval(() => {
        const state = get();
        if (!state.workshopChannels[activeWorkshopChannel]?.responding) {
          // Stop syncing when no longer responding
          clearInterval(syncInterval);
          return;
        }
        syncMessages();
      }, 100); // Sync every 100ms while responding

      // Cleanup after 30 seconds as failsafe
      setTimeout(() => clearInterval(syncInterval), 30000);
    }
  },

  createDefaultWorkshopChannel: async (agentId) => {
    try {
      const agentIdParam = agentId || "00000000-0000-0000-0000-000000000002"; // Default workshop agent
      console.log(
        `Creating default workshop channel for agent: ${agentIdParam}`,
      );

      // Reuse the regular createDefaultChannel logic
      await get().createDefaultChannel(agentIdParam);

      // After creation, sync the new channel to workshop state
      const { activeChatChannel, channels, chatHistory } = get();

      if (activeChatChannel && channels[activeChatChannel]) {
        set((state: XyzenState) => {
          // Copy the newly created channel to workshop state
          state.workshopChannels[activeChatChannel] =
            channels[activeChatChannel];
          state.workshopHistory = chatHistory;
          state.activeWorkshopChannel = activeChatChannel;
          // Clear the chat active channel since this is for workshop
          state.activeChatChannel = null;
        });

        console.log(`Workshop channel created: ${activeChatChannel}`);
      }
    } catch (error) {
      console.error("Failed to create default workshop channel:", error);
      get().showNotification(
        "创建失败",
        "无法创建新的工作坊会话，请稍后重试",
        "error",
      );
    }
  },

  updateWorkshopTopicName: async (topicId: string, newName: string) => {
    // Reuse the regular updateTopicName logic
    await get().updateTopicName(topicId, newName);

    // Sync the update to workshop state
    set((state: ChatSlice) => {
      if (state.workshopChannels[topicId]) {
        state.workshopChannels[topicId].title = newName;
      }

      const historyItem = state.workshopHistory.find(
        (item) => item.id === topicId,
      );
      if (historyItem) {
        historyItem.title = newName;
      }
    });

    console.log(`Workshop topic ${topicId} name updated to: ${newName}`);
  },

  deleteWorkshopTopic: async (topicId: string) => {
    // Reuse the regular deleteTopic logic
    await get().deleteTopic(topicId);

    // Sync the deletion to workshop state
    set((state: XyzenState) => {
      delete state.workshopChannels[topicId];

      state.workshopHistory = state.workshopHistory.filter(
        (item) => item.id !== topicId,
      );

      if (state.activeWorkshopChannel === topicId) {
        const nextTopic = state.workshopHistory[0];
        if (nextTopic) {
          state.activeWorkshopChannel = nextTopic.id;
          get().activateWorkshopChannel(nextTopic.id);
        } else {
          state.activeWorkshopChannel = null;
        }
      }
    });

    console.log(`Workshop topic ${topicId} deleted`);
  },

  clearWorkshopSessionTopics: async (sessionId: string) => {
    // Reuse the regular clearSessionTopics logic
    await get().clearSessionTopics(sessionId);

    // Refresh workshop history to sync with chat history
    await get().fetchWorkshopHistory();

    console.log(`Workshop session ${sessionId} topics cleared`);
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

  showNotification: (title, message, type = "info", actionLabel, onAction) => {
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
});
