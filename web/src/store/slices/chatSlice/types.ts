import type {
  ChatChannel,
  ChatHistoryItem,
  KnowledgeContext,
  XyzenState,
} from "../../types";

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

  // Ensure a channel exists for a topic, then activate it
  ensureChannelForTopic: (
    topicId: string,
    sessionId: string,
    agentId: string,
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

  // Retry a failed message (remove local-only message + resend)
  retryMessage: (messageId: string) => void;

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

// Re-export store types used by action files
export type { ChatChannel, ChatHistoryItem, KnowledgeContext, XyzenState };

// Type aliases for set/get used in action factories
export type SetState = (
  fn: Partial<XyzenState> | ((state: XyzenState) => void | Partial<XyzenState>),
) => void;
export type GetState = () => XyzenState;

/**
 * Shared helper functions passed to action factories.
 * These are defined in index.ts and shared across action files.
 */
export interface Helpers {
  reconcileChannelFromBackend: (topicId: string) => Promise<void>;
  updateDerivedStatus: () => void;
  closeIdleNonPrimaryConnection: (topicId: string) => void;
  getAgentNameById: (agentId?: string) => string;
  waitForChannelConnection: (
    topicId: string,
    options?: { logFailure?: boolean },
  ) => Promise<boolean>;
}
