import type { ChatChannel, Message } from "@/store/types";

export type TopicStatus = "idle" | "running" | "stopping" | "failed";

function getLatestAssistantMessage(
  messages: Message[] | undefined,
): Message | undefined {
  if (!messages || messages.length === 0) {
    return undefined;
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") {
      return messages[i];
    }
  }

  return undefined;
}

export function deriveTopicStatus(
  channel: ChatChannel | undefined,
): TopicStatus {
  if (!channel) {
    return "idle";
  }

  if (channel.aborting) {
    return "stopping";
  }

  if (channel.responding) {
    return "running";
  }

  const latestAssistant = getLatestAssistantMessage(channel.messages);
  if (!latestAssistant) {
    return "idle";
  }

  // Use status field first, then legacy boolean flags
  if (
    latestAssistant.status === "streaming" ||
    latestAssistant.status === "thinking" ||
    latestAssistant.status === "pending"
  ) {
    return "running";
  }

  if (latestAssistant.isStreaming || latestAssistant.isThinking) {
    return "running";
  }

  if (latestAssistant.agentExecution?.status === "running") {
    return "running";
  }
  if (latestAssistant.agentExecution?.status === "failed") {
    return "failed";
  }

  const hasActiveToolCall = Boolean(
    latestAssistant.toolCalls?.some(
      (toolCall) =>
        toolCall.status === "executing" ||
        toolCall.status === "pending" ||
        toolCall.status === "waiting_confirmation",
    ),
  );
  if (hasActiveToolCall) {
    return "running";
  }

  return "idle";
}

export function isActiveTopicStatus(status: TopicStatus): boolean {
  return status === "running" || status === "stopping";
}
