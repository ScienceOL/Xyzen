import type { ToolCall } from "@/store/types";

/**
 * Parsed tool event from backend message content
 */
interface ParsedToolEvent {
  event: "tool_call_request" | "tool_call_response";
  id?: string;
  toolCallId?: string;
  name?: string;
  description?: string;
  arguments?: Record<string, unknown>;
  status?: string;
  result?: unknown;
  error?: string;
  timestamp?: number;
}

/**
 * Parse JSON content from a tool message
 */
export function parseToolMessage(content: string): ParsedToolEvent | null {
  try {
    const parsed = JSON.parse(content);
    if (
      parsed.event === "tool_call_request" ||
      parsed.event === "tool_call_response"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert parsed tool event to ToolCall interface
 */
export function toolEventToToolCall(event: ParsedToolEvent): ToolCall | null {
  // Handle tool_call_request
  if (event.event === "tool_call_request") {
    return {
      id: event.id || "",
      name: event.name || "Unknown Tool",
      description: event.description,
      arguments: event.arguments || {},
      status: (event.status as ToolCall["status"]) || "pending",
      timestamp: event.timestamp
        ? new Date(event.timestamp).toISOString()
        : new Date().toISOString(),
    };
  }

  // Handle tool_call_response
  if (event.event === "tool_call_response") {
    return {
      id: event.toolCallId || event.id || "",
      name: "Tool Response",
      arguments: {},
      status: (event.status as ToolCall["status"]) || "completed",
      result: event.result ? JSON.stringify(event.result) : undefined,
      error: event.error,
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Group tool messages to merge request/response pairs
 * Returns a map of toolCallId -> merged ToolCall
 * For history display, tool calls are shown as completed with arguments and results together
 */
export function groupToolEvents(
  events: ParsedToolEvent[],
): Map<string, ToolCall> {
  const toolCallMap = new Map<string, ToolCall>();

  for (const event of events) {
    if (event.event === "tool_call_request") {
      const toolCall = toolEventToToolCall(event);
      if (toolCall) {
        // In history, we don't show "executing" status - keep it for now, will be updated by response
        toolCallMap.set(toolCall.id, toolCall);
      }
    } else if (event.event === "tool_call_response") {
      const toolCallId = event.toolCallId || event.id || "";
      const existing = toolCallMap.get(toolCallId);

      if (existing) {
        // Merge response into existing request
        // Update status based on response (completed or failed)
        existing.status = (event.status as ToolCall["status"]) || "completed";
        if (event.result !== undefined) {
          // Handle both old format (string/raw) and new structured format from backend
          if (typeof event.result === "object" && event.result !== null && "content" in event.result) {
            // New structured format: { type: "json", content: {...}, raw: "..." }
            existing.result = JSON.stringify(event.result.content, null, 2);
          } else {
            // Legacy format: string or direct object
            existing.result =
              typeof event.result === "string"
                ? event.result
                : JSON.stringify(event.result);
          }
        }
        if (event.error) {
          existing.error = event.error;
          existing.status = "failed";
        }
      } else {
        // Create new entry for orphaned response
        const toolCall = toolEventToToolCall(event);
        if (toolCall) {
          toolCallMap.set(toolCallId, toolCall);
        }
      }
    }
  }

  return toolCallMap;
}
