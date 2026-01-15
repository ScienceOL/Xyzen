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

// LocalStorage keys for persistence
const STORAGE_KEY_FOCUSED_AGENT = "xyzen_spatial_focused_agent";
const STORAGE_KEY_VIEWPORT = "xyzen_spatial_viewport";

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
import { FitViewButton } from "./spatial/FitViewButton";
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

// Constants for node sizing
const NODE_SIZES = {
  small: { w: 200, h: 160 },
  medium: { w: 300, h: 220 },
  large: { w: 400, h: 320 },
} as const;

const OVERLAP_PADDING = 24;
const MAX_OVERLAP_ITERATIONS = 50; // Increased for multi-node chain resolution

/**
 * Calculate node size from gridSize or size property
 */
const calculateNodeSize = (
  gridSize?: { w: number; h: number },
  size?: "small" | "medium" | "large",
): { w: number; h: number } => {
  if (gridSize) {
    const { w, h } = gridSize;
    return {
      w: w * 200 + (w - 1) * 16,
      h: h * 160 + (h - 1) * 16,
    };
  }
  return NODE_SIZES[size || "medium"];
};

/**
 * Check if two rectangles overlap (with padding)
 */
const checkOverlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  padding: number,
): { overlapX: number; overlapY: number } | null => {
  const ax1 = a.x - padding;
  const ay1 = a.y - padding;
  const ax2 = a.x + a.w + padding;
  const ay2 = a.y + a.h + padding;

  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;

  const overlapX = Math.min(ax2, bx2) - Math.max(ax1, bx1);
  const overlapY = Math.min(ay2, by2) - Math.max(ay1, by1);

  if (overlapX > 0 && overlapY > 0) {
    return { overlapX, overlapY };
  }
  return null;
};

/**
 * Resolve all overlaps in the node array using iterative relaxation.
 * Returns a map of node IDs to their new positions (only changed nodes).
 */
const resolveAllOverlaps = (
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    size: { w: number; h: number };
  }>,
  fixedNodeId?: string, // Node that should not move (e.g., just resized)
): Map<string, { x: number; y: number }> => {
  const positions = new Map(nodes.map((n) => [n.id, { ...n.position }]));
  const sizes = new Map(nodes.map((n) => [n.id, n.size]));
  const changedNodes = new Set<string>();

  for (let iter = 0; iter < MAX_OVERLAP_ITERATIONS; iter++) {
    let hasOverlap = false;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        const posA = positions.get(nodeA.id)!;
        const posB = positions.get(nodeB.id)!;
        const sizeA = sizes.get(nodeA.id)!;
        const sizeB = sizes.get(nodeB.id)!;

        const overlap = checkOverlap(
          { ...posA, ...sizeA },
          { ...posB, ...sizeB },
          OVERLAP_PADDING,
        );

        if (overlap) {
          hasOverlap = true;

          // Determine which node(s) to move
          const aFixed = nodeA.id === fixedNodeId;
          const bFixed = nodeB.id === fixedNodeId;

          // Calculate push direction and amount
          const aCenterX = posA.x + sizeA.w / 2;
          const bCenterX = posB.x + sizeB.w / 2;
          const aCenterY = posA.y + sizeA.h / 2;
          const bCenterY = posB.y + sizeB.h / 2;

          // Push along the axis with smaller overlap (more natural movement)
          const pushX = overlap.overlapX <= overlap.overlapY;
          const pushAmount = pushX ? overlap.overlapX : overlap.overlapY;

          if (aFixed && !bFixed) {
            // Only move B
            if (pushX) {
              posB.x += (bCenterX > aCenterX ? 1 : -1) * pushAmount;
            } else {
              posB.y += (bCenterY > aCenterY ? 1 : -1) * pushAmount;
            }
            changedNodes.add(nodeB.id);
          } else if (bFixed && !aFixed) {
            // Only move A
            if (pushX) {
              posA.x += (aCenterX > bCenterX ? 1 : -1) * pushAmount;
            } else {
              posA.y += (aCenterY > bCenterY ? 1 : -1) * pushAmount;
            }
            changedNodes.add(nodeA.id);
          } else {
            // Move both nodes equally (split the push)
            const halfPush = pushAmount / 2;
            if (pushX) {
              const dirA = aCenterX < bCenterX ? -1 : 1;
              posA.x += dirA * halfPush;
              posB.x -= dirA * halfPush;
            } else {
              const dirA = aCenterY < bCenterY ? -1 : 1;
              posA.y += dirA * halfPush;
              posB.y -= dirA * halfPush;
            }
            changedNodes.add(nodeA.id);
            changedNodes.add(nodeB.id);
          }
        }
      }
    }

    if (!hasOverlap) break;
  }

  // Return only changed positions
  const result = new Map<string, { x: number; y: number }>();
  for (const id of changedNodes) {
    result.set(id, positions.get(id)!);
  }
  return result;
};

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
    updateAgentLayout,
    updateAgentAvatar,
    deleteAgent,
    agentStats,
    sessionIdByAgentId,
    dailyActivity,
    yesterdaySummary,
  } = useXyzen();

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
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [prevViewport, setPrevViewport] = useState<{
    x: number;
    y: number;
    zoom: number;
  } | null>(null);
  const { setViewport, getViewport, getNode, fitView } = useReactFlow();

  // Single ref to track initialization state
  const initStateRef = useRef<"pending" | "measuring" | "done">("pending");

  // Debounce save timers
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSavesRef = useRef<Map<string, AgentSpatialLayout>>(new Map());
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Note: fetchAgents is called in App.tsx during initial load
  // No need to fetch again here - agents are already in the store

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

      // Debounce: save after 2000ms of no changes
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
      }, 2000);
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
    if (agents.length === 0) return;

    const flowNodes = agents.map((agent) => {
      const stats = agentStats[agent.id];
      const sessionId = sessionIdByAgentId[agent.id];
      const agentDailyActivity = dailyActivity[agent.id]?.daily_counts?.map(
        (d) => ({
          date: d.date,
          count: d.message_count,
        }),
      );
      const agentYesterdaySummary = yesterdaySummary[agent.id]
        ? {
            messageCount: yesterdaySummary[agent.id].message_count,
            lastMessagePreview: yesterdaySummary[agent.id].last_message_content,
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

    // Handle initialization only once when nodes are first set
    if (initStateRef.current !== "pending") return;
    initStateRef.current = "measuring";

    // Wait for ReactFlow to measure nodes, then set viewport
    const initViewport = () => {
      // Determine target: saved focus, new user default, or saved viewport
      const savedFocusId = focusedAgentId;
      const hasVisitedBefore =
        localStorage.getItem(STORAGE_KEY_VIEWPORT) !== null;

      // Validate saved focus still exists
      let targetFocusId: string | null = null;
      if (savedFocusId && agents.some((a) => a.id === savedFocusId)) {
        targetFocusId = savedFocusId;
      } else if (savedFocusId) {
        // Clear invalid saved focus
        try {
          localStorage.removeItem(STORAGE_KEY_FOCUSED_AGENT);
        } catch {
          /* ignore */
        }
        setFocusedAgentId(null);
      }

      // For new users, auto-focus default agent
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

      // Apply viewport after a short delay to ensure DOM is ready
      setTimeout(() => {
        if (targetFocusId) {
          // Animate to focused agent
          const node = getNode(targetFocusId);
          if (node) {
            // When restoring focus from localStorage, use saved viewport as prevViewport
            // This ensures closing focus returns to the correct position
            if (!prevViewport) {
              try {
                const savedViewport =
                  localStorage.getItem(STORAGE_KEY_VIEWPORT);
                if (savedViewport) {
                  const vp = JSON.parse(savedViewport) as Viewport;
                  setPrevViewport(vp);
                } else {
                  // Fallback: calculate a reasonable viewport that shows all nodes
                  setPrevViewport({ x: 0, y: 0, zoom: 0.85 });
                }
              } catch {
                setPrevViewport({ x: 0, y: 0, zoom: 0.85 });
              }
            }
            const targetZoom = 1.05;
            const rect = containerRef.current?.getBoundingClientRect();
            const containerW = rect?.width ?? window.innerWidth;
            const containerH = rect?.height ?? window.innerHeight;
            const leftPadding = Math.max(20, Math.min(56, containerW * 0.06));
            const topPadding = Math.max(20, Math.min(64, containerH * 0.05));
            const x = -node.position.x * targetZoom + leftPadding;
            const y = -node.position.y * targetZoom + topPadding;
            setViewport({ x, y, zoom: targetZoom }, { duration: 600 });
          }
        } else {
          // Restore saved viewport or fit to view
          try {
            const savedViewport = localStorage.getItem(STORAGE_KEY_VIEWPORT);
            if (savedViewport) {
              const vp = JSON.parse(savedViewport) as Viewport;
              setViewport(vp, { duration: 0 });
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

    // Use requestAnimationFrame to wait for measurement
    let attempts = 0;
    const maxAttempts = 10;
    const waitForMeasurement = () => {
      attempts++;
      const allMeasured = flowNodes.every((n) => {
        const node = getNode(n.id);
        return (node?.measured?.width ?? 0) > 0;
      });
      if (allMeasured || attempts >= maxAttempts) {
        initViewport();
      } else {
        requestAnimationFrame(waitForMeasurement);
      }
    };
    requestAnimationFrame(waitForMeasurement);
  }, [
    agents,
    agentStats,
    sessionIdByAgentId,
    dailyActivity,
    yesterdaySummary,
    setNodes,
    focusedAgentId,
    getNode,
    getViewport,
    prevViewport,
    setViewport,
    fitView,
  ]);

  const handleFocus = useCallback(
    (id: string) => {
      // Mark initialization as done to prevent any pending viewport changes
      initStateRef.current = "done";

      if (!prevViewport) {
        setPrevViewport(getViewport());
      }
      setFocusedAgentId(id);

      // Persist focused agent to localStorage
      try {
        localStorage.setItem(STORAGE_KEY_FOCUSED_AGENT, id);
      } catch {
        // Ignore storage errors
      }

      const node = getNode(id);
      if (!node) return;

      // Focus layout: keep a consistent left padding and top padding regardless of node size.
      // Use moderate zoom to make the card appear appropriately sized in the corner
      const targetZoom = 1.05;
      const rect = containerRef.current?.getBoundingClientRect();
      const containerW = rect?.width ?? window.innerWidth;
      const containerH = rect?.height ?? window.innerHeight;

      // Fixed left padding (responsive but clamped)
      const leftPadding = Math.max(20, Math.min(56, containerW * 0.06));
      const screenX = leftPadding;

      // Fixed top padding: consistent distance from top regardless of node size
      const topPadding = Math.max(20, Math.min(64, containerH * 0.05));
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

    // Clear focused agent from localStorage
    try {
      localStorage.removeItem(STORAGE_KEY_FOCUSED_AGENT);
    } catch {
      // Ignore storage errors
    }

    if (prevViewport) {
      // Restore to saved previous viewport
      setViewport(prevViewport, { duration: 900 });
      setPrevViewport(null);
    } else {
      // No saved viewport - fit to show all nodes
      fitView({ padding: 0.22, duration: 900 });
    }

    // Save viewport to localStorage after closing focus
    setTimeout(() => {
      try {
        const vp = getViewport();
        localStorage.setItem(STORAGE_KEY_VIEWPORT, JSON.stringify(vp));
      } catch {
        // Ignore storage errors
      }
    }, 1000); // Wait for animation to complete
  }, [prevViewport, setViewport, getViewport, fitView]);

  // Handle layout changes from AgentNode (e.g., resize) with anti-overlap
  const handleLayoutChange = useCallback(
    (id: string, layout: AgentSpatialLayout) => {
      // Get current node sizes for overlap resolution
      const getNodeSize = (nodeId: string, newLayout?: AgentSpatialLayout) => {
        if (newLayout && nodeId === id) {
          return calculateNodeSize(newLayout.gridSize, newLayout.size);
        }
        const node = getNode(nodeId);
        const measuredW = node?.measured?.width;
        const measuredH = node?.measured?.height;
        if (measuredW && measuredH) return { w: measuredW, h: measuredH };

        const d = node?.data as FlowAgentNodeData | undefined;
        return calculateNodeSize(d?.gridSize, d?.size);
      };

      setNodes((prev) => {
        // Build node array for overlap resolution
        const nodeRects = prev.map((n) => ({
          id: n.id,
          position: { ...n.position },
          size: getNodeSize(n.id, n.id === id ? layout : undefined),
        }));

        // Resolve all overlaps, keeping the resized node fixed
        const changes = resolveAllOverlaps(nodeRects, id);

        if (changes.size === 0) return prev;

        // Apply changes efficiently - only copy nodes that changed
        const next = prev.map((n) => {
          const newPos = changes.get(n.id);
          if (!newPos) return n;

          const updatedNode = {
            ...n,
            position: newPos,
            data: {
              ...(n.data as FlowAgentNodeData),
              position: newPos,
            },
          };

          // Schedule save for moved nodes
          scheduleSave(n.id, {
            position: newPos,
            gridSize: (n.data as FlowAgentNodeData).gridSize,
            size: (n.data as FlowAgentNodeData).size,
          });

          return updatedNode;
        });

        return next;
      });

      // Always save the resized node's layout
      scheduleSave(id, layout);
    },
    [getNode, setNodes, scheduleSave],
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

  // Handle deleting an agent
  const handleDeleteAgent = useCallback(
    async (agentId: string) => {
      try {
        await deleteAgent(agentId);
        // Remove from local nodes state immediately
        setNodes((prev) => prev.filter((n) => n.id !== agentId));
      } catch (error) {
        console.error("Failed to delete agent:", error);
      }
    },
    [deleteAgent, setNodes],
  );

  // Save viewport to localStorage with debounce when user pans/zooms
  const handleViewportChange = useCallback(
    (_: unknown, viewport: Viewport) => {
      // Don't save while focused on an agent (we save after closing focus)
      if (focusedAgentId) return;

      // Clear existing timer
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
      }

      // Debounce: save after 1000ms of no changes
      viewportSaveTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY_VIEWPORT, JSON.stringify(viewport));
        } catch {
          // Ignore storage errors
        }
      }, 1000);
    },
    [focusedAgentId],
  );

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
        onDelete: handleDeleteAgent,
        isFocused: n.id === focusedAgentId,
      },
    }));
  }, [
    nodes,
    handleFocus,
    handleLayoutChange,
    handleAvatarChange,
    handleOpenAgentSettings,
    handleDeleteAgent,
    focusedAgentId,
  ]);

  const handleNodeDragStop = useCallback(
    (_: unknown, draggedNode: AgentFlowNode) => {
      // Get node size helper
      const getNodeSize = (nodeId: string) => {
        const node = getNode(nodeId);
        const measuredW = node?.measured?.width;
        const measuredH = node?.measured?.height;
        if (measuredW && measuredH) return { w: measuredW, h: measuredH };

        const d = node?.data as FlowAgentNodeData | undefined;
        return calculateNodeSize(d?.gridSize, d?.size);
      };

      setNodes((prev) => {
        // Only the dragged node should move to resolve overlaps
        // All other nodes are treated as fixed obstacles
        const draggedSize = getNodeSize(draggedNode.id);
        const finalPos = { ...draggedNode.position };

        // Get all other nodes as obstacles
        const obstacles = prev
          .filter((n) => n.id !== draggedNode.id)
          .map((n) => ({
            id: n.id,
            position: { ...n.position },
            size: getNodeSize(n.id),
          }));

        // Iteratively push the dragged node away from overlaps
        for (let iter = 0; iter < MAX_OVERLAP_ITERATIONS; iter++) {
          let hasOverlap = false;

          for (const obstacle of obstacles) {
            const overlap = checkOverlap(
              { ...finalPos, ...draggedSize },
              { ...obstacle.position, ...obstacle.size },
              OVERLAP_PADDING,
            );

            if (overlap) {
              hasOverlap = true;

              // Calculate push direction (away from obstacle center)
              const draggedCenterX = finalPos.x + draggedSize.w / 2;
              const draggedCenterY = finalPos.y + draggedSize.h / 2;
              const obstacleCenterX = obstacle.position.x + obstacle.size.w / 2;
              const obstacleCenterY = obstacle.position.y + obstacle.size.h / 2;

              // Push along the axis with smaller overlap
              if (overlap.overlapX <= overlap.overlapY) {
                finalPos.x +=
                  (draggedCenterX > obstacleCenterX ? 1 : -1) *
                  overlap.overlapX;
              } else {
                finalPos.y +=
                  (draggedCenterY > obstacleCenterY ? 1 : -1) *
                  overlap.overlapY;
              }
            }
          }

          if (!hasOverlap) break;
        }

        // Update only the dragged node
        const next = prev.map((n) => {
          if (n.id !== draggedNode.id) return n;

          return {
            ...n,
            position: finalPos,
            data: {
              ...(n.data as FlowAgentNodeData),
              position: finalPos,
            },
          };
        });

        // Schedule save for the dragged node only
        const draggedData = draggedNode.data as FlowAgentNodeData;
        scheduleSave(draggedNode.id, {
          position: finalPos,
          gridSize: draggedData.gridSize,
          size: draggedData.size,
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
        onMoveEnd={handleViewportChange}
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

      {/* Bottom right buttons - positioned below focus overlay */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
        {!focusedAgentId && (
          <FitViewButton
            onClick={() => {
              fitView({ padding: 0.22, duration: 500 });
              // Save viewport after animation completes
              setTimeout(() => {
                try {
                  const vp = getViewport();
                  localStorage.setItem(
                    STORAGE_KEY_VIEWPORT,
                    JSON.stringify(vp),
                  );
                } catch {
                  // Ignore storage errors
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
            agent={focusedAgent as unknown as AgentData} // Type cast safety
            agents={nodes.map((n) => ({ id: n.id, ...n.data }))}
            onClose={handleCloseFocus}
            onSwitchAgent={(id) => handleFocus(id)}
            onCanvasClick={handleCloseFocus}
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
