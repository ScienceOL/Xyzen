/**
 * Streaming Event Handlers
 *
 * Pure handler functions for streaming lifecycle events:
 * processing, loading, streaming_start, streaming_end,
 * message, message_saved, thinking_start, thinking_end.
 *
 * All functions operate on Immer draft objects (ChatChannel / Message)
 * and have zero store dependencies.
 */

import type { ChatChannel, Message } from "@/store/types";
import { generateClientId, isValidUuid } from "../messageProcessor";
import {
  ensureFallbackResponsePhase,
  finalizeMessageExecution,
  findLoadingMessageIndex,
  findMessageIndexByStream,
  findRunningAgentMessageIndex,
} from "../channelHelpers";
import { getLastNonEmptyPhaseContent } from "../messageContent";

// ---------------------------------------------------------------------------
// processing / loading
// ---------------------------------------------------------------------------

/**
 * Shared logic for `processing` and `loading` events.
 * Creates a pending assistant message if one doesn't already exist.
 */
export function handleProcessingOrLoading(
  channel: ChatChannel,
  streamId: string,
): void {
  channel.responding = true;

  // If stream_id is provided, try to find existing message
  const existingIndex = findMessageIndexByStream(channel, streamId);
  if (existingIndex !== -1) {
    return; // Message already exists
  }

  const existingLoadingIndex = findLoadingMessageIndex(channel);

  if (existingLoadingIndex === -1) {
    channel.messages.push({
      id: streamId,
      streamId: streamId,
      clientId: generateClientId(),
      role: "assistant" as const,
      content: "",
      created_at: new Date().toISOString(),
      status: "pending",
      isLoading: true,
      isStreaming: false,
      isNewMessage: true,
    });
  }
}

// ---------------------------------------------------------------------------
// streaming_start
// ---------------------------------------------------------------------------

export function handleStreamingStart(
  channel: ChatChannel,
  eventData: { stream_id: string; execution_id?: string },
): void {
  channel.responding = true;

  // First try deterministic stream/execution lookup (handles concurrent streams correctly)
  let targetIndex = findMessageIndexByStream(
    channel,
    eventData.stream_id,
    eventData.execution_id,
  );

  // Then fallback to loading message conversion
  if (targetIndex === -1) {
    targetIndex = findLoadingMessageIndex(channel);
  }

  if (targetIndex !== -1) {
    const targetMessage = channel.messages[targetIndex] as Message & {
      isLoading?: boolean;
    };
    delete targetMessage.isLoading;
    targetMessage.id = eventData.stream_id;
    targetMessage.streamId = eventData.stream_id;
    targetMessage.isThinking = false;
    targetMessage.status = "streaming";
    targetMessage.isStreaming = true;
    if (!targetMessage.content) {
      targetMessage.content = "";
    }
    ensureFallbackResponsePhase(targetMessage);
    return;
  }

  // No message found, create a streaming message now
  channel.messages.push({
    id: eventData.stream_id,
    streamId: eventData.stream_id,
    clientId: generateClientId(),
    role: "assistant" as const,
    content: "",
    isNewMessage: true,
    created_at: new Date().toISOString(),
    status: "streaming",
    isStreaming: true,
  });
}

// ---------------------------------------------------------------------------
// streaming_end
// ---------------------------------------------------------------------------

export function handleStreamingEnd(
  channel: ChatChannel,
  eventData: {
    stream_id: string;
    created_at?: string;
    execution_id?: string;
  },
): void {
  let endingIndex = findMessageIndexByStream(
    channel,
    eventData.stream_id,
    eventData.execution_id,
  );

  if (endingIndex === -1) {
    const streamingIndices = channel.messages
      .map((m, idx) => (m.status === "streaming" || m.isStreaming ? idx : -1))
      .filter((idx) => idx !== -1);
    endingIndex = streamingIndices.length === 1 ? streamingIndices[0] : -1;
  }

  if (endingIndex !== -1) {
    const messageFinal = channel.messages[endingIndex] as Message & {
      isLoading?: boolean;
      isStreaming?: boolean;
    };

    if (
      !messageFinal.content &&
      messageFinal.agentExecution &&
      messageFinal.agentExecution.phases.length > 0
    ) {
      const phaseContent = getLastNonEmptyPhaseContent(
        messageFinal.agentExecution.phases,
      );
      if (phaseContent) {
        messageFinal.content = phaseContent;
      }
    }

    if (messageFinal.agentExecution?.status === "running") {
      // Agent execution is still in progress (e.g., between LLM iterations
      // in a tool-calling loop). Only clear streaming flags; keep the
      // execution alive for upcoming events (tool_call_request, next
      // node_start / streaming_start, etc.). agent_end will finalize.
      messageFinal.isStreaming = false;
    } else {
      // No running agent execution — fully finalize.
      // Also serves as fallback when terminal agent event is delayed/missed.
      finalizeMessageExecution(messageFinal, {
        status: "completed",
        onlyIfRunning: true,
      });
    }
    messageFinal.created_at = eventData.created_at || new Date().toISOString();
    console.debug(
      "[ChatSlice] streaming_end: finalized message at index",
      endingIndex,
    );
  } else {
    console.warn("[ChatSlice] streaming_end: no message found to finalize");
  }
}

// ---------------------------------------------------------------------------
// message
// ---------------------------------------------------------------------------

export function handleMessage(
  channel: ChatChannel,
  regularMessage: Message,
): void {
  if (!channel.messages.some((m) => m.id === regularMessage.id)) {
    channel.messages.push({
      ...regularMessage,
      status: regularMessage.status || "completed",
      isNewMessage: true,
    });
  }
}

// ---------------------------------------------------------------------------
// message_saved
// ---------------------------------------------------------------------------

export function handleMessageSaved(
  channel: ChatChannel,
  eventData: { stream_id: string; db_id: string; created_at: string },
): void {
  let messageIndex = findMessageIndexByStream(channel, eventData.stream_id);

  // Fallback: when error occurs before streaming_start, the frontend
  // message has a temporary id that won't match the stream_id.
  // Find the most recent assistant error message with a non-UUID id.
  if (messageIndex === -1) {
    for (let i = channel.messages.length - 1; i >= 0; i--) {
      const m = channel.messages[i];
      if (m.role === "assistant" && m.error && !isValidUuid(m.id)) {
        messageIndex = i;
        break;
      }
    }
  }

  if (messageIndex !== -1) {
    const savedMessage = channel.messages[messageIndex];
    savedMessage.dbId = eventData.db_id;
    savedMessage.id = eventData.db_id;
    savedMessage.created_at = eventData.created_at;

    // message_saved is emitted after persistence/finalization.
    // If we missed terminal stream events, clear stale runtime flags here.
    finalizeMessageExecution(savedMessage, {
      status: "completed",
      onlyIfRunning: true,
    });
  }
}

// ---------------------------------------------------------------------------
// thinking_start
// ---------------------------------------------------------------------------

export function handleThinkingStart(
  channel: ChatChannel,
  eventData: { stream_id: string },
): void {
  channel.responding = true;

  // First check for loading message
  const loadingIndex = findLoadingMessageIndex(channel);
  if (loadingIndex !== -1) {
    // Convert loading message to thinking message
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isLoading: _, ...messageWithoutLoading } =
      channel.messages[loadingIndex];
    channel.messages[loadingIndex] = {
      ...messageWithoutLoading,
      id: eventData.stream_id,
      status: "thinking",
      isThinking: true,
      thinkingContent: "",
      content: "",
    };
    return;
  }

  // Check for running agent execution message
  // (agent_start may have already consumed the loading message)
  const agentMsgIndex = findRunningAgentMessageIndex(channel);
  if (agentMsgIndex !== -1) {
    channel.messages[agentMsgIndex] = {
      ...channel.messages[agentMsgIndex],
      status: "thinking",
      isThinking: true,
      thinkingContent: "",
    };
    return;
  }

  // Fallback: No loading or agent message, create a thinking message
  channel.messages.push({
    id: eventData.stream_id,
    clientId: `thinking-${Date.now()}`,
    role: "assistant" as const,
    content: "",
    isNewMessage: true,
    created_at: new Date().toISOString(),
    status: "thinking",
    isThinking: true,
    thinkingContent: "",
  });
}

// ---------------------------------------------------------------------------
// thinking_end
// ---------------------------------------------------------------------------

export function handleThinkingEnd(
  channel: ChatChannel,
  eventData: { stream_id: string },
): void {
  // Try to find by ID first
  let endThinkingIndex = channel.messages.findIndex(
    (m) => m.id === eventData.stream_id,
  );

  // If not found by ID, check for agent message with isThinking
  if (endThinkingIndex === -1) {
    endThinkingIndex = channel.messages.findLastIndex(
      (m) => m.isThinking && m.agentExecution?.status === "running",
    );
  }

  if (endThinkingIndex !== -1) {
    channel.messages[endThinkingIndex].isThinking = false;
  }
}
