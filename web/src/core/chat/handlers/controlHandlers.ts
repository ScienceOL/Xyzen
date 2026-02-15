/**
 * Control Event Handlers
 *
 * Pure handler functions for control/interaction events:
 * error, insufficient_balance, parallel_chat_limit, stream_aborted,
 * tool_call_request, tool_call_response, topic_updated,
 * search_citations, generated_files.
 *
 * Functions that need state-level side effects return structured results
 * via `SideEffect` so the caller (chatSlice) can apply them.
 */

import type { ChatChannel, ChatHistoryItem, MessageError } from "@/store/types";
import { generateClientId } from "../messageProcessor";
import { findMessageIndexByStream } from "../channelHelpers";

// ---------------------------------------------------------------------------
// Side-effect return types
// ---------------------------------------------------------------------------

/**
 * Notification to show at the store level (state.notification).
 * Returned from handlers instead of directly mutating store state.
 */
export interface NotificationEffect {
  isOpen: boolean;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  actionLabel?: string;
  actionUrl?: string; // Caller converts to onAction: () => window.open(...)
}

// ---------------------------------------------------------------------------
// error
// ---------------------------------------------------------------------------

export function handleError(
  channel: ChatChannel,
  eventData: {
    error: string;
    error_code?: string;
    error_category?: string;
    recoverable?: boolean;
    detail?: string;
    stream_id?: string;
  },
): void {
  channel.responding = false;

  const messageError: MessageError = eventData.error_code
    ? {
        code: eventData.error_code,
        category:
          eventData.error_category || eventData.error_code.split(".")[0],
        message: eventData.error,
        recoverable: eventData.recoverable ?? false,
        detail: eventData.detail,
      }
    : {
        code: "system.internal_error",
        category: "system",
        message: eventData.error || "An error occurred",
        recoverable: false,
      };

  // Find target using stream_id first, then fallback
  let targetIndex = -1;
  if (eventData.stream_id) {
    targetIndex = findMessageIndexByStream(channel, eventData.stream_id);
  }
  if (targetIndex === -1) {
    targetIndex = channel.messages.findIndex(
      (m) => m.status === "pending" || m.isLoading,
    );
  }
  if (targetIndex === -1) {
    for (let i = channel.messages.length - 1; i >= 0; i--) {
      const m = channel.messages[i];
      if (
        m.role === "assistant" &&
        (m.status === "streaming" || m.isStreaming)
      ) {
        targetIndex = i;
        break;
      }
    }
  }
  if (targetIndex === -1) {
    // agent_start may have consumed the loading message
    for (let i = channel.messages.length - 1; i >= 0; i--) {
      const m = channel.messages[i];
      if (m.role === "assistant" && m.agentExecution?.status === "running") {
        targetIndex = i;
        break;
      }
    }
  }

  if (targetIndex !== -1) {
    channel.messages[targetIndex] = {
      ...channel.messages[targetIndex],
      content: "",
      status: "failed",
      isLoading: false,
      isStreaming: false,
      error: messageError,
    };
  } else {
    const errorMessageId = eventData.stream_id || `error-${Date.now()}`;
    channel.messages.push({
      id: errorMessageId,
      streamId: eventData.stream_id,
      clientId: generateClientId(),
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      status: "failed",
      isNewMessage: true,
      error: messageError,
    });
  }

  console.error("Chat error:", eventData.error_code || eventData.error);
}

// ---------------------------------------------------------------------------
// insufficient_balance
// ---------------------------------------------------------------------------

export function handleInsufficientBalance(
  channel: ChatChannel,
  eventData: {
    error_code?: string;
    message?: string;
    message_cn?: string;
    details?: Record<string, unknown>;
    action_required?: string;
    stream_id?: string;
  },
): NotificationEffect | null {
  console.warn("Insufficient balance:", eventData);
  channel.responding = false;

  // Find target using stream_id first, then fallback
  let balanceLoadingIndex = -1;
  if (eventData.stream_id) {
    balanceLoadingIndex = findMessageIndexByStream(
      channel,
      eventData.stream_id,
    );
  }
  if (balanceLoadingIndex === -1) {
    balanceLoadingIndex = channel.messages.findIndex(
      (m) => m.status === "pending" || m.isLoading,
    );
  }

  if (balanceLoadingIndex !== -1) {
    channel.messages[balanceLoadingIndex] = {
      ...channel.messages[balanceLoadingIndex],
      content: "",
      status: "failed",
      isLoading: false,
      isStreaming: false,
      error: {
        code: "billing.insufficient_balance",
        category: "billing",
        message:
          eventData.message ||
          "Insufficient balance. Please recharge to continue.",
        recoverable: false,
      },
    };
  }

  return {
    isOpen: true,
    title: "积分用尽",
    message:
      "您的积分已用尽。目前产品处于内测阶段，欢迎填写问卷参与内测，获取更多使用额度。",
    type: "warning",
    actionLabel: "填写问卷",
    actionUrl:
      "https://sii-czxy.feishu.cn/share/base/form/shrcnYu8Y3GNgI7M14En1xJ7rMb",
  };
}

// ---------------------------------------------------------------------------
// parallel_chat_limit
// ---------------------------------------------------------------------------

export function handleParallelChatLimit(
  channel: ChatChannel,
  eventData: {
    error_code?: string;
    current?: number;
    limit?: number;
  },
): NotificationEffect {
  console.warn("Parallel chat limit reached:", eventData);
  channel.responding = false;

  // Remove loading message
  const limitLoadingIndex = channel.messages.findIndex(
    (m) => m.status === "pending" || m.isLoading,
  );
  if (limitLoadingIndex !== -1) {
    channel.messages.splice(limitLoadingIndex, 1);
  }

  return {
    isOpen: true,
    title: "并行会话已达上限",
    message: `您已达到并行会话上限（${eventData.current ?? "?"}/${eventData.limit ?? "?"}）。请等待其他会话完成后重试。`,
    type: "warning",
  };
}

// ---------------------------------------------------------------------------
// stream_aborted
// ---------------------------------------------------------------------------

/**
 * Handle abort acknowledgment from backend.
 *
 * @param abortTimeoutIds - Module-level Map of pending abort timeout IDs.
 *   The caller owns this Map; this function cleans up the entry for this channel.
 */
export function handleStreamAborted(
  channel: ChatChannel,
  eventData: {
    reason: string;
    partial_content_length?: number;
    tokens_consumed?: number;
  },
  abortTimeoutIds: Map<string, ReturnType<typeof setTimeout>>,
): void {
  console.log("Stream aborted:", eventData);

  // Clear any pending abort timeout since backend responded
  const pendingTimeout = abortTimeoutIds.get(channel.id);
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    abortTimeoutIds.delete(channel.id);
  }

  // Reset responding and aborting states
  channel.responding = false;
  channel.aborting = false;

  // Find any streaming message and finalize it
  const streamingIndex = channel.messages.findIndex(
    (m) => m.status === "streaming" || m.isStreaming,
  );
  if (streamingIndex !== -1) {
    channel.messages[streamingIndex].isStreaming = false;
    channel.messages[streamingIndex].status = "cancelled";
  }

  // Handle running agent execution - mark as cancelled
  const runningAgentIndex = channel.messages.findIndex(
    (m) => m.agentExecution?.status === "running",
  );
  if (runningAgentIndex !== -1) {
    const execution = channel.messages[runningAgentIndex].agentExecution;
    if (execution) {
      execution.status = "cancelled";
      execution.endedAt = Date.now();
      execution.phases.forEach((phase) => {
        if (phase.status === "running") {
          phase.status = "cancelled";
        }
      });
    }
    channel.messages[runningAgentIndex].isStreaming = false;
  }

  // Handle loading message - convert to cancelled message
  const loadingIndex = channel.messages.findIndex(
    (m) => m.status === "pending" || m.isLoading,
  );
  if (loadingIndex !== -1) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isLoading: _, ...messageWithoutLoading } =
      channel.messages[loadingIndex];
    channel.messages[loadingIndex] = {
      ...messageWithoutLoading,
      id: `aborted-${Date.now()}`,
      status: "cancelled",
      agentExecution: {
        agentId: "",
        agentName: "",
        agentType: "react",
        executionId: `aborted-${Date.now()}`,
        status: "cancelled",
        startedAt: Date.now(),
        endedAt: Date.now(),
        phases: [],
        subagents: [],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// tool_call_request
// ---------------------------------------------------------------------------

export function handleToolCallRequest(
  channel: ChatChannel,
  toolCallData: {
    id: string;
    name: string;
    description?: string;
    arguments: Record<string, unknown>;
    status: string;
    timestamp: number;
  },
): void {
  channel.responding = true;

  // Clear any existing loading messages
  const loadingIndex = channel.messages.findIndex(
    (m) => m.status === "pending" || m.isLoading,
  );
  if (loadingIndex !== -1) {
    channel.messages.splice(loadingIndex, 1);
  }

  const toolCall = {
    id: toolCallData.id,
    name: toolCallData.name,
    description: toolCallData.description,
    arguments: toolCallData.arguments,
    status: toolCallData.status as
      | "waiting_confirmation"
      | "executing"
      | "completed"
      | "failed",
    timestamp: new Date(toolCallData.timestamp).toISOString(),
  };

  // Check if there's a running agent execution with a running phase
  const agentMsgIndex = channel.messages.findLastIndex(
    (m) => m.agentExecution?.status === "running",
  );

  if (agentMsgIndex !== -1) {
    const execution = channel.messages[agentMsgIndex].agentExecution;
    if (execution) {
      // Find the running phase (or use currentNode to find the correct phase)
      let targetPhase = execution.currentNode
        ? execution.phases.find((p) => p.id === execution.currentNode)
        : null;

      // Fallback to running phase
      if (!targetPhase) {
        targetPhase = execution.phases.find((p) => p.status === "running");
      }

      if (targetPhase) {
        if (!targetPhase.toolCalls) {
          targetPhase.toolCalls = [];
        }
        targetPhase.toolCalls.push(toolCall);
        console.log(
          `ChatSlice: Added tool call ${toolCallData.name} to phase ${targetPhase.id}`,
        );
        return;
      }
    }
  }

  // Fallback: Create a new assistant message with the tool call
  const toolCallMessageId = `tool-call-${toolCallData.id}`;
  channel.messages.push({
    id: toolCallMessageId,
    clientId: generateClientId(),
    role: "assistant" as const,
    content: "",
    created_at: new Date().toISOString(),
    status: "streaming" as const,
    isLoading: false,
    isStreaming: false,
    isNewMessage: true,
    toolCalls: [toolCall],
  });
  console.log(
    `ChatSlice: Created new tool call message with tool ${toolCallData.name}`,
  );
}

// ---------------------------------------------------------------------------
// tool_call_response
// ---------------------------------------------------------------------------

export function handleToolCallResponse(
  channel: ChatChannel,
  responseData: {
    toolCallId: string;
    status: string;
    result?: unknown;
    error?: string;
  },
): void {
  // First check agent execution phases for the tool call
  const agentMsgIndex = channel.messages.findLastIndex(
    (m) => m.agentExecution?.status === "running",
  );

  if (agentMsgIndex !== -1) {
    const execution = channel.messages[agentMsgIndex].agentExecution;
    if (execution) {
      for (const phase of execution.phases) {
        if (phase.toolCalls) {
          const toolCall = phase.toolCalls.find(
            (tc) => tc.id === responseData.toolCallId,
          );
          if (toolCall) {
            toolCall.status = responseData.status as
              | "waiting_confirmation"
              | "executing"
              | "completed"
              | "failed";
            if (responseData.result) {
              toolCall.result = JSON.stringify(responseData.result);
            }
            if (responseData.error) {
              toolCall.error = responseData.error;
            }
            break;
          }
        }
      }
    }
  }

  // Also check standalone tool call messages (fallback)
  channel.messages.forEach((message) => {
    if (message.toolCalls) {
      message.toolCalls.forEach((toolCall) => {
        if (toolCall.id === responseData.toolCallId) {
          toolCall.status = responseData.status as
            | "waiting_confirmation"
            | "executing"
            | "completed"
            | "failed";
          if (responseData.result) {
            toolCall.result = JSON.stringify(responseData.result);
          }
          if (responseData.error) {
            toolCall.error = responseData.error;
          }
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// topic_updated
// ---------------------------------------------------------------------------

/**
 * Update channel title and return history update info for caller to apply.
 */
export function handleTopicUpdated(
  channel: ChatChannel,
  eventData: { id: string; name: string; updated_at: string },
  chatHistory: ChatHistoryItem[],
): void {
  channel.title = eventData.name;
  const historyItem = chatHistory.find((h) => h.id === eventData.id);
  if (historyItem) {
    historyItem.title = eventData.name;
    historyItem.updatedAt = eventData.updated_at;
  }
}

// ---------------------------------------------------------------------------
// search_citations
// ---------------------------------------------------------------------------

export function handleSearchCitations(
  channel: ChatChannel,
  eventData: {
    citations: Array<{
      url?: string;
      title?: string;
      cited_text?: string;
      start_index?: number;
      end_index?: number;
      search_queries?: string[];
    }>;
  },
): void {
  // Find the most recent assistant message that's streaming or just finished
  const lastAssistantIndex = channel.messages
    .slice()
    .reverse()
    .findIndex(
      (m) => m.role === "assistant" && (m.isStreaming || !m.citations),
    );

  if (lastAssistantIndex !== -1) {
    const actualIndex = channel.messages.length - 1 - lastAssistantIndex;
    channel.messages[actualIndex].citations = eventData.citations;
    console.log(
      `Attached ${eventData.citations.length} citations to message ${channel.messages[actualIndex].id}`,
    );
  } else {
    console.warn(
      "[Citation Debug] Could not find assistant message to attach citations",
    );
  }
}

// ---------------------------------------------------------------------------
// generated_files
// ---------------------------------------------------------------------------

export function handleGeneratedFiles(
  channel: ChatChannel,
  eventData: {
    files: Array<{
      id: string;
      name: string;
      type: string;
      size: number;
      category: "images" | "documents" | "audio" | "others";
      download_url?: string;
      thumbnail_url?: string;
    }>;
  },
): void {
  const lastAssistantIndex = channel.messages
    .slice()
    .reverse()
    .findIndex(
      (m) => m.role === "assistant" && (m.isStreaming || !m.attachments),
    );

  if (lastAssistantIndex !== -1) {
    const actualIndex = channel.messages.length - 1 - lastAssistantIndex;
    const targetMessage = channel.messages[actualIndex];

    if (!targetMessage.attachments) {
      channel.messages[actualIndex].attachments = [];
    }

    const currentAttachments = channel.messages[actualIndex].attachments || [];
    const newAttachments = eventData.files.filter(
      (newFile) => !currentAttachments.some((curr) => curr.id === newFile.id),
    );

    channel.messages[actualIndex].attachments = [
      ...currentAttachments,
      ...newAttachments,
    ];
  }
}
