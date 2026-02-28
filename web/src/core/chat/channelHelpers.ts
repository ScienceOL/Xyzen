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

  // Fallback: last pending or streaming assistant message
  // Includes "streaming" to handle post-reconnect reconciliation where
  // DB messages lose their streamId but the message is still actively streaming.
  for (let i = channel.messages.length - 1; i >= 0; i--) {
    const m = channel.messages[i];
    if (
      m.role === "assistant" &&
      (m.status === "pending" || m.status === "streaming" || m.isStreaming)
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
 * Find the first loading/pending placeholder message.
 * Matches `status === "pending" || isLoading`.
 */
export function findLoadingMessageIndex(channel: ChatChannel): number {
  return channel.messages.findIndex(
    (m) => m.status === "pending" || m.isLoading,
  );
}

/**
 * Find the first streaming message.
 * Matches `status === "streaming" || isStreaming`.
 */
export function findStreamingMessageIndex(channel: ChatChannel): number {
  return channel.messages.findIndex(
    (m) => m.status === "streaming" || m.isStreaming,
  );
}

/**
 * Find message with a running agent execution (last match).
 */
export function findRunningAgentMessageIndex(channel: ChatChannel): number {
  return channel.messages.findLastIndex(
    (m) => m.agentExecution?.status === "running",
  );
}

/**
 * Find latest assistant message that's streaming or has no citations/attachments.
 * Used to attach late-arriving search_citations and generated_files events.
 */
export function findLatestAssistantMessageIndex(
  channel: ChatChannel,
  field: "citations" | "attachments",
): number {
  for (let i = channel.messages.length - 1; i >= 0; i--) {
    const m = channel.messages[i];
    if (m.role === "assistant" && (m.isStreaming || !m[field])) {
      return i;
    }
  }
  return -1;
}

/**
 * Clear transient runtime flags from a message.
 * Preserves "failed" and "cancelled" status; otherwise sets "completed".
 */
export function clearMessageTransientState(message: Message): void {
  delete message.isLoading;
  delete message.isStreaming;
  message.isThinking = false;
  if (
    message.status !== "failed" &&
    message.status !== "cancelled" &&
    message.status !== "waiting_for_user"
  ) {
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
  const prevResponding = channel.responding;

  const latestAssistant = [...channel.messages]
    .reverse()
    .find((m) => m.role === "assistant");

  if (!latestAssistant) {
    channel.responding = false;
    if (prevResponding !== false) {
      console.warn(
        "[syncChannelResponding] responding: true → false (no assistant message)",
      );
    }
    return;
  }

  if (
    latestAssistant.status === "pending" ||
    latestAssistant.status === "streaming" ||
    latestAssistant.status === "thinking" ||
    latestAssistant.status === "waiting_for_user"
  ) {
    channel.responding = true;
    return;
  }

  // A pending user question means the agent is interrupted and waiting
  // for the user's answer — keep input disabled even if status is "completed".
  if (
    latestAssistant.userQuestion &&
    latestAssistant.userQuestion.status === "pending"
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

  if (prevResponding && !channel.responding) {
    console.warn(
      "[syncChannelResponding] responding: true → false",
      "| msg.id:",
      latestAssistant.id,
      "| status:",
      latestAssistant.status,
      "| isLoading:",
      latestAssistant.isLoading,
      "| isStreaming:",
      latestAssistant.isStreaming,
      "| isThinking:",
      latestAssistant.isThinking,
      "| agentExec:",
      latestAssistant.agentExecution?.status,
      "| toolCalls:",
      latestAssistant.toolCalls?.map((t) => `${t.id}:${t.status}`),
    );
  }
}
