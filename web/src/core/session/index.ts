/**
 * Core session module
 *
 * This module contains business logic for session management,
 * extracted from the store layer to follow the layered architecture.
 */

// Session creator utilities
export {
  createChannelFromSession,
  createHistoryItemFromSession,
  resolveProviderAndModel,
  buildSessionPayload,
  createTopicInSession,
  createNewSession,
  findOrCreateSession,
} from "./sessionCreator";

// Types
export type {
  SessionResponse,
  TopicResponse,
  SessionCreatePayload,
  TopicCreatePayload,
  SessionCreationResult,
  AgentSessionInfo,
  ProviderInfo,
} from "./types";
