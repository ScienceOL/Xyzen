/**
 * Message processing utilities for chat functionality
 *
 * This module contains pure functions for processing and transforming messages.
 * Extracted from chatSlice.ts to follow the layered architecture pattern.
 */

import { parseToolMessage } from "@/utils/toolMessageParser";
import type { Message, ToolCall } from "@/store/types";

/**
 * Generate a unique client-side message ID
 * Used for optimistic updates before server assigns permanent ID
 */
export function generateClientId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Deep clone a ToolCall object
 */
function cloneToolCall(toolCall: ToolCall): ToolCall {
  return {
    ...toolCall,
    arguments: { ...(toolCall.arguments || {}) },
  };
}

/**
 * Deep clone a Message object, handling all nested properties
 * Also maps backend `thinking_content` to frontend `thinkingContent`
 */
function cloneMessage(message: Message): Message {
  // Handle backend field name difference
  const backendThinkingContent = (
    message as Message & { thinking_content?: string }
  ).thinking_content;

  return {
    ...message,
    toolCalls: message.toolCalls
      ? message.toolCalls.map((toolCall) => cloneToolCall(toolCall))
      : undefined,
    attachments: message.attachments ? [...message.attachments] : undefined,
    citations: message.citations ? [...message.citations] : undefined,
    // Map thinking_content from backend to thinkingContent for frontend
    thinkingContent: backendThinkingContent ?? message.thinkingContent,
  };
}

/**
 * Group consecutive tool messages with their preceding assistant message
 *
 * This function processes message history to create a unified view where:
 * - Tool call requests are converted to assistant messages with toolCalls
 * - Tool responses are attached to their corresponding tool calls
 * - The result matches the live chat experience
 *
 * Tool messages that can't be grouped are kept as standalone messages.
 *
 * @param messages - Raw messages from the backend
 * @returns Processed messages with grouped tool calls
 */
export function groupToolMessagesWithAssistant(messages: Message[]): Message[] {
  const result: Message[] = [];

  // Lookup map to find tool calls by their ID
  const toolCallLookup = new Map<
    string,
    { toolCall: ToolCall; message: Message }
  >();

  for (const msg of messages) {
    // Non-tool messages are cloned and added directly
    if (msg.role !== "tool") {
      const cloned = cloneMessage(msg);
      result.push(cloned);

      // Register any tool calls for later reference
      if (cloned.toolCalls) {
        cloned.toolCalls.forEach((toolCall) => {
          toolCallLookup.set(toolCall.id, { toolCall, message: cloned });
        });
      }
      continue;
    }

    // Parse tool message content
    const parsed = parseToolMessage(msg.content);
    if (!parsed) {
      // Unparseable tool messages are kept as-is
      result.push(cloneMessage(msg));
      continue;
    }

    // Handle tool call requests
    if (parsed.event === "tool_call_request") {
      const toolCallId =
        parsed.id || parsed.toolCallId || msg.id || crypto.randomUUID();

      const toolCall: ToolCall = {
        id: toolCallId,
        name: parsed.name || "Unknown Tool",
        description: parsed.description,
        arguments: { ...(parsed.arguments || {}) },
        status: (parsed.status as ToolCall["status"]) || "waiting_confirmation",
        timestamp: parsed.timestamp
          ? new Date(parsed.timestamp).toISOString()
          : msg.created_at,
      };

      // Create an assistant message to hold this tool call
      const toolMessage: Message = {
        id: msg.id || `tool-call-${toolCallId}`,
        clientId: msg.clientId,
        role: "assistant",
        content: "",
        created_at: msg.created_at,
        toolCalls: [toolCall],
      };

      result.push(toolMessage);
      toolCallLookup.set(toolCallId, { toolCall, message: toolMessage });
      continue;
    }

    // Handle tool responses/updates
    const toolCallId = parsed.toolCallId || parsed.id || msg.id || "";
    if (!toolCallId) {
      continue;
    }

    let existingEntry = toolCallLookup.get(toolCallId);
    if (!existingEntry) {
      // Create a placeholder if we received a response without seeing the request
      const toolCall: ToolCall = {
        id: toolCallId,
        name: "工具调用",
        arguments: {},
        status: (parsed.status as ToolCall["status"]) || "completed",
        timestamp: msg.created_at,
      };

      const toolMessage: Message = {
        id: msg.id || `tool-response-${toolCallId}`,
        clientId: msg.clientId,
        role: "assistant",
        content: "工具调用更新",
        created_at: msg.created_at,
        toolCalls: [toolCall],
      };

      result.push(toolMessage);
      existingEntry = { toolCall, message: toolMessage };
      toolCallLookup.set(toolCallId, existingEntry);
    }

    const { toolCall } = existingEntry;

    // Update tool call with response data
    if (parsed.status) {
      toolCall.status = parsed.status as ToolCall["status"];
    }

    if (parsed.result !== undefined) {
      toolCall.result =
        typeof parsed.result === "string"
          ? parsed.result
          : JSON.stringify(parsed.result);
    }

    if (parsed.error) {
      toolCall.error = parsed.error;
      toolCall.status = "failed";
    }
  }

  return result;
}

/**
 * Create a loading message placeholder
 * Used when waiting for assistant response
 */
export function createLoadingMessage(): Message {
  return {
    id: `loading-${Date.now()}`,
    clientId: generateClientId(),
    role: "assistant" as const,
    content: "",
    created_at: new Date().toISOString(),
    isLoading: true,
    isStreaming: false,
    isNewMessage: true,
  };
}

/**
 * Create a streaming message from a loading message
 * Used when assistant starts generating content
 */
export function convertToStreamingMessage(
  loadingMessage: Message,
  messageId: string,
): Message {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isLoading: _, ...messageWithoutLoading } = loadingMessage;
  return {
    ...messageWithoutLoading,
    id: messageId,
    isStreaming: true,
    content: "",
  };
}

/**
 * Finalize a streaming message
 * Removes transient flags and sets final timestamp
 */
export function finalizeStreamingMessage(
  message: Message,
  createdAt?: string,
): Message {
  const finalMessage = { ...message } as Omit<Message, never> & {
    isLoading?: boolean;
    isStreaming?: boolean;
  };

  delete finalMessage.isLoading;
  delete finalMessage.isStreaming;

  return {
    ...finalMessage,
    created_at: createdAt || new Date().toISOString(),
  } as Message;
}
