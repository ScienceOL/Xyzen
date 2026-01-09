/**
 * WebSocket connection manager for chat functionality
 *
 * This module wraps the xyzenService WebSocket connection and provides
 * a cleaner interface for the rest of the application.
 */

import xyzenService from "@/service/xyzenService";
import type { WebSocketCallbacks } from "./types";

/**
 * Current connection state
 */
let currentSessionId: string | null = null;
let currentTopicId: string | null = null;

/**
 * Connect to a chat channel via WebSocket
 *
 * @param sessionId - The session ID to connect to
 * @param topicId - The topic ID within the session
 * @param callbacks - Event callbacks for messages, status, and streaming events
 */
export function connectToChannel(
  sessionId: string,
  topicId: string,
  callbacks: WebSocketCallbacks,
): void {
  // Disconnect from any existing connection
  disconnect();

  // Store current connection info
  currentSessionId = sessionId;
  currentTopicId = topicId;

  // Connect using the underlying service
  // Note: The type cast is needed because xyzenService has a slightly different type
  // for the event callback, but the structure is compatible
  xyzenService.connect(
    sessionId,
    topicId,
    callbacks.onMessage,
    callbacks.onStatus,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callbacks.onEvent as any,
  );
}

/**
 * Disconnect from the current WebSocket connection
 */
export function disconnect(): void {
  xyzenService.disconnect();
  currentSessionId = null;
  currentTopicId = null;
}

/**
 * Send a message through the WebSocket connection
 *
 * @param content - The message content to send
 */
export function sendMessage(content: string): void {
  xyzenService.sendMessage(content);
}

/**
 * Confirm a tool call through the WebSocket connection
 *
 * @param toolCallId - The ID of the tool call to confirm
 */
export function confirmToolCall(toolCallId: string): void {
  xyzenService.sendStructuredMessage({
    type: "tool_call_confirm",
    tool_call_id: toolCallId,
  });
}

/**
 * Cancel a tool call through the WebSocket connection
 *
 * @param toolCallId - The ID of the tool call to cancel
 */
export function cancelToolCall(toolCallId: string): void {
  xyzenService.sendStructuredMessage({
    type: "tool_call_cancel",
    tool_call_id: toolCallId,
  });
}

/**
 * Get the current connection info
 */
export function getCurrentConnection(): {
  sessionId: string | null;
  topicId: string | null;
} {
  return {
    sessionId: currentSessionId,
    topicId: currentTopicId,
  };
}

/**
 * Check if currently connected to a specific channel
 */
export function isConnectedTo(topicId: string): boolean {
  return currentTopicId === topicId;
}
