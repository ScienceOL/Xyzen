import { useRespondingChannelIds } from "@/hooks/useChannelSelectors";
import { sessionService, type SessionTopicRead } from "@/service/sessionService";
import { topicService } from "@/service/topicService";
import { useXyzen } from "@/store";
import i18n from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

export interface OpenTab {
  id: string;
  name: string;
}

export interface UseAgentTopicsResult {
  openTabs: OpenTab[];
  sessionId: string | null;
  loading: boolean;
  activeTopicId: string | null;
  respondingTopicIds: Set<string>;
  createTopic: () => Promise<void>;
  closeTab: (topicId: string) => void;
}

/**
 * Build a lookup map from topic id → name, using backend topics as the
 * authoritative source and falling back to channel titles in the store.
 */
function buildNameMap(topics: SessionTopicRead[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of topics) {
    map.set(t.id, t.name);
  }
  // Also pull channel titles for topics that may not be in the session list
  const channels = useXyzen.getState().channels;
  for (const [id, ch] of Object.entries(channels)) {
    if (!map.has(id) && ch.title) {
      map.set(id, ch.title);
    }
  }
  return map;
}

export function useAgentTopics(agentId: string): UseAgentTopicsResult {
  // All topics from backend (for name lookups, not displayed)
  const [allTopics, setAllTopics] = useState<SessionTopicRead[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Open tabs from persisted store
  const openTabs = useXyzen(
    useShallow((s) => (s.openTabsByAgent[agentId] ?? []) as OpenTab[]),
  );

  const activeTopicId = useXyzen((s) => s.activeChatChannel);
  const respondingChannelIds = useRespondingChannelIds();

  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;

  // Fetch session & topics on mount.
  useEffect(() => {
    let cancelled = false;

    const fetchTopics = async () => {
      setLoading(true);
      try {
        const session = await sessionService.getSessionByAgent(agentId);
        if (cancelled) return;

        const topics = session.topics ?? [];
        setAllTopics(topics);
        setSessionId(session.id);
        setLoading(false);

        const store = useXyzen.getState();
        const existingTabs = store.openTabsByAgent[agentId];

        if (!existingTabs?.length) {
          // Seed with the first topic (most recent) if no tabs exist yet
          if (topics[0]) {
            store.openTab(agentId, {
              id: topics[0].id,
              name: topics[0].name,
            });
          }
        } else {
          // Reconcile: fix stale tab names with authoritative backend data
          const nameMap = buildNameMap(topics);
          let needsUpdate = false;
          const reconciled = existingTabs.map((tab) => {
            const correctName = nameMap.get(tab.id);
            if (correctName && correctName !== tab.name) {
              needsUpdate = true;
              return { ...tab, name: correctName };
            }
            return tab;
          });
          if (needsUpdate) {
            store.setOpenTabs(agentId, reconciled);
          }
        }
      } catch {
        if (cancelled) return;
        setAllTopics([]);
        setSessionId(null);
        setLoading(false);
      }
    };

    fetchTopics();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // When the store's activeTopicId changes (e.g. from SessionHistory sidebar),
  // ensure it appears in our open tabs.
  useEffect(() => {
    if (!activeTopicId) return;

    const store = useXyzen.getState();
    const tabs = store.openTabsByAgent[agentIdRef.current] ?? [];
    if (tabs.some((t) => t.id === activeTopicId)) return;

    // Resolve the best available name: allTopics → channel title → fallback
    const nameMap = buildNameMap(allTopics);
    const name = nameMap.get(activeTopicId) || i18n.t("app.toolbar.newChat");
    store.openTab(agentIdRef.current, { id: activeTopicId, name });
  }, [activeTopicId, allTopics]);

  const createTopic = useCallback(async () => {
    if (!sessionId) return;

    const newTopic = await topicService.createTopic({
      name: i18n.t("app.toolbar.newChat"),
      session_id: sessionId,
    });

    const newTab: OpenTab = { id: newTopic.id, name: newTopic.name };
    const topicRead: SessionTopicRead = {
      id: newTopic.id,
      name: newTopic.name,
      updated_at: newTopic.updated_at,
      is_pinned: false,
    };

    setAllTopics((prev) => [topicRead, ...prev]);
    useXyzen.getState().openTab(agentIdRef.current, newTab);

    await useXyzen
      .getState()
      .ensureChannelForTopic(newTopic.id, sessionId, agentIdRef.current);
  }, [sessionId]);

  const closeTab = useCallback(
    (topicId: string) => {
      const store = useXyzen.getState();
      const tabs = store.openTabsByAgent[agentIdRef.current] ?? [];

      // If we're closing the active tab, switch to an adjacent tab
      if (topicId === activeTopicId && tabs.length > 1) {
        const closedIdx = tabs.findIndex((t) => t.id === topicId);
        const remaining = tabs.filter((t) => t.id !== topicId);
        const nextIdx = Math.min(closedIdx, remaining.length - 1);
        const nextTab = remaining[nextIdx];
        if (nextTab && sessionId) {
          store.ensureChannelForTopic(
            nextTab.id,
            sessionId,
            agentIdRef.current,
          );
        }
      }

      store.closeTab(agentIdRef.current, topicId);
    },
    [activeTopicId, sessionId],
  );

  return {
    openTabs,
    sessionId,
    loading,
    activeTopicId,
    respondingTopicIds: respondingChannelIds,
    createTopic,
    closeTab,
  };
}
