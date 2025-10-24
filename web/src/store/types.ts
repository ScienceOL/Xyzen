import type {
  AgentSlice,
  AuthSlice,
  ChatSlice,
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
  result?: string;
  error?: string;
  timestamp: string;
}

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | "system" | "tool";
  created_at: string;
  // Legacy fields for backward compatibility
  sender?: "user" | "assistant" | "system";
  timestamp?: string;
  // New fields for loading and streaming
  isLoading?: boolean;
  isStreaming?: boolean;
  // Tool call related fields
  toolCalls?: ToolCall[];
  isToolCalling?: boolean;
}

export interface ChatChannel {
  id: string; // This will now be the Topic ID
  sessionId: string; // The session this topic belongs to
  title: string;
  messages: Message[];
  agentId?: string;
  connected: boolean;
  error: string | null;
  // Whether assistant is currently producing a reply (planning, tool calls, or generating tokens)
  responding?: boolean;
}

export interface ChatHistoryItem {
  id: string;
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

export type LayoutStyle = "sidebar" | "fullscreen";

export type UiSettingType = "theme" | "style";

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
  topics: TopicResponse[];
}

export type XyzenState = UiSlice &
  ChatSlice &
  AgentSlice &
  McpSlice &
  McpToolSlice &
  ProviderSlice &
  AuthSlice &
  LoadingSlice;
