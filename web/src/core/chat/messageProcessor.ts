/**
 * Message processing utilities for chat functionality
 *
 * This module contains pure functions for processing and transforming messages.
 * Extracted from chatSlice.ts to follow the layered architecture pattern.
 */

import { parseToolMessage } from "@/utils/toolMessageParser";
import type { Message, ToolCall, AgentMetadata } from "@/store/types";
import type { AgentExecutionState, PhaseExecution } from "@/types/agentEvents";

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
 * And reconstructs agentExecution from agent_metadata if available
 */
function cloneMessage(message: Message): Message {
  // Handle backend field name difference
  const backendThinkingContent = (
    message as Message & { thinking_content?: string }
  ).thinking_content;

  const cloned: Message = {
    ...message,
    toolCalls: message.toolCalls
      ? message.toolCalls.map((toolCall) => cloneToolCall(toolCall))
      : undefined,
    attachments: message.attachments ? [...message.attachments] : undefined,
    citations: message.citations ? [...message.citations] : undefined,
    // Map thinking_content from backend to thinkingContent for frontend
    thinkingContent: backendThinkingContent ?? message.thinkingContent,
  };

  // Reconstruct agentExecution from agent_metadata if available
  // This enables timeline display for historical messages after page refresh
  if (message.agent_metadata && !message.agentExecution) {
    const reconstructed = reconstructAgentExecutionFromMetadata(
      message.agent_metadata,
    );
    if (reconstructed) {
      cloned.agentExecution = reconstructed;
    }
  }

  return cloned;
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

/**
 * Get user-friendly display name for a node ID
 */
function getNodeDisplayName(nodeId: string): string {
  const names: Record<string, string> = {
    clarify_with_user: "Clarification",
    write_research_brief: "Research Brief",
    research_supervisor: "Research",
    final_report_generation: "Final Report",
  };
  return names[nodeId] || nodeId;
}

/**
 * Truncate a string to a maximum length
 */
function truncate(str: string | unknown, maxLength: number): string {
  if (typeof str !== "string") {
    if (typeof str === "object" && str !== null) {
      return truncate(JSON.stringify(str), maxLength);
    }
    return "";
  }
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

/**
 * Extract meaningful content from node output
 * Handles both string outputs and structured objects
 */
function extractNodeContent(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  if (typeof output === "object" && output !== null) {
    const obj = output as Record<string, unknown>;

    // For clarify_with_user, extract verification message
    if ("verification" in obj && typeof obj.verification === "string") {
      return obj.verification;
    }

    // For other objects, try to find meaningful content fields
    const contentFields = ["content", "result", "output", "message", "text"];
    for (const field of contentFields) {
      if (field in obj && typeof obj[field] === "string" && obj[field]) {
        return obj[field] as string;
      }
    }

    // Fallback to JSON representation
    return JSON.stringify(output, null, 2);
  }

  return "";
}

/**
 * Reconstruct AgentExecutionState from agent_metadata stored in database
 *
 * After page refresh, messages lose their ephemeral agentExecution state.
 * This function reconstructs it from the persisted agent_metadata.node_outputs
 * so the timeline UI can be displayed for historical agent executions.
 */
export function reconstructAgentExecutionFromMetadata(
  agent_metadata: AgentMetadata | undefined,
): AgentExecutionState | undefined {
  if (!agent_metadata) return undefined;

  // Check for node_outputs in the metadata (stored by graph agents)
  const nodeOutputs = agent_metadata.node_outputs as
    | Record<string, unknown>
    | undefined;
  if (!nodeOutputs || typeof nodeOutputs !== "object") return undefined;

  const phases: PhaseExecution[] = [];

  // Known node order for deep research agent
  // This order matches the graph execution flow
  const nodeOrder = [
    "clarify_with_user",
    "write_research_brief",
    "research_supervisor",
    "final_report_generation",
  ];

  for (const nodeId of nodeOrder) {
    if (nodeId in nodeOutputs) {
      const output = nodeOutputs[nodeId];
      const content = extractNodeContent(output);

      phases.push({
        id: nodeId,
        name: getNodeDisplayName(nodeId),
        status: "completed",
        nodes: [],
        outputSummary: content ? truncate(content, 200) : undefined,
        // Store full content for expandable view (empty string if no content)
        streamedContent: content || "",
      });
    }
  }

  // Also handle any nodes not in the known order (for extensibility)
  for (const nodeId of Object.keys(nodeOutputs)) {
    if (!nodeOrder.includes(nodeId)) {
      const output = nodeOutputs[nodeId];
      const content = extractNodeContent(output);

      phases.push({
        id: nodeId,
        name: getNodeDisplayName(nodeId),
        status: "completed",
        nodes: [],
        outputSummary: content ? truncate(content, 200) : undefined,
        streamedContent: content || "",
      });
    }
  }

  if (phases.length === 0) return undefined;

  return {
    agentId: (agent_metadata.agent_id as string) || "unknown",
    agentName: (agent_metadata.agent_name as string) || "Deep Research",
    agentType: (agent_metadata.agent_type as string) || "graph",
    executionId: (agent_metadata.execution_id as string) || "unknown",
    status: "completed",
    startedAt: Date.now(),
    phases,
    subagents: [],
  };
}
