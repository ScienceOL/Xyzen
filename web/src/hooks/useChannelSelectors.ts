import { useXyzen } from "@/store";
import type { ChatChannel, Message } from "@/store/types";
import { useShallow } from "zustand/react/shallow";

/** Stable empty array — avoids creating a new [] reference on every selector
 *  call when the active channel doesn't exist yet, which would cause
 *  useSyncExternalStore to detect a snapshot change → infinite re-render. */
const EMPTY_MESSAGES: Message[] = [];

/** Full active channel object (messages included — hot data). */
export function useActiveChannel(): ChatChannel | null {
  return useXyzen((s) => {
    const id = s.activeChatChannel;
    return id ? (s.channels[id] ?? null) : null;
  });
}

/** Scalar status fields of the active channel (no messages — stable between chunks). */
export function useActiveChannelStatus() {
  return useXyzen(
    useShallow((s) => {
      const id = s.activeChatChannel;
      const ch = id ? s.channels[id] : undefined;
      return {
        channelId: id,
        agentId: ch?.agentId ?? null,
        sessionId: ch?.sessionId ?? null,
        connected: ch?.connected ?? false,
        responding: ch?.responding ?? false,
        aborting: ch?.aborting ?? false,
        model_tier: ch?.model_tier ?? null,
        knowledge_set_id: ch?.knowledge_set_id ?? null,
        provider_id: ch?.provider_id ?? null,
        title: ch?.title ?? "",
      };
    }),
  );
}

/** Messages array of the active channel (hot data — changes every chunk). */
export function useActiveChannelMessages(): Message[] {
  return useXyzen((s) => {
    const id = s.activeChatChannel;
    return id ? (s.channels[id]?.messages ?? EMPTY_MESSAGES) : EMPTY_MESSAGES;
  });
}

/** Whether the active channel is currently responding. */
export function useActiveChannelResponding(): boolean {
  return useXyzen((s) => {
    const id = s.activeChatChannel;
    return id ? (s.channels[id]?.responding ?? false) : false;
  });
}

/** The agentId of the active channel. */
export function useActiveChannelAgentId(): string | null {
  return useXyzen((s) => {
    const id = s.activeChatChannel;
    return id ? (s.channels[id]?.agentId ?? null) : null;
  });
}

/** Set of agent IDs with at least one running/stopping topic (derived, stable). */
export function useRunningAgentIds(): Set<string> {
  return useXyzen((s) => s.runningAgentIds);
}

/** Count of running topics per agent (derived, stable). */
export function useActiveTopicCountByAgent(): Record<string, number> {
  return useXyzen((s) => s.activeTopicCountByAgent);
}

/** Set of channel (topic) IDs that are currently responding (derived, stable). */
export function useRespondingChannelIds(): Set<string> {
  return useXyzen((s) => s.respondingChannelIds);
}

/** Map of topicId → agentId for all channels (stable across chunks via useShallow). */
export function useChannelAgentIdMap(): Record<string, string> {
  return useXyzen(
    useShallow((s) => {
      const map: Record<string, string> = {};
      for (const [topicId, channel] of Object.entries(s.channels)) {
        if (channel.agentId) {
          map[topicId] = channel.agentId;
        }
      }
      return map;
    }),
  );
}
