import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AddAgentModal from "@/components/modals/AddAgentModal";
import EditAgentModal from "@/components/modals/EditAgentModal";
import { useXyzen } from "@/store";
import type {
  AgentSpatialLayout,
  AgentStatsAggregated,
  AgentWithLayout,
} from "@/types/agents";
import { AnimatePresence } from "framer-motion";
import { AddAgentButton } from "./spatial/AddAgentButton";
import { AgentNode } from "./spatial/AgentNode";
import { FocusedView } from "./spatial/FocusedView";
import {
  SaveStatusIndicator,
  type SaveStatus,
} from "./spatial/SaveStatusIndicator";
import type {
  AgentData,
  AgentFlowNode,
  AgentStatsDisplay,
  DailyActivityData,
  FlowAgentNodeData,
  YesterdaySummaryData,
} from "./spatial/types";

/**
 * Convert AgentWithLayout to AgentFlowNode for ReactFlow rendering.
 * Role defaults to first line of description for UI display.
 * stats is derived from agentStats for visualization.
 */
const agentToFlowNode = (
  agent: AgentWithLayout,
  stats?: AgentStatsAggregated,
  sessionId?: string,
  dailyActivity?: DailyActivityData[],
  yesterdaySummary?: YesterdaySummaryData,
): AgentFlowNode => {
  const statsDisplay: AgentStatsDisplay | undefined = stats
    ? {
        messageCount: stats.message_count,
        topicCount: stats.topic_count,
        inputTokens: stats.input_tokens,
        outputTokens: stats.output_tokens,
      }
    : undefined;

  return {
    id: agent.id,
    type: "agent",
    position: agent.spatial_layout.position,
    data: {
      agentId: agent.id,
      sessionId: sessionId,
      name: agent.name,
      role: (agent.description?.split("\n")[0] || "Agent") as string,
      desc: agent.description || "",
      avatar:
        agent.avatar ||
        "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
      status: "idle",
      size: agent.spatial_layout.size || "medium",
      gridSize: agent.spatial_layout.gridSize,
      position: agent.spatial_layout.position,
      stats: statsDisplay,
      dailyActivity,
      yesterdaySummary,
      onFocus: () => {},
    } as FlowAgentNodeData,
  };
};

function InnerWorkspace() {
  const {
    agents,
    fetchAgents,
    updateAgentLayout,
    updateAgentAvatar,
    agentStats,
    sessionIdByAgentId,
    dailyActivity,
    yesterdaySummary,
  } = useXyzen();

  const [nodes, setNodes, onNodesChange] = useNodesState<AgentFlowNode>([]);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [prevViewport, setPrevViewport] = useState<{
    x: number;
    y: number;
    zoom: number;
  } | null>(null);
  const { setViewport, getViewport, getNode, fitView } = useReactFlow();
  const didInitialFitViewRef = useRef(false);
  const cancelInitialFitRef = useRef(false);
  const initialFitAttemptsRef = useRef(0);

  // Debounce save timers
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSavesRef = useRef<Map<string, AgentSpatialLayout>>(new Map());
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch agents on mount
  useEffect(() => {
    fetchAgents().catch((err) => console.error("Failed to fetch agents:", err));
  }, [fetchAgents]);

  // Debounced save function
  const scheduleSave = useCallback(
    (agentId: string, layout: AgentSpatialLayout) => {
      pendingSavesRef.current.set(agentId, layout);

      // Clear existing timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // Set saving status
      setSaveStatus("saving");

      // Debounce: save after 800ms of no changes
      saveTimerRef.current = setTimeout(async () => {
        const saves = Array.from(pendingSavesRef.current.entries());
        pendingSavesRef.current.clear();

        try {
          // Save all pending layouts
          await Promise.all(
            saves.map(([id, layout]) => updateAgentLayout(id, layout)),
          );

          setSaveStatus("saved");

          // Clear saved status after 2 seconds
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (error) {
          console.error("Failed to save layouts:", error);
          setSaveStatus("failed");
        }
      }, 800);
    },
    [updateAgentLayout],
  );

  // Retry failed saves
  const handleRetrySave = useCallback(() => {
    const saves = Array.from(pendingSavesRef.current.entries());
    if (saves.length > 0) {
      setSaveStatus("saving");
      Promise.all(saves.map(([id, layout]) => updateAgentLayout(id, layout)))
        .then(() => {
          pendingSavesRef.current.clear();
          setSaveStatus("saved");
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        })
        .catch(() => setSaveStatus("failed"));
    }
  }, [updateAgentLayout]);

  // Update nodes whenever agents or stats change
  useEffect(() => {
    if (agents.length > 0) {
      const flowNodes = agents.map((agent) => {
        const stats = agentStats[agent.id];
        const sessionId = sessionIdByAgentId[agent.id];
        // Convert daily activity to the format expected by AgentNode
        const agentDailyActivity = dailyActivity[agent.id]?.daily_counts?.map(
          (d) => ({
            date: d.date,
            count: d.message_count,
          }),
        );
        // Convert yesterday summary
        const agentYesterdaySummary = yesterdaySummary[agent.id]
          ? {
              messageCount: yesterdaySummary[agent.id].message_count,
              lastMessagePreview:
                yesterdaySummary[agent.id].last_message_content,
            }
          : undefined;
        return agentToFlowNode(
          agent,
          stats,
          sessionId,
          agentDailyActivity,
          agentYesterdaySummary,
        );
      });
      setNodes(flowNodes);
    }
  }, [
    agents,
    agentStats,
    sessionIdByAgentId,
    dailyActivity,
    yesterdaySummary,
    setNodes,
  ]);

  useEffect(() => {
    if (didInitialFitViewRef.current) return;
    if (cancelInitialFitRef.current) return;
    if (nodes.length === 0) return; // Don't fit empty viewport

    let cancelled = false;
    initialFitAttemptsRef.current = 0;

    const tryFit = () => {
      if (cancelled) return;
      if (didInitialFitViewRef.current) return;
      if (cancelInitialFitRef.current) return;

      initialFitAttemptsRef.current += 1;

      const allMeasured = nodes.every((n) => {
        const node = getNode(n.id);
        const w = node?.measured?.width ?? 0;
        const h = node?.measured?.height ?? 0;
        return w > 0 && h > 0;
      });

      // If measurement never comes through (rare), still do a best-effort fit.
      if (allMeasured || initialFitAttemptsRef.current >= 12) {
        didInitialFitViewRef.current = true;
        fitView({ padding: 0.22, duration: 0 });
        return;
      }

      requestAnimationFrame(tryFit);
    };

    requestAnimationFrame(tryFit);
    return () => {
      cancelled = true;
    };
  }, [fitView, getNode, nodes]);

  const handleFocus = useCallback(
    (id: string) => {
      // Don't allow the initial fit to run after the user has started interacting.
      cancelInitialFitRef.current = true;
      didInitialFitViewRef.current = true;

      if (!prevViewport) {
        setPrevViewport(getViewport());
      }
      setFocusedAgentId(id);

      const node = getNode(id);
      if (!node) return;

      // Focus layout: keep a consistent left padding and top padding regardless of node size.
      const targetZoom = 1.35;
      const rect = containerRef.current?.getBoundingClientRect();
      const containerW = rect?.width ?? window.innerWidth;
      const containerH = rect?.height ?? window.innerHeight;

      // Fixed left padding (responsive but clamped)
      const leftPadding = Math.max(24, Math.min(64, containerW * 0.08));
      const screenX = leftPadding;

      // Fixed top padding: consistent distance from top regardless of node size
      // Use similar logic to leftPadding for responsive but clamped value
      const topPadding = Math.max(24, Math.min(80, containerH * 0.06));
      const screenY = topPadding;

      // Align the node's left edge to screenX and top edge to screenY.
      const x = -node.position.x * targetZoom + screenX;
      const y = -node.position.y * targetZoom + screenY;

      setViewport({ x, y, zoom: targetZoom }, { duration: 900 });
    },
    [getNode, getViewport, prevViewport, setViewport],
  );

  const handleCloseFocus = useCallback(() => {
    setFocusedAgentId(null);
    const restore = prevViewport ?? { x: 0, y: 0, zoom: 0.85 };
    setViewport(restore, { duration: 900 });
    setPrevViewport(null);
  }, [prevViewport, setViewport]);

  // Handle layout changes from AgentNode (e.g., resize)
  const handleLayoutChange = useCallback(
    (id: string, layout: AgentSpatialLayout) => {
      scheduleSave(id, layout);
    },
    [scheduleSave],
  );

  // Handle avatar changes from AgentNode
  const handleAvatarChange = useCallback(
    (id: string, avatarUrl: string) => {
      updateAgentAvatar(id, avatarUrl).catch((err) =>
        console.error("Failed to update avatar:", err),
      );
    },
    [updateAgentAvatar],
  );

  // Handle opening agent settings (EditAgentModal)
  const handleOpenAgentSettings = useCallback((agentId: string) => {
    setEditingAgentId(agentId);
  }, []);

  // Inject handleFocus into node data
  const nodeTypes = useMemo(
    () => ({
      agent: AgentNode,
    }),
    [],
  );

  // Update nodes with the callback
  const nodesWithHandler = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        onFocus: handleFocus,
        onLayoutChange: handleLayoutChange,
        onAvatarChange: handleAvatarChange,
        onOpenAgentSettings: handleOpenAgentSettings,
        isFocused: n.id === focusedAgentId,
      },
    }));
  }, [
    nodes,
    handleFocus,
    handleLayoutChange,
    handleAvatarChange,
    handleOpenAgentSettings,
    focusedAgentId,
  ]);

  const handleNodeDragStop = useCallback(
    (_: unknown, draggedNode: AgentFlowNode) => {
      const padding = 24;

      const getSize = (id: string) => {
        const node = getNode(id);
        const measuredW = node?.measured?.width;
        const measuredH = node?.measured?.height;
        if (measuredW && measuredH) return { w: measuredW, h: measuredH };

        const d = node?.data as FlowAgentNodeData | undefined;
        if (d?.gridSize) {
          const { w, h } = d.gridSize;
          return {
            w: w * 200 + (w - 1) * 16,
            h: h * 160 + (h - 1) * 16,
          };
        }

        const size = d?.size;
        if (size === "large") return { w: 400, h: 320 };
        if (size === "medium") return { w: 300, h: 220 };
        return { w: 200, h: 160 };
      };

      setNodes((prev) => {
        const next = prev.map((n) => ({
          ...n,
          position: { ...n.position },
          data: { ...(n.data as FlowAgentNodeData) },
        }));
        const moving = next.find((n) => n.id === draggedNode.id);
        if (!moving) return prev;

        // Iteratively push the dragged node out of overlaps.
        for (let iter = 0; iter < 24; iter += 1) {
          let movedThisIter = false;

          const aSize = getSize(moving.id);
          const ax1 = moving.position.x;
          const ay1 = moving.position.y;
          const ax2 = ax1 + aSize.w;
          const ay2 = ay1 + aSize.h;

          for (const other of next) {
            if (other.id === moving.id) continue;

            const bSize = getSize(other.id);
            const bx1 = other.position.x;
            const by1 = other.position.y;
            const bx2 = bx1 + bSize.w;
            const by2 = by1 + bSize.h;

            const overlapX =
              Math.min(ax2 + padding, bx2) - Math.max(ax1 - padding, bx1);
            const overlapY =
              Math.min(ay2 + padding, by2) - Math.max(ay1 - padding, by1);

            if (overlapX > 0 && overlapY > 0) {
              // Push along the smallest overlap axis.
              if (overlapX < overlapY) {
                const aCenterX = (ax1 + ax2) / 2;
                const bCenterX = (bx1 + bx2) / 2;
                const dir = aCenterX < bCenterX ? -1 : 1;
                moving.position = {
                  ...moving.position,
                  x: moving.position.x + dir * overlapX,
                };
              } else {
                const aCenterY = (ay1 + ay2) / 2;
                const bCenterY = (by1 + by2) / 2;
                const dir = aCenterY < bCenterY ? -1 : 1;
                moving.position = {
                  ...moving.position,
                  y: moving.position.y + dir * overlapY,
                };
              }

              movedThisIter = true;
              break;
            }
          }

          if (!movedThisIter) break;
        }

        // Keep persistable position in sync for future storage.
        moving.data.position = { ...moving.position };

        // Schedule auto-save for this agent
        const agentData = moving.data as FlowAgentNodeData;
        scheduleSave(moving.id, {
          position: moving.position,
          gridSize: agentData.gridSize,
          size: agentData.size,
        });

        return next;
      });
    },
    [getNode, setNodes, scheduleSave],
  );

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
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={4}
        panOnDrag
        zoomOnScroll
        // panOnScroll
        className="transition-all duration-700"
      >
        <Background gap={40} size={1} color="#ccc" />
      </ReactFlow>

      {/* Save Status Indicator */}
      <SaveStatusIndicator status={saveStatus} onRetry={handleRetrySave} />

      {/* Add Agent Button - positioned at bottom right, below focus overlay */}
      <div className="absolute bottom-4 right-4 z-10">
        <AddAgentButton onClick={() => setAddModalOpen(true)} />
      </div>

      <AnimatePresence>
        {focusedAgent && (
          <FocusedView
            agent={focusedAgent as unknown as AgentData} // Type cast safety
            agents={nodes.map((n) => ({ id: n.id, ...n.data }))}
            onClose={handleCloseFocus}
            onSwitchAgent={(id) => handleFocus(id)}
          />
        )}
      </AnimatePresence>

      {/* Add Agent Modal */}
      <AddAgentModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
      />

      {/* Edit Agent Modal */}
      <EditAgentModal
        isOpen={!!editingAgentId}
        onClose={() => setEditingAgentId(null)}
        agent={
          editingAgentId
            ? (agents.find((a) => a.id === editingAgentId) ?? null)
            : null
        }
      />
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
