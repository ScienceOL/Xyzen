import type { AgentExecutionState } from "@/types/agentEvents";
import type {
  AgentSlice,
  AuthSlice,
  ChatSlice,
  FileUploadSlice,
  LoadingSlice,
  McpSlice,
  McpToolSlice,
  ProviderSlice,
  UiSlice,
} from "./slices";

// 定义应用中的核心类型
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
  result?: string | { type: string; content: unknown; raw: string };
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

export interface Message {
  id: string;
  clientId?: string;
  content: string;
  role: "user" | "assistant" | "system" | "tool";
  created_at: string;
  // Legacy fields for backward compatibility
  sender?: "user" | "assistant" | "system";
  timestamp?: string;
  // New fields for loading and streaming
  isLoading?: boolean;
  isStreaming?: boolean;
  // Typewriter effect flag - only applies typewriter effect to newly created messages, not loaded history
  isNewMessage?: boolean;
  // Tool call related fields
  toolCalls?: ToolCall[];
  isToolCalling?: boolean;
  // Multimodal support
  attachments?: MessageAttachment[];
  // Search citations from built-in search
  citations?: SearchCitation[];
  // Thinking/reasoning content from models like Claude, DeepSeek R1, OpenAI o1
  isThinking?: boolean;
  thinkingContent?: string;
  // Agent execution state for graph-based agents (legacy - will be migrated to agent_metadata)
  agentExecution?: AgentExecutionState;
  // Scalable agent metadata structure for node/phase/subagent execution
  agent_metadata?: AgentMetadata;
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
  folderId: string;
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
  google_search_enabled?: boolean;
  knowledgeContext?: KnowledgeContext;
  connected: boolean;
  error: string | null;
  // Whether assistant is currently producing a reply (planning, tool calls, or generating tokens)
  responding?: boolean;
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
}

export interface SessionResponse {
  id: string;
  name: string;
  user_id: string;
  agent_id?: string;
  provider_id?: string;
  model?: string;
  model_tier?: "ultra" | "pro" | "standard" | "lite";
  google_search_enabled?: boolean;
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
  FileUploadSlice;
