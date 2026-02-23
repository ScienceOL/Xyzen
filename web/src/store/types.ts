import type { AgentExecutionState } from "@/types/agentEvents";
import type {
  AgentSlice,
  AuthSlice,
  ChatSlice,
  FileUploadSlice,
  KnowledgeSlice,
  LoadingSlice,
  McpSlice,
  McpToolSlice,
  NotificationSlice,
  ProviderSlice,
  UiSlice,
  WalletSlice,
} from "./slices";

// 定义应用中的核心类型
export interface ToolCallResult {
  success: boolean;
  data: unknown;
  error?: string;
  truncated?: boolean;
  original_length?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  description?: string;
  arguments: Record<string, unknown>;
  status:
    | "pending"
    | "waiting_confirmation"
    | "executing"
    | "completed"
    | "failed";
  result?: ToolCallResult;
  error?: string;
  timestamp: string;
}

export interface MessageAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  category: "images" | "documents" | "audio" | "others";
  download_url?: string;
  thumbnail_url?: string;
}

export interface SearchCitation {
  url?: string;
  title?: string;
  cited_text?: string;
  start_index?: number;
  end_index?: number;
  search_queries?: string[];
}

export interface MessageError {
  code: string; // ChatErrorCode value, e.g. "provider.rate_limited"
  category: string; // "provider" | "content" | "agent" | "billing" | "system"
  message: string; // User-safe display message
  recoverable: boolean; // Show retry button?
  detail?: string; // Optional sanitized detail
}

/**
 * Unified message lifecycle status.
 * Replaces the separate boolean flags (isLoading, isStreaming, isThinking).
 */
export type MessageStatus =
  | "sending" // Optimistic user message, awaiting backend echo
  | "pending" // Waiting for backend response (was isLoading)
  | "thinking" // Model is reasoning (was isThinking)
  | "streaming" // Content streaming in progress (was isStreaming)
  | "completed" // Normal completion
  | "failed" // Error occurred
  | "cancelled"; // User interrupted

export interface Message {
  id: string;
  // Stream ID for routing events throughout the message lifecycle.
  // Set from backend stream_id; used by findMessageByStreamId for deterministic lookup.
  streamId?: string;
  // Database UUID, written on message_saved event.
  dbId?: string;
  clientId?: string;
  content: string;
  role: "user" | "assistant" | "system" | "tool";
  created_at: string;

  // Unified lifecycle status
  status: MessageStatus;

  timestamp?: string;

  /** @deprecated Use status === "pending" */
  isLoading?: boolean;
  /** @deprecated Use status === "streaming" */
  isStreaming?: boolean;
  // Typewriter effect flag - only applies typewriter effect to newly created messages, not loaded history
  isNewMessage?: boolean;
  // Tool call related fields
  toolCalls?: ToolCall[];
  // Multimodal support
  attachments?: MessageAttachment[];
  // Search citations from built-in search
  citations?: SearchCitation[];
  /** @deprecated Use status === "thinking" */
  isThinking?: boolean;
  thinkingContent?: string;
  // Agent execution state for graph-based agents (legacy - will be migrated to agent_metadata)
  agentExecution?: AgentExecutionState;
  // Scalable agent metadata structure for node/phase/subagent execution
  agent_metadata?: AgentMetadata;
  // Structured error for error messages
  error?: MessageError;
}

/**
 * Scalable agent execution metadata structure
 * Stored in database and used to recreate UI state on refresh
 */
export interface AgentMetadata {
  // Execution identification
  execution_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string; // "react", "graph", "system"

  // Node/Phase execution (for individual message cards)
  node?: {
    id: string;
    name: string;
    type: string; // "llm", "tool", "router", etc.
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    started_at: number; // Unix timestamp
    ended_at?: number;
    duration_ms?: number;
    input_summary?: string;
    output_summary?: string;
    streamedContent?: string; // For real-time streaming
  };

  // Phase execution (for workflow phases)
  phase?: {
    id: string;
    name: string;
    description?: string;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    started_at: number;
    ended_at?: number;
    duration_ms?: number;
    output_summary?: string;
  };

  // Hierarchical tracking
  parent_execution_id?: string;
  depth?: number; // 0 for root, 1+ for subagents
  execution_path?: string[]; // ["root", "deep_research", "web_search"]

  // Iteration tracking
  iteration?: {
    current: number;
    max: number;
    reason?: string;
  };

  // Progress tracking
  progress?: {
    percent?: number; // 0-100
    message?: string;
  };

  // Error information
  error?: {
    type: string;
    message: string;
    recoverable: boolean;
    node_id?: string;
  };

  // Extension fields for future use
  [key: string]: unknown;
}

export interface KnowledgeContext {
  parentId: string;
  folderName: string;
}

export interface ChatChannel {
  id: string; // This will now be the Topic ID
  sessionId: string; // The session this topic belongs to
  title: string;
  messages: Message[];
  agentId?: string;
  provider_id?: string;
  model?: string;
  model_tier?: "ultra" | "pro" | "standard" | "lite";
  knowledge_set_id?: string; // Session-level knowledge set override
  knowledgeContext?: KnowledgeContext;
  connected: boolean;
  error: string | null;
  // Whether assistant is currently producing a reply (planning, tool calls, or generating tokens)
  responding?: boolean;
  // Whether an abort request is in progress
  aborting?: boolean;
  // Latest context usage tokens for this topic (not cumulative historical spend)
  tokenUsage?: number;
}

export interface ChatHistoryItem {
  id: string;
  // The session this topic belongs to (used to avoid subscribing to channels state)
  sessionId: string;
  title: string;
  updatedAt: string;
  assistantTitle: string;
  lastMessage?: string;
  isPinned: boolean;
}

export interface User {
  id?: string;
  username: string;
  avatar: string;
}

export type Theme = "light" | "dark" | "system";

export type UiSettingType = "theme" | "style" | "language";

// Add types for API response
export interface TopicResponse {
  id: string;
  name: string;
  updated_at: string;
  is_pinned: boolean;
}

export interface SessionResponse {
  id: string;
  name: string;
  user_id: string;
  agent_id?: string;
  provider_id?: string;
  model?: string;
  model_tier?: "ultra" | "pro" | "standard" | "lite";
  knowledge_set_id?: string;
  spatial_layout?: Record<string, unknown> | null;
  topics: TopicResponse[];
}

export type XyzenState = UiSlice &
  ChatSlice &
  AgentSlice &
  McpSlice &
  McpToolSlice &
  ProviderSlice &
  AuthSlice &
  LoadingSlice &
  FileUploadSlice &
  KnowledgeSlice &
  NotificationSlice &
  WalletSlice;
