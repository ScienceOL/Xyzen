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

import AddAgentModal from "@/components/modals/AddAgentModal";
import AgentSettingsModal from "@/components/modals/AgentSettingsModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { useMyMarketplaceListings } from "@/hooks/useMarketplace";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

import {
  AddAgentButton,
  AgentNode,
  agentToFlowNode,
  DEFAULT_VIEWPORT,
  FitViewButton,
  FOCUS_ZOOM,
  FocusedView,
  SaveStatusIndicator,
  STORAGE_KEY_FOCUSED_AGENT,
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
    updateAgentLayout,
    updateAgentAvatar,
    deleteAgent,
    agentStats,
    sessionIdByAgentId,
    dailyActivity,
    yesterdaySummary,
    chatHistory,
    channels,
  } = useXyzen();

  // Marketplace hook to track published agents
  const { data: myListings } = useMyMarketplaceListings();
  const publishedAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const listing of myListings ?? []) {
      if (listing.is_published) ids.add(listing.agent_id);
    }
    return ids;
  }, [myListings]);

  // Extract stable agentId mapping from channels
  const channelAgentIds = Object.entries(channels)
    .filter(([, ch]) => ch.agentId)
    .map(([topicId, ch]) => `${topicId}:${ch.agentId}`)
    .sort()
    .join(",");

  const channelAgentIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [topicId, channel] of Object.entries(channels)) {
      if (channel.agentId) {
        map[topicId] = channel.agentId;
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelAgentIds]);

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

  // Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initStateRef = useRef<"pending" | "measuring" | "done">("pending");
  const focusedAgentIdRef = useRef<string | null>(focusedAgentId);
  const prevViewportRef = useRef<Viewport | null>(prevViewport);
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prevAgentIdsRef = useRef<Set<string>>(new Set());

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
    handleDeleteAgent,
  } = useNodeHandlers({
    getNode: getNode as (id: string) => AgentFlowNode | undefined,
    setNodes,
    scheduleSave,
    updateAgentAvatar,
    deleteAgent,
  });

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
      const flowNodes = agents.map((agent) => buildFlowNode(agent));
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

    // Case 2: Agents added - position in viewport center
    if (addedAgentIds.length > 0) {
      const centerPosition = getViewportCenterPosition();
      const newNodes: AgentFlowNode[] = [];

      for (const agentId of addedAgentIds) {
        const agent = agents.find((a) => a.id === agentId);
        if (agent) {
          const node = buildFlowNode(agent, centerPosition);
          newNodes.push(node);

          // Save position
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

  // Update node data when stats change (without recreating nodes)
  useEffect(() => {
    if (nodes.length === 0 || agents.length === 0) return;

    setNodes((prev) =>
      prev.map((node) => {
        const agent = agents.find((a) => a.id === node.id);
        if (!agent) return node;

        const stats = agentStats[agent.id];
        const sessionId = sessionIdByAgentId[agent.id];
        const agentDailyActivity = dailyActivity[agent.id]?.daily_counts?.map(
          (d) => ({ date: d.date, count: d.message_count }),
        );
        const agentYesterdaySummary = yesterdaySummary[agent.id]
          ? {
              messageCount: yesterdaySummary[agent.id].message_count,
              lastMessagePreview:
                yesterdaySummary[agent.id].last_message_content,
            }
          : undefined;
        const lastConversationTime = lastConversationTimeByAgent[agent.id];
        const isMarketplacePublished = publishedAgentIds.has(agent.id);

        // Only update data, preserve position
        return {
          ...node,
          data: {
            ...node.data,
            agentId: agent.id,
            sessionId,
            agent,
            name: agent.name,
            role: (agent.description?.split("\n")[0] || "Agent") as string,
            desc: agent.description || "",
            avatar:
              agent.avatar ||
              "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
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
          },
        };
      }),
    );
  }, [
    agents,
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
          fitView({ padding: 0.22, duration: 0 });
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

      try {
        localStorage.setItem(STORAGE_KEY_FOCUSED_AGENT, id);
      } catch {
        /* ignore */
      }

      const node = getNode(id);
      if (!node) return;

      const rect = containerRef.current?.getBoundingClientRect();
      const containerW = rect?.width ?? window.innerWidth;
      const containerH = rect?.height ?? window.innerHeight;
      const leftPadding = Math.max(20, Math.min(56, containerW * 0.06));
      const topPadding = Math.max(20, Math.min(64, containerH * 0.05));
      const x = -node.position.x * FOCUS_ZOOM + leftPadding;
      const y = -node.position.y * FOCUS_ZOOM + topPadding;

      setViewport({ x, y, zoom: FOCUS_ZOOM }, { duration: 900 });
    },
    [getNode, getViewport, setViewport],
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
      fitView({ padding: 0.22, duration: 900 });
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
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        setAgentToDelete(agent);
        setConfirmModalOpen(true);
      }
    },
    [agents],
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
  const nodeTypes = useMemo(() => ({ agent: AgentNode }), []);

  // Nodes with handlers
  const nodesWithHandler = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        onFocus: handleFocus,
        onLayoutChange: handleLayoutChange,
        onAvatarChange: handleAvatarChange,
        onDelete: handleDeleteAgent,
        isFocused: n.id === focusedAgentId,
        isNewlyCreated: n.id === newlyCreatedAgentId,
      },
    }));
  }, [
    nodes,
    handleFocus,
    handleLayoutChange,
    handleAvatarChange,
    handleDeleteAgent,
    focusedAgentId,
    newlyCreatedAgentId,
  ]);

  // Focused agent
  const focusedAgent = useMemo(() => {
    if (!focusedAgentId) return null;
    return nodes.find((n) => n.id === focusedAgentId)?.data;
  }, [focusedAgentId, nodes]);

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
        className="transition-all duration-700"
      >
        <Background gap={40} size={1} color="#ccc" />
      </ReactFlow>

      <SaveStatusIndicator status={saveStatus} onRetry={handleRetrySave} />

      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
        {!focusedAgentId && (
          <FitViewButton
            onClick={() => {
              fitView({ padding: 0.22, duration: 500 });
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
            agents={nodes.map((n) => ({ id: n.id, ...n.data }))}
            onClose={handleCloseFocus}
            onSwitchAgent={(id) => handleFocus(id)}
            onCanvasClick={handleCloseFocus}
            onEditAgent={handleEditAgentFromFocus}
            onDeleteAgent={handleDeleteAgentFromFocus}
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
            publishedAgentIds.has(editingAgent.id)
              ? undefined
              : () => {
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
            deleteAgent(agentToDelete.id);
            setConfirmModalOpen(false);
            setAgentToDelete(null);
          }}
          title={t("agents.deleteAgent")}
          message={t("agents.deleteConfirmation", { name: agentToDelete.name })}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
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
