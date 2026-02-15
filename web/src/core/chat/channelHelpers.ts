/**
 * Channel Helper Functions
 *
 * Pure functions extracted from chatSlice.ts for message lookup,
 * channel state synchronization, and execution lifecycle management.
 *
 * These operate on Immer draft objects (ChatChannel / Message) and
 * have zero store dependencies — making them independently testable.
 */

import type { ChatChannel, Message } from "@/store/types";

/**
 * Get user-friendly display name for a node ID.
 * Humanizes the node ID (e.g., "clarify_with_user" → "Clarify With User").
 */
export function getNodeDisplayName(nodeId: string): string {
  return nodeId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Ensure an agent execution has at least one phase.
 *
 * For agents without explicit node_start events (like LangChain's create_react_agent),
 * creates a fallback "Response" phase so streaming content has somewhere to land.
 */
export function ensureFallbackResponsePhase(message: Message): void {
  const execution = message.agentExecution;
  if (!execution || execution.phases.length > 0) {
    return;
  }

  execution.phases.push({
    id: "response",
    name: "Response",
    status: "running",
    startedAt: Date.now(),
    nodes: [],
    streamedContent: "",
  });
  execution.currentNode = "response";
}

/**
 * Find a message index by stream_id or execution_id.
 *
 * Lookup priority:
 * 1. Match by streamId field or id
 * 2. Match by agentExecution.executionId
 * 3. Fallback: last pending assistant message
 * 4. Fallback: sole running agent execution
 */
export function findMessageIndexByStream(
  channel: ChatChannel,
  streamId: string,
  executionId?: string,
): number {
  // Primary: match by streamId field or id
  const byStreamId = channel.messages.findLastIndex(
    (m) => m.streamId === streamId || m.id === streamId,
  );
  if (byStreamId !== -1) {
    return byStreamId;
  }

  if (executionId) {
    const byExecution = channel.messages.findLastIndex(
      (m) => m.agentExecution?.executionId === executionId,
    );
    if (byExecution !== -1) {
      return byExecution;
    }
  }

  // Fallback: last pending assistant message (backward compat for events without stream_id)
  for (let i = channel.messages.length - 1; i >= 0; i--) {
    if (
      channel.messages[i].role === "assistant" &&
      channel.messages[i].status === "pending"
    ) {
      return i;
    }
  }

  const runningAgentIndices = channel.messages
    .map((m, index) => (m.agentExecution?.status === "running" ? index : -1))
    .filter((index) => index !== -1);
  return runningAgentIndices.length === 1 ? runningAgentIndices[0] : -1;
}

/**
 * Clear transient runtime flags from a message.
 * Preserves "failed" and "cancelled" status; otherwise sets "completed".
 */
export function clearMessageTransientState(message: Message): void {
  delete message.isLoading;
  delete message.isStreaming;
  message.isThinking = false;
  if (message.status !== "failed" && message.status !== "cancelled") {
    message.status = "completed";
  }
}

/**
 * Mark all running phases as terminal (completed/failed/cancelled).
 */
export function finalizeExecutionPhases(
  message: Message,
  status: "completed" | "failed" | "cancelled",
  endedAt: number,
): void {
  const execution = message.agentExecution;
  if (!execution) {
    return;
  }

  execution.phases.forEach((phase) => {
    if (phase.status === "running") {
      phase.status = status;
      phase.endedAt = endedAt;
      if (phase.startedAt) {
        phase.durationMs = endedAt - phase.startedAt;
      }
    }
  });
}

/**
 * Finalize a message's agent execution and clear transient state.
 *
 * When `onlyIfRunning` is true, the execution status is only updated if it
 * is currently "running" — this prevents completed/failed executions from
 * being accidentally overwritten by late-arriving terminal events.
 */
export function finalizeMessageExecution(
  message: Message,
  {
    status,
    durationMs,
    onlyIfRunning = false,
  }: {
    status: "completed" | "failed" | "cancelled";
    durationMs?: number;
    onlyIfRunning?: boolean;
  },
): void {
  const execution = message.agentExecution;
  const endedAt = Date.now();

  if (execution) {
    if (!onlyIfRunning || execution.status === "running") {
      execution.status = status;
      execution.endedAt = endedAt;
      if (durationMs !== undefined) {
        execution.durationMs = durationMs;
      }
      finalizeExecutionPhases(message, status, endedAt);
    }
  }

  clearMessageTransientState(message);
}

/**
 * Synchronize channel.responding based on the latest assistant message state.
 *
 * Checks (in order):
 * 1. Message status field (pending/streaming/thinking)
 * 2. Legacy boolean flags (isLoading/isStreaming/isThinking)
 * 3. Running agent execution
 * 4. Active tool calls (executing/pending/waiting_confirmation)
 */
export function syncChannelResponding(channel: ChatChannel): void {
  const latestAssistant = [...channel.messages]
    .reverse()
    .find((m) => m.role === "assistant");

  if (!latestAssistant) {
    channel.responding = false;
    return;
  }

  if (
    latestAssistant.status === "pending" ||
    latestAssistant.status === "streaming" ||
    latestAssistant.status === "thinking"
  ) {
    channel.responding = true;
    return;
  }

  if (
    latestAssistant.isLoading ||
    latestAssistant.isStreaming ||
    latestAssistant.isThinking
  ) {
    channel.responding = true;
    return;
  }

  if (latestAssistant.agentExecution?.status === "running") {
    channel.responding = true;
    return;
  }

  const hasActiveToolCall = Boolean(
    latestAssistant.toolCalls?.some(
      (toolCall) =>
        toolCall.status === "executing" ||
        toolCall.status === "pending" ||
        toolCall.status === "waiting_confirmation",
    ),
  );
  channel.responding = hasActiveToolCall;
}
