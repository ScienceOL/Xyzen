/**
 * Discriminated Union for Chat WebSocket Events
 *
 * Replaces the loosely-typed `{ type: string; data: Message | Record<string, any> }`
 * with a proper discriminated union so TypeScript narrows `event.data` automatically
 * in switch/case blocks — eliminating all `as` casts.
 */

import type { Message, ToolCallResult } from "@/store/types";
import type {
  AgentStartData,
  AgentEndData,
  AgentErrorData,
  NodeStartData,
  NodeEndData,
  SubagentStartData,
  SubagentEndData,
  ProgressUpdateData,
} from "./agentEvents";

export type ChatEvent =
  | {
      type: "processing" | "loading";
      data: { stream_id: string };
    }
  | {
      type: "streaming_start";
      data: { stream_id: string; execution_id?: string };
    }
  | {
      type: "streaming_chunk";
      data: { stream_id: string; content: string; execution_id?: string };
    }
  | {
      type: "streaming_end";
      data: { stream_id: string; created_at?: string; execution_id?: string };
    }
  | {
      type: "message";
      data: Message;
    }
  | {
      type: "message_saved";
      data: { stream_id: string; db_id: string; created_at: string };
    }
  | {
      type: "message_ack";
      data: { message_id: string; client_id?: string };
    }
  | {
      type: "error";
      data: {
        error: string;
        error_code?: string;
        error_category?: string;
        recoverable?: boolean;
        detail?: string;
        stream_id: string;
      };
    }
  | {
      type: "insufficient_balance";
      data: {
        error_code?: string;
        message?: string;
        message_cn?: string;
        details?: Record<string, unknown>;
        action_required?: string;
        stream_id: string;
      };
    }
  | {
      type: "parallel_chat_limit";
      data: { error_code?: string; current?: number; limit?: number };
    }
  | {
      type: "stream_aborted";
      data: {
        reason: string;
        partial_content_length?: number;
        tokens_consumed?: number;
      };
    }
  | {
      type: "tool_call_request";
      data: {
        id: string;
        name: string;
        description?: string;
        arguments: Record<string, unknown>;
        status: string;
        timestamp: number;
        stream_id: string;
      };
    }
  | {
      type: "tool_call_response";
      data: {
        toolCallId: string;
        status: string;
        result?: ToolCallResult;
        error?: string;
      };
    }
  | {
      type: "thinking_start";
      data: { stream_id: string };
    }
  | {
      type: "thinking_chunk";
      data: { stream_id: string; content: string };
    }
  | {
      type: "thinking_end";
      data: { stream_id: string };
    }
  | {
      type: "topic_updated";
      data: { id: string; name: string; updated_at: string };
    }
  | {
      type: "search_citations";
      data: {
        citations: Array<{
          url?: string;
          title?: string;
          cited_text?: string;
          start_index?: number;
          end_index?: number;
          search_queries?: string[];
        }>;
      };
    }
  | {
      type: "generated_files";
      data: {
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
    }
  | {
      type: "token_usage";
      data: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
        stream_id: string;
      };
    }
  | { type: "agent_start"; data: AgentStartData }
  | { type: "agent_end"; data: AgentEndData }
  | { type: "agent_error"; data: AgentErrorData }
  | { type: "node_start"; data: NodeStartData }
  | { type: "node_end"; data: NodeEndData }
  | { type: "subagent_start"; data: SubagentStartData }
  | { type: "subagent_end"; data: SubagentEndData }
  | { type: "progress_update"; data: ProgressUpdateData };
