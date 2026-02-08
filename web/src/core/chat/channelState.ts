import type { ChatChannel } from "@/store/types";

/**
 * Merge backend channel metadata into an existing channel while preserving
 * runtime state (in-memory messages and streaming flags).
 */
export function mergeChannelPreservingRuntime(
  existing: ChatChannel | undefined,
  incoming: ChatChannel,
): ChatChannel {
  if (!existing) {
    return incoming;
  }

  return {
    ...existing,
    // Keep backend metadata authoritative.
    id: incoming.id,
    sessionId: incoming.sessionId,
    title: incoming.title,
    agentId: incoming.agentId,
    provider_id: incoming.provider_id,
    model: incoming.model,
    model_tier: incoming.model_tier,
    knowledge_set_id: incoming.knowledge_set_id,

    // Preserve runtime/in-memory state.
    messages: existing.messages,
    connected: existing.connected,
    error: existing.error,
    responding: existing.responding,
    aborting: existing.aborting,
    knowledgeContext: existing.knowledgeContext,
  };
}
