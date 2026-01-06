/**
 * Core chat module
 *
 * This module contains the business logic for chat functionality,
 * extracted from the store layer to follow the layered architecture.
 */

// Message processing utilities
export {
  generateClientId,
  groupToolMessagesWithAssistant,
  createLoadingMessage,
  convertToStreamingMessage,
  finalizeStreamingMessage,
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
