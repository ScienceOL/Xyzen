import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DOCK_SAFE_AREA } from "@/components/layouts/BottomDock";
import AddAgentModal from "@/components/modals/AddAgentModal";
import AgentSettingsModal from "@/components/modals/AgentSettingsModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { useAutoExploreToggle } from "@/hooks/useAutoExploreToggle";
import {
  useRunningAgentIds,
  useChannelAgentIdMap,
} from "@/hooks/useChannelSelectors";
import { useMyMarketplaceListings } from "@/hooks/useMarketplace";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import {
  AddAgentButton,
  AgentNode,
  GroupNode,
  RootAgentNode,
  agentToFlowNode,
  agentsToGroupedFlowNodes,
  DEFAULT_VIEWPORT,
  FitViewButton,
  FOCUS_ZOOM,
  FocusedView,
  OfficialAgentsOverlay,
  SaveStatusIndicator,
  STORAGE_KEY_FOCUSED_AGENT,
  STORAGE_KEY_GROUP_EXPAND,
  STORAGE_KEY_VIEWPORT,
  useLayoutPersistence,
  useNodeHandlers,
  type AgentData,
  type AgentFlowNode,
  type SaveStatus,
} from "./spatial";

function InnerWorkspace() {
  const { t } = useTranslation();
  const {
    agents,
    rootAgentId,
    updateAgentLayout,
    updateAgentAvatar,
    deleteAgent,
    agentStats,
    sessionIdByAgentId,
    dailyActivity,
    yesterdaySummary,
    chatHistory,
    showOfficialRecommendations,
    setActivePanel,
  } = useXyzen(
    useShallow((s) => ({
      agents: s.agents,
      rootAgentId: s.rootAgentId,
      updateAgentLayout: s.updateAgentLayout,
      updateAgentAvatar: s.updateAgentAvatar,
      deleteAgent: s.deleteAgent,
      agentStats: s.agentStats,
      sessionIdByAgentId: s.sessionIdByAgentId,
      dailyActivity: s.dailyActivity,
      yesterdaySummary: s.yesterdaySummary,
      chatHistory: s.chatHistory,
      showOfficialRecommendations: s.showOfficialRecommendations,
      setActivePanel: s.setActivePanel,
    })),
  );

  // Derived state from store (only updates on state transitions, not streaming_chunk)
  const activeAgentIds = useRunningAgentIds();
  const channelAgentIdMap = useChannelAgentIdMap();
  const { handleToggle: handleAutoExploreToggle, loading: autoExploreLoading } =
    useAutoExploreToggle();

  // Marketplace hook to track published agents
  const { data: myListings } = useMyMarketplaceListings();
  const publishedAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const listing of myListings ?? []) {
      if (listing.is_published) ids.add(listing.agent_id);
    }
    return ids;
  }, [myListings]);

  // Compute last conversation time per agent
  const lastConversationTimeByAgent = useMemo(() => {
    const timeMap: Record<string, string> = {};
    for (const topic of chatHistory) {
      const agentId = channelAgentIdMap[topic.id];
      if (!agentId) continue;
      const existing = timeMap[agentId];
      if (!existing || topic.updatedAt > existing) {
        timeMap[agentId] = topic.updatedAt;
      }
    }
    return timeMap;
  }, [chatHistory, channelAgentIdMap]);

  // State
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentFlowNode>([]);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_FOCUSED_AGENT);
    } catch {
      return null;
    }
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [prevViewport, setPrevViewport] = useState<Viewport | null>(null);
  const [newlyCreatedAgentId, setNewlyCreatedAgentId] = useState<string | null>(
    null,
  );

  // Group expand/collapse state (persisted to localStorage)
  const [groupExpandState, setGroupExpandState] = useState<
    Record<string, boolean>
  >(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_GROUP_EXPAND);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const handleToggleExpand = useCallback((groupId: string) => {
    setGroupExpandState((prev) => {
      const next = { ...prev, [groupId]: prev[groupId] === false };
      try {
        localStorage.setItem(STORAGE_KEY_GROUP_EXPAND, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Defer heavy XyzenChat rendering while viewport is animating
  const [viewportAnimating, setViewportAnimating] = useState(false);
  const viewportAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initStateRef = useRef<"pending" | "measuring" | "done">("pending");
  const focusedAgentIdRef = useRef<string | null>(focusedAgentId);
  const prevViewportRef = useRef<Viewport | null>(prevViewport);
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prevAgentIdsRef = useRef<Set<string>>(new Set());

  // Cache for identity-preserving nodesWithHandler — prevents ReactFlow from
  // re-rendering AgentNode components whose data hasn't actually changed
  const nodesHandlerCacheRef = useRef(
    new Map<
      string,
      {
        srcData: unknown;
        isFocused: boolean;
        isNewlyCreated: boolean;
        isRunning: boolean;
        resultData: AgentFlowNode["data"];
      }
    >(),
  );

  // Keep refs in sync
  useEffect(() => {
    focusedAgentIdRef.current = focusedAgentId;
  }, [focusedAgentId]);

  useEffect(() => {
    prevViewportRef.current = prevViewport;
  }, [prevViewport]);

  // ReactFlow hooks
  const { setViewport, getViewport, getNode, fitView } = useReactFlow();

  // Layout persistence
  const { scheduleSave, handleRetrySave } = useLayoutPersistence({
    updateAgentLayout,
    onStatusChange: setSaveStatus,
  });

  // Node handlers
  const {
    handleLayoutChange,
    handleNodeDragStop,
    handleAvatarChange,
    handleDeleteAgent: handleDeleteAgentBase,
  } = useNodeHandlers({
    getNode: getNode as (id: string) => AgentFlowNode | undefined,
    setNodes,
    scheduleSave,
    updateAgentAvatar,
    deleteAgent,
  });

  /** Mark viewport as animating; clears after the given duration (ms) + buffer. */
  const startViewportAnimation = useCallback((durationMs: number) => {
    if (viewportAnimTimerRef.current)
      clearTimeout(viewportAnimTimerRef.current);
    setViewportAnimating(true);
    viewportAnimTimerRef.current = setTimeout(() => {
      setViewportAnimating(false);
      viewportAnimTimerRef.current = null;
    }, durationMs + 50); // small buffer
  }, []);

  // Calculate viewport center position
  const getViewportCenterPosition = useCallback(() => {
    const viewport = getViewport();
    const rect = containerRef.current?.getBoundingClientRect();
    const containerW = rect?.width ?? window.innerWidth;
    const containerH = rect?.height ?? window.innerHeight;

    const centerX = (containerW / 2 - viewport.x) / viewport.zoom;
    const centerY = (containerH / 2 - viewport.y) / viewport.zoom;

    const nodeWidth = 320;
    const nodeHeight = 160;
    return {
      x: centerX - nodeWidth / 2,
      y: centerY - nodeHeight / 2,
    };
  }, [getViewport]);

  // Helper to build a flow node from agent
  const buildFlowNode = useCallback(
    (
      agent: (typeof agents)[0],
      overridePosition?: { x: number; y: number },
    ) => {
      const stats = agentStats[agent.id];
      const sessionId = sessionIdByAgentId[agent.id];
      const agentDailyActivity = dailyActivity[agent.id]?.daily_counts?.map(
        (d) => ({ date: d.date, count: d.message_count }),
      );
      const agentYesterdaySummary = yesterdaySummary[agent.id]
        ? {
            topicCount: yesterdaySummary[agent.id].topic_count ?? 0,
            messageCount: yesterdaySummary[agent.id].message_count,
            lastMessagePreview: yesterdaySummary[agent.id].last_message_content,
          }
        : undefined;
      const lastConversationTime = lastConversationTimeByAgent[agent.id];
      const isMarketplacePublished = publishedAgentIds.has(agent.id);

      const node = agentToFlowNode(
        agent,
        stats,
        sessionId,
        agentDailyActivity,
        agentYesterdaySummary,
        lastConversationTime,
        isMarketplacePublished,
      );

      // Inject running state
      node.data.isRunning = activeAgentIds.has(agent.id);
      // Mark CEO node — use separate node type for distinct styling
      const isCeo = agent.id === rootAgentId;
      node.data.isCeo = isCeo;
      if (isCeo) {
        node.type = "ceo";
        // Only show CEO's direct children (not second-level children)
        node.data.subordinateAvatars = agents
          .filter(
            (a) =>
              a.id !== rootAgentId &&
              (!a.parent_id || a.parent_id === rootAgentId),
          )
          .map(
            (a) =>
              a.avatar ||
              "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
          );
      }

      if (overridePosition) {
        node.position = overridePosition;
      }

      return node;
    },
    [
      agentStats,
      sessionIdByAgentId,
      dailyActivity,
      yesterdaySummary,
      lastConversationTimeByAgent,
      publishedAgentIds,
      activeAgentIds,
      rootAgentId,
      agents,
    ],
  );

  // Sync nodes with agents - using incremental updates
  useEffect(() => {
    if (agents.length === 0) {
      if (nodes.length > 0) {
        setNodes([]);
      }
      prevAgentIdsRef.current = new Set();
      return;
    }

    const currentAgentIds = new Set(agents.map((a) => a.id));
    const prevAgentIds = prevAgentIdsRef.current;

    // Case 1: Initial load - no previous agents tracked
    if (prevAgentIds.size === 0) {
      const flowNodes = agentsToGroupedFlowNodes(
        agents,
        rootAgentId,
        groupExpandState,
        buildFlowNode,
      );
      setNodes(flowNodes);
      prevAgentIdsRef.current = currentAgentIds;
      return;
    }

    // Find added and removed agents by comparing with previous agent IDs
    const addedAgentIds: string[] = [];
    const removedAgentIds: string[] = [];

    for (const id of currentAgentIds) {
      if (!prevAgentIds.has(id)) {
        addedAgentIds.push(id);
      }
    }

    for (const id of prevAgentIds) {
      if (!currentAgentIds.has(id)) {
        removedAgentIds.push(id);
      }
    }

    // Update ref before any state changes
    prevAgentIdsRef.current = currentAgentIds;

    // No changes - early return
    if (addedAgentIds.length === 0 && removedAgentIds.length === 0) {
      return;
    }

    // Case 2: Agents added
    if (addedAgentIds.length > 0) {
      const centerPosition = getViewportCenterPosition();
      const newNodes: AgentFlowNode[] = [];

      for (const agentId of addedAgentIds) {
        const agent = agents.find((a) => a.id === agentId);
        if (agent) {
          const node = buildFlowNode(agent, centerPosition);
          newNodes.push(node);

          scheduleSave(agentId, {
            position: centerPosition,
            size: "medium",
            gridSize: { w: 2, h: 1 },
          });
        }
      }

      if (newNodes.length > 0) {
        setNodes((prev) => [...prev, ...newNodes]);

        // Highlight first new agent
        setNewlyCreatedAgentId(addedAgentIds[0]);
        setTimeout(() => {
          setNewlyCreatedAgentId(null);
        }, 2500);
      }
    }

    // Case 3: Agents removed
    if (removedAgentIds.length > 0) {
      setNodes((prev) => prev.filter((n) => !removedAgentIds.includes(n.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  // Rebuild nodes when group expand/collapse state changes
  useEffect(() => {
    if (agents.length === 0) return;
    const flowNodes = agentsToGroupedFlowNodes(
      agents,
      rootAgentId,
      groupExpandState,
      buildFlowNode,
    );
    setNodes(flowNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupExpandState]);

  // Update node data when stats change (without recreating nodes).
  // IMPORTANT: preserve identity — only return a new object when values
  // have actually changed.  Returning the same `node` reference means
  // nodesWithHandler's identity cache stays valid → AgentNode skips render.
  useEffect(() => {
    if (nodes.length === 0 || agents.length === 0) return;

    setNodes((prev) => {
      let changed = 0;
      const next = prev.map((node) => {
        const agent = agents.find((a) => a.id === node.id);
        if (!agent) return node;

        // Group nodes only need childCount/childAvatars updates
        if (node.type === "group") {
          const children = agents.filter((a) => a.parent_id === agent.id);
          const avatar =
            agent.avatar ||
            "https://api.dicebear.com/7.x/avataaars/svg?seed=default";
          const childAvatars = children.map(
            (c) =>
              c.avatar ||
              "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
          );
          // Skip update if nothing changed
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = node.data as any;
          if (
            d.name === agent.name &&
            d.avatar === avatar &&
            d.childCount === children.length &&
            d.childAvatars?.length === childAvatars.length &&
            d.childAvatars?.every(
              (a: string, i: number) => a === childAvatars[i],
            )
          ) {
            return node;
          }
          changed++;
          return {
            ...node,
            data: {
              ...d,
              name: agent.name,
              avatar,
              childCount: children.length,
              childAvatars,
            },
          } as AgentFlowNode;
        }

        const stats = agentStats[agent.id];
        const sessionId = sessionIdByAgentId[agent.id];
        const rawDaily = dailyActivity[agent.id]?.daily_counts;
        const rawYesterday = yesterdaySummary[agent.id];
        const lastConversationTime = lastConversationTimeByAgent[agent.id];
        const isMarketplacePublished = publishedAgentIds.has(agent.id);
        const isCeo = agent.id === rootAgentId;
        const avatar =
          agent.avatar ||
          "https://api.dicebear.com/7.x/avataaars/svg?seed=default";
        const role = (agent.description?.split("\n")[0] || "Agent") as string;

        // Shallow-compare the values that actually change — if everything
        // matches the existing node.data, return the original reference.
        const d = node.data;
        const statsMatch =
          (d.stats?.messageCount ?? -1) === (stats?.message_count ?? -1) &&
          (d.stats?.topicCount ?? -1) === (stats?.topic_count ?? -1) &&
          (d.stats?.inputTokens ?? -1) === (stats?.input_tokens ?? -1) &&
          (d.stats?.outputTokens ?? -1) === (stats?.output_tokens ?? -1);
        const scalarMatch =
          d.name === agent.name &&
          d.role === role &&
          d.avatar === avatar &&
          d.sessionId === sessionId &&
          d.lastConversationTime === lastConversationTime &&
          d.isMarketplacePublished === isMarketplacePublished &&
          d.isCeo === isCeo;

        if (statsMatch && scalarMatch) {
          return node; // identity preserved — no re-render
        }

        changed++;
        const agentDailyActivity = rawDaily?.map((dd) => ({
          date: dd.date,
          count: dd.message_count,
        }));
        const agentYesterdaySummary = rawYesterday
          ? {
              topicCount: rawYesterday.topic_count ?? 0,
              messageCount: rawYesterday.message_count,
              lastMessagePreview: rawYesterday.last_message_content,
            }
          : undefined;

        return {
          ...node,
          type: isCeo ? ("ceo" as const) : ("agent" as const),
          data: {
            ...d,
            agentId: agent.id,
            sessionId,
            agent,
            name: agent.name,
            role,
            desc: agent.description || "",
            avatar,
            stats: stats
              ? {
                  messageCount: stats.message_count,
                  topicCount: stats.topic_count,
                  inputTokens: stats.input_tokens,
                  outputTokens: stats.output_tokens,
                }
              : undefined,
            dailyActivity: agentDailyActivity,
            yesterdaySummary: agentYesterdaySummary,
            lastConversationTime,
            isMarketplacePublished,
            isCeo,
            subordinateAvatars: isCeo
              ? agents
                  .filter(
                    (a) =>
                      a.id !== rootAgentId &&
                      (!a.parent_id || a.parent_id === rootAgentId),
                  )
                  .map(
                    (a) =>
                      a.avatar ||
                      "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
                  )
              : d.subordinateAvatars,
          },
        } as AgentFlowNode;
      });

      return changed > 0 ? next : prev;
    });
  }, [
    agents,
    rootAgentId,
    agentStats,
    sessionIdByAgentId,
    dailyActivity,
    yesterdaySummary,
    lastConversationTimeByAgent,
    publishedAgentIds,
    nodes.length,
    setNodes,
  ]);

  // Initialize viewport once
  useEffect(() => {
    if (initStateRef.current !== "pending") return;
    if (agents.length === 0) return;

    initStateRef.current = "measuring";

    const initViewport = () => {
      const savedFocusId = focusedAgentId;
      const hasVisitedBefore =
        localStorage.getItem(STORAGE_KEY_VIEWPORT) !== null;

      let targetFocusId: string | null = null;
      if (savedFocusId && agents.some((a) => a.id === savedFocusId)) {
        targetFocusId = savedFocusId;
      } else if (savedFocusId) {
        try {
          localStorage.removeItem(STORAGE_KEY_FOCUSED_AGENT);
        } catch {
          /* ignore */
        }
        setFocusedAgentId(null);
      }

      if (!targetFocusId && !hasVisitedBefore) {
        const defaultAgent = agents.find((a) =>
          a.tags?.includes("default_chat"),
        );
        if (defaultAgent) {
          targetFocusId = defaultAgent.id;
          setFocusedAgentId(defaultAgent.id);
          try {
            localStorage.setItem(STORAGE_KEY_FOCUSED_AGENT, defaultAgent.id);
          } catch {
            /* ignore */
          }
        }
      }

      setTimeout(() => {
        if (targetFocusId) {
          const node = getNode(targetFocusId);
          if (node) {
            try {
              const savedViewport = localStorage.getItem(STORAGE_KEY_VIEWPORT);
              setPrevViewport(
                savedViewport ? JSON.parse(savedViewport) : DEFAULT_VIEWPORT,
              );
            } catch {
              setPrevViewport(DEFAULT_VIEWPORT);
            }
            const rect = containerRef.current?.getBoundingClientRect();
            const containerW = rect?.width ?? window.innerWidth;
            const containerH = rect?.height ?? window.innerHeight;
            const leftPadding = Math.max(20, Math.min(56, containerW * 0.06));
            const topPadding = Math.max(20, Math.min(64, containerH * 0.05));
            const x = -node.position.x * FOCUS_ZOOM + leftPadding;
            const y = -node.position.y * FOCUS_ZOOM + topPadding;
            setViewport({ x, y, zoom: FOCUS_ZOOM }, { duration: 600 });
          }
        } else {
          try {
            const savedViewport = localStorage.getItem(STORAGE_KEY_VIEWPORT);
            if (savedViewport) {
              setViewport(JSON.parse(savedViewport), { duration: 0 });
              initStateRef.current = "done";
              return;
            }
          } catch {
            /* ignore */
          }
          fitView({ padding: 0.22, duration: 0, maxZoom: 1 });
        }
        initStateRef.current = "done";
      }, 100);
    };

    let attempts = 0;
    const waitForMeasurement = () => {
      attempts++;
      const allMeasured = agents.every((a) => {
        const node = getNode(a.id);
        return (node?.measured?.width ?? 0) > 0;
      });
      if (allMeasured || attempts >= 10) {
        initViewport();
      } else {
        requestAnimationFrame(waitForMeasurement);
      }
    };
    requestAnimationFrame(waitForMeasurement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  // Focus handlers
  const handleFocus = useCallback(
    (id: string) => {
      initStateRef.current = "done";

      if (!prevViewportRef.current) {
        setPrevViewport(getViewport());
      }
      setFocusedAgentId(id);
      startViewportAnimation(900);

      try {
        localStorage.setItem(STORAGE_KEY_FOCUSED_AGENT, id);
      } catch {
        /* ignore */
      }

      // Compute target viewport position NOW (before any layout changes)
      const node = getNode(id);
      if (!node) return;

      const rect = containerRef.current?.getBoundingClientRect();
      const containerW = rect?.width ?? window.innerWidth;
      const containerH = rect?.height ?? window.innerHeight;
      const leftPadding = Math.max(20, Math.min(56, containerW * 0.06));
      const topPadding = Math.max(20, Math.min(64, containerH * 0.05));
      const x = -node.position.x * FOCUS_ZOOM + leftPadding;
      const y = -node.position.y * FOCUS_ZOOM + topPadding;

      // Defer the viewport animation to the next frame so React commits
      // isFocused / deferChat state BEFORE the d3-zoom DOM mutation starts.
      // Without this, setViewport moves the canvas immediately while React
      // hasn't committed yet, causing a 1-frame flash.
      requestAnimationFrame(() => {
        setViewport({ x, y, zoom: FOCUS_ZOOM }, { duration: 900 });
      });
    },
    [getNode, getViewport, setViewport, startViewportAnimation],
  );

  const handleCloseFocus = useCallback(() => {
    setFocusedAgentId(null);

    try {
      localStorage.removeItem(STORAGE_KEY_FOCUSED_AGENT);
    } catch {
      /* ignore */
    }

    const savedPrevViewport = prevViewportRef.current;
    if (savedPrevViewport) {
      setViewport(savedPrevViewport, { duration: 900 });
      setPrevViewport(null);
    } else {
      fitView({ padding: 0.22, duration: 900, maxZoom: 1 });
    }

    setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY_VIEWPORT,
          JSON.stringify(getViewport()),
        );
      } catch {
        /* ignore */
      }
    }, 1000);
  }, [setViewport, getViewport, fitView]);

  // Consume pending focus requests (e.g. from notification clicks)
  useEffect(() => {
    let prev: string | null = null;
    return useXyzen.subscribe((state) => {
      const agentId = state.pendingFocusAgentId;
      if (agentId && agentId !== prev) {
        prev = agentId;
        // Defer to avoid dispatching inside subscribe listener
        queueMicrotask(() => {
          useXyzen.getState().requestFocusAgent(null);
          handleFocus(agentId);
        });
      } else if (!agentId) {
        prev = null;
      }
    });
  }, [handleFocus]);

  // Wrap delete handler to clear focus when deleting the focused agent,
  // so viewport is restored and FitViewButton becomes accessible
  const handleDeleteAgent = useCallback(
    async (agentId: string) => {
      if (focusedAgentIdRef.current === agentId) {
        handleCloseFocus();
      }
      return handleDeleteAgentBase(agentId);
    },
    [handleDeleteAgentBase, handleCloseFocus],
  );

  // Agent edit/delete handlers for FocusedView (with confirmation modal)
  const handleEditAgentFromFocus = useCallback(
    (agentId: string) => {
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        setEditingAgent(agent);
        setEditModalOpen(true);
      }
    },
    [agents],
  );

  const handleDeleteAgentFromFocus = useCallback(
    (agentId: string) => {
      // Cannot delete root agent
      if (rootAgentId === agentId) return;
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        setAgentToDelete(agent);
        setConfirmModalOpen(true);
      }
    },
    [agents, rootAgentId],
  );

  // Viewport change handler
  const handleViewportChange = useCallback((_: unknown, viewport: Viewport) => {
    if (focusedAgentIdRef.current) return;

    if (viewportSaveTimerRef.current) {
      clearTimeout(viewportSaveTimerRef.current);
    }

    viewportSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_VIEWPORT, JSON.stringify(viewport));
      } catch {
        /* ignore */
      }
    }, 1000);
  }, []);

  // Node types
  const nodeTypes = useMemo(
    () => ({ agent: AgentNode, ceo: RootAgentNode, group: GroupNode }),
    [],
  );

  // Nodes with handlers — identity-preserving to prevent ReactFlow from
  // re-rendering AgentNode components whose data hasn't actually changed.
  // When e.g. focusedAgentId changes, only the 2 affected nodes (old + new
  // focus) get a new data object; all others reuse their cached reference.
  const nodesWithHandler = useMemo(() => {
    const cache = nodesHandlerCacheRef.current;
    const nextCache = new Map<
      string,
      {
        srcData: unknown;
        isFocused: boolean;
        isNewlyCreated: boolean;
        isRunning: boolean;
        resultData: AgentFlowNode["data"];
      }
    >();

    const result = nodes.map((n) => {
      if (n.type === "group") {
        return {
          ...n,
          data: {
            ...n.data,
            onToggleExpand: handleToggleExpand,
            onFocus: handleFocus,
          },
        };
      }

      const isFocused = n.id === focusedAgentId;
      const isNewlyCreated = n.id === newlyCreatedAgentId;
      const isRunning = activeAgentIds.has(n.data.agentId);

      // Reuse cached data when source data ref and derived state are unchanged.
      // srcData === n.data means setNodes hasn't replaced this node's data.
      const cached = cache.get(n.id);
      if (
        cached &&
        !n.data.isCeo && // CEO has extra dynamic dep (autoExploreLoading)
        cached.srcData === n.data &&
        cached.isFocused === isFocused &&
        cached.isNewlyCreated === isNewlyCreated &&
        cached.isRunning === isRunning
      ) {
        nextCache.set(n.id, cached);
        return { ...n, data: cached.resultData };
      }

      const resultData = {
        ...n.data,
        onFocus: handleFocus,
        onLayoutChange: handleLayoutChange,
        onAvatarChange: handleAvatarChange,
        onDelete: n.data.isCeo ? undefined : handleDeleteAgent,
        onAutoExploreToggle: n.data.isCeo ? handleAutoExploreToggle : undefined,
        autoExploreLoading: n.data.isCeo ? autoExploreLoading : undefined,
        isFocused,
        isNewlyCreated,
        isRunning,
      };

      nextCache.set(n.id, {
        srcData: n.data,
        isFocused,
        isNewlyCreated,
        isRunning,
        resultData,
      });
      return { ...n, data: resultData };
    });

    nodesHandlerCacheRef.current = nextCache;
    return result;
  }, [
    nodes,
    handleFocus,
    handleToggleExpand,
    handleLayoutChange,
    handleAvatarChange,
    handleDeleteAgent,
    handleAutoExploreToggle,
    autoExploreLoading,
    focusedAgentId,
    newlyCreatedAgentId,
    activeAgentIds,
  ]);

  // Focused agent — derived from nodesWithHandler to benefit from identity preservation
  const focusedAgent = useMemo(() => {
    if (!focusedAgentId) return null;
    return nodesWithHandler.find((n) => n.id === focusedAgentId)?.data ?? null;
  }, [focusedAgentId, nodesWithHandler]);

  // Stable agents list for FocusedView
  const focusedViewAgents = useMemo(
    () => nodesWithHandler.map((n) => ({ id: n.id, ...n.data })),
    [nodesWithHandler],
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#f2ede4] dark:bg-neutral-950 relative"
    >
      <ReactFlow
        nodes={nodesWithHandler}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onMoveEnd={handleViewportChange}
        nodeTypes={nodeTypes}
        defaultViewport={DEFAULT_VIEWPORT}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={4}
        panOnDrag
        zoomOnScroll
        className="isolate"
      >
        <Background gap={40} size={1} color="#ccc" />
      </ReactFlow>

      <SaveStatusIndicator status={saveStatus} onRetry={handleRetrySave} />

      <AnimatePresence>
        {agents.length <= 2 &&
          showOfficialRecommendations &&
          !focusedAgentId && (
            <OfficialAgentsOverlay
              onNavigateToMarketplace={() => {
                setActivePanel("marketplace");
              }}
            />
          )}
      </AnimatePresence>

      <div
        className="absolute right-6 z-10 flex items-center gap-2"
        style={{ bottom: DOCK_SAFE_AREA }}
      >
        {!focusedAgentId && (
          <FitViewButton
            onClick={() => {
              fitView({ padding: 0.22, duration: 500, maxZoom: 1 });
              setTimeout(() => {
                try {
                  localStorage.setItem(
                    STORAGE_KEY_VIEWPORT,
                    JSON.stringify(getViewport()),
                  );
                } catch {
                  /* ignore */
                }
              }, 600);
            }}
            disabled={nodes.length === 0}
          />
        )}
        <AddAgentButton onClick={() => setAddModalOpen(true)} />
      </div>

      <AnimatePresence>
        {focusedAgent && (
          <FocusedView
            agent={focusedAgent as unknown as AgentData}
            agents={focusedViewAgents}
            onClose={handleCloseFocus}
            onSwitchAgent={(id) => handleFocus(id)}
            onCanvasClick={handleCloseFocus}
            onEditAgent={handleEditAgentFromFocus}
            onDeleteAgent={handleDeleteAgentFromFocus}
            deferChat={viewportAnimating}
          />
        )}
      </AnimatePresence>

      <AddAgentModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
      />

      {/* Edit Agent Modal */}
      {editingAgent && (
        <AgentSettingsModal
          key={editingAgent.id}
          isOpen={isEditModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditingAgent(null);
          }}
          sessionId=""
          agentId={editingAgent.id}
          agentName={editingAgent.name}
          agent={editingAgent}
          currentAvatar={editingAgent.avatar ?? undefined}
          onAvatarChange={(avatarUrl) => {
            setEditingAgent({ ...editingAgent, avatar: avatarUrl });
            updateAgentAvatar(editingAgent.id, avatarUrl);
          }}
          onGridSizeChange={() => {}}
          onDelete={
            editingAgent.id === rootAgentId ||
            publishedAgentIds.has(editingAgent.id)
              ? undefined
              : () => {
                  if (focusedAgentId === editingAgent.id) {
                    handleCloseFocus();
                  }
                  deleteAgent(editingAgent.id);
                  setEditModalOpen(false);
                  setEditingAgent(null);
                }
          }
        />
      )}

      {/* Delete Confirmation Modal */}
      {agentToDelete && (
        <ConfirmationModal
          isOpen={isConfirmModalOpen}
          onClose={() => {
            setConfirmModalOpen(false);
            setAgentToDelete(null);
          }}
          onConfirm={() => {
            if (publishedAgentIds.has(agentToDelete.id)) return;
            // If deleting the currently focused agent, close focus first
            // to restore viewport and clear stale focusedAgentId
            if (focusedAgentId === agentToDelete.id) {
              handleCloseFocus();
            }
            deleteAgent(agentToDelete.id);
            setConfirmModalOpen(false);
            setAgentToDelete(null);
          }}
          title={
            publishedAgentIds.has(agentToDelete.id)
              ? t("agents.deleteBlockedTitle")
              : t("agents.deleteTitle")
          }
          message={
            publishedAgentIds.has(agentToDelete.id)
              ? t("agents.deleteBlockedMessage")
              : t("agents.deleteConfirm", { name: agentToDelete.name })
          }
          confirmLabel={
            publishedAgentIds.has(agentToDelete.id)
              ? t("common.ok")
              : t("agents.deleteAgent")
          }
          cancelLabel={t("common.cancel")}
          destructive={!publishedAgentIds.has(agentToDelete.id)}
        />
      )}
    </div>
  );
}

export function SpatialWorkspace() {
  return (
    <ReactFlowProvider>
      <InnerWorkspace />
    </ReactFlowProvider>
  );
}
