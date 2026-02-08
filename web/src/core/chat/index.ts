/**
 * Core chat module
 *
 * This module contains the business logic for chat functionality,
 * extracted from the store layer to follow the layered architecture.
 */

// Message processing utilities
export {
  generateClientId,
  isValidUuid,
  groupToolMessagesWithAssistant,
  createLoadingMessage,
  convertToStreamingMessage,
  finalizeStreamingMessage,
  reconstructAgentExecutionFromMetadata,
} from "./messageProcessor";

// WebSocket management
export {
  connectToChannel,
  disconnect,
  sendMessage,
  confirmToolCall,
  cancelToolCall,
  getCurrentConnection,
  isConnectedTo,
} from "./websocketManager";

// Types
export type {
  WebSocketMessageEvent,
  ConnectionStatus,
  WebSocketCallbacks,
  IWebSocketManager,
  XyzenServiceInterface,
} from "./types";

// Message content resolution utilities
export {
  getLastNonEmptyPhaseContent,
  resolveMessageContent,
  getMessageDisplayMode,
} from "./messageContent";
export type { ResolvedContent, MessageDisplayMode } from "./messageContent";

// Channel state merge utilities
export { mergeChannelPreservingRuntime } from "./channelState";

// Channel/topic status utilities
export { deriveTopicStatus, isActiveTopicStatus } from "./channelStatus";
export type { TopicStatus } from "./channelStatus";
