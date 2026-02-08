import type { ChatChannel, Message } from "@/store/types";

export type TopicStatus = "idle" | "running" | "stopping" | "failed";

function getLatestAssistantExecutionStatus(
  messages: Message[] | undefined,
): "running" | "completed" | "failed" | "cancelled" | undefined {
  if (!messages || messages.length === 0) {
    return undefined;
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const executionStatus = messages[i]?.agentExecution?.status;
    if (executionStatus) {
      return executionStatus;
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

  const hasStreamingMessage = channel.messages.some(
    (msg) => msg.isStreaming || msg.isThinking,
  );
  if (hasStreamingMessage) {
    return "running";
  }

  const latestExecutionStatus = getLatestAssistantExecutionStatus(
    channel.messages,
  );
  if (latestExecutionStatus === "running") {
    return "running";
  }
  if (latestExecutionStatus === "failed") {
    return "failed";
  }

  return "idle";
}

export function isActiveTopicStatus(status: TopicStatus): boolean {
  return status === "running" || status === "stopping";
}
