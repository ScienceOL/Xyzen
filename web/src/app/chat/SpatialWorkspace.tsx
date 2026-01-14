import {
  Background,
  Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence } from "framer-motion";
import { AgentNode } from "./spatial/AgentNode";
import { FocusedView } from "./spatial/FocusedView";
import type { AgentData, FlowAgentNodeData } from "./spatial/types";

type AgentFlowNode = Node<FlowAgentNodeData, "agent">;

// --- Mock Data ---
const INITIAL_AGENTS: AgentData[] = [
  {
    name: "Market Analyst Pro",
    role: "Market Analyst",
    desc: "Expert in trend forecasting",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Market",
    status: "busy",
    size: "large",
  },
  {
    name: "Creative Writer",
    role: "Copywriter",
    desc: "Marketing copy & storytelling",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Creative",
    status: "idle",
    size: "medium",
  },
  {
    name: "Global Search",
    role: "Researcher",
    desc: "Real-time info retrieval",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Search",
    status: "idle",
    size: "small",
  },
  {
    name: "Code Auditor",
    role: "Security",
    desc: "Python/JS security checks",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Code",
    status: "idle",
    size: "medium",
  },
];

const noopFocus: FlowAgentNodeData["onFocus"] = () => {};

const INITIAL_NODES: AgentFlowNode[] = [
  {
    id: "1",
    type: "agent",
    position: { x: 0, y: 0 },
    data: { ...INITIAL_AGENTS[0], onFocus: noopFocus },
  },
  {
    id: "2",
    type: "agent",
    position: { x: 600, y: -200 },
    data: { ...INITIAL_AGENTS[1], onFocus: noopFocus },
  },
  {
    id: "3",
    type: "agent",
    position: { x: -300, y: 400 },
    data: { ...INITIAL_AGENTS[2], onFocus: noopFocus },
  },
  {
    id: "4",
    type: "agent",
    position: { x: 700, y: 500 },
    data: { ...INITIAL_AGENTS[3], onFocus: noopFocus },
  },
];

function InnerWorkspace() {
  const [nodes, setNodes, onNodesChange] =
    useNodesState<AgentFlowNode>(INITIAL_NODES);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);
  const [prevViewport, setPrevViewport] = useState<{
    x: number;
    y: number;
    zoom: number;
  } | null>(null);
  const { setViewport, getViewport, getNode, fitView } = useReactFlow();
  const didInitialFitViewRef = useRef(false);
  const cancelInitialFitRef = useRef(false);
  const initialFitAttemptsRef = useRef(0);

  useEffect(() => {
    if (didInitialFitViewRef.current) return;
    if (cancelInitialFitRef.current) return;

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

      const nodeW = node.measured?.width ?? 300;
      const nodeH = node.measured?.height ?? 220;
      const centerX = node.position.x + nodeW / 2;
      const centerY = node.position.y + nodeH / 2;

      // Target Top-Left (approx 15% x, 25% y)
      const targetZoom = 1.35;
      const screenX = window.innerWidth * 0.15;
      const screenY = window.innerHeight * 0.25;
      const x = -centerX * targetZoom + screenX;
      const y = -centerY * targetZoom + screenY;

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
      },
    }));
  }, [nodes, handleFocus]);

  const handleNodeDragStop = useCallback(
    (_: unknown, draggedNode: AgentFlowNode) => {
      const padding = 24;

      const getSize = (id: string) => {
        const node = getNode(id);
        const measuredW = node?.measured?.width;
        const measuredH = node?.measured?.height;
        if (measuredW && measuredH) return { w: measuredW, h: measuredH };

        const size = node?.data?.size;
        if (size === "large") return { w: 400, h: 320 };
        if (size === "medium") return { w: 300, h: 220 };
        return { w: 200, h: 160 };
      };

      setNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));
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

        return next;
      });
    },
    [getNode, setNodes],
  );

  const focusedAgent = useMemo(() => {
    if (!focusedAgentId) return null;
    return nodes.find((n) => n.id === focusedAgentId)?.data;
  }, [focusedAgentId, nodes]);

  return (
    <div className="w-full h-full bg-[#f2ede4] dark:bg-neutral-950 relative">
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
