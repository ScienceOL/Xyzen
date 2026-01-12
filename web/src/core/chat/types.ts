/**
 * WebSocket event types for chat communication
 *
 * These types define the structure of events received from the WebSocket
 * connection during a chat session.
 */

import type { Message, MessageAttachment, SearchCitation } from "@/store/types";
import type {
  AgentStartData,
  AgentEndData,
  AgentErrorData,
  PhaseStartData,
  PhaseEndData,
  NodeStartData,
  NodeEndData,
  SubagentStartData,
  SubagentEndData,
  ProgressUpdateData,
  IterationStartData,
  IterationEndData,
  StateUpdateData,
} from "@/types/agentEvents";

/**
 * Union type of all possible WebSocket message events
 */
export type WebSocketMessageEvent =
  | { type: "processing" }
  | { type: "loading" }
  | { type: "streaming_start"; data: { id: string } }
  | { type: "streaming_chunk"; data: { id: string; content: string } }
  | {
      type: "streaming_end";
      data: { id: string; created_at?: string };
    }
  | { type: "thinking_start"; data: { id: string } }
  | { type: "thinking_chunk"; data: { id: string; content: string } }
  | { type: "thinking_end"; data: { id: string } }
  | { type: "message"; data: Message }
  | { type: "search_citations"; data: { citations: SearchCitation[] } }
  | { type: "generated_files"; data: { files: MessageAttachment[] } }
  | { type: "tool_call"; data: unknown }
  | { type: "tool_result"; data: unknown }
  // Agent execution events
  | { type: "agent_start"; data: AgentStartData }
  | { type: "agent_end"; data: AgentEndData }
  | { type: "agent_error"; data: AgentErrorData }
  | { type: "phase_start"; data: PhaseStartData }
  | { type: "phase_end"; data: PhaseEndData }
  | { type: "node_start"; data: NodeStartData }
  | { type: "node_end"; data: NodeEndData }
  | { type: "subagent_start"; data: SubagentStartData }
  | { type: "subagent_end"; data: SubagentEndData }
  | { type: "progress_update"; data: ProgressUpdateData }
  | { type: "iteration_start"; data: IterationStartData }
  | { type: "iteration_end"; data: IterationEndData }
  | { type: "state_update"; data: StateUpdateData };

/**
 * Connection status from WebSocket
 */
export interface ConnectionStatus {
  connected: boolean;
  error: string | null;
}

/**
 * Callbacks for WebSocket events
 */
export interface WebSocketCallbacks {
  /** Called when a complete message is received */
  onMessage: (message: Message) => void;
  /** Called when connection status changes */
  onStatus: (status: ConnectionStatus) => void;
  /** Called for streaming and other real-time events */
  onEvent: (event: WebSocketMessageEvent) => void;
}

/**
 * WebSocket manager interface
 * Abstracts the WebSocket connection logic for chat functionality
 */
export interface IWebSocketManager {
  connect(
    sessionId: string,
    topicId: string,
    callbacks: WebSocketCallbacks,
  ): void;
  disconnect(): void;
  sendMessage(content: string): void;
  confirmToolCall(toolCallId: string): void;
  cancelToolCall(toolCallId: string): void;
}

/**
 * Default export type for xyzenService
 * This matches the interface of the existing xyzenService
 */
export interface XyzenServiceInterface {
  connect(
    sessionId: string,
    topicId: string,
    onMessage: (message: Message) => void,
    onStatus: (status: ConnectionStatus) => void,
    onEvent: (event: WebSocketMessageEvent) => void,
  ): void;
  disconnect(): void;
  sendMessage(content: string): void;
  confirmToolCall(toolCallId: string): void;
  cancelToolCall(toolCallId: string): void;
}
