/**
 * Session types for core session module
 */

import type { ChatChannel, ChatHistoryItem } from "@/store/types";

/**
 * Session data returned from backend
 */
export interface SessionResponse {
  id: string;
  name: string;
  agent_id: string;
  user_id: string;
  provider_id?: string;
  model?: string;
  google_search_enabled?: boolean;
  created_at: string;
  updated_at: string;
  topics?: TopicResponse[];
}

/**
 * Topic data returned from backend
 */
export interface TopicResponse {
  id: string;
  name: string;
  session_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Payload for creating a new session
 */
export interface SessionCreatePayload {
  name: string;
  agent_id?: string;
  provider_id?: string;
  model?: string;
  mcp_server_ids?: string[];
}

/**
 * Payload for creating a new topic
 */
export interface TopicCreatePayload {
  name: string;
  session_id: string;
}

/**
 * Result of session creation containing channel and history item
 */
export interface SessionCreationResult {
  channel: ChatChannel;
  historyItem: ChatHistoryItem;
  sessionId: string;
  topicId: string;
}

/**
 * Agent data needed for session creation
 */
export interface AgentSessionInfo {
  id: string;
  name?: string;
  provider_id?: string | null;
  model?: string | null;
  mcp_servers?: Array<{ id: string; name?: string }>;
}

/**
 * Provider info needed for provider resolution
 */
export interface ProviderInfo {
  id: string;
  provider_type: string;
  is_system: boolean;
}
