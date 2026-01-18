import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";

// Custom styles for React Flow controls in dark mode
const reactFlowDarkModeStyles = `
  .dark .react-flow__controls-button {
    background: rgb(38, 38, 38);
    border-color: rgb(64, 64, 64);
  }
  .dark .react-flow__controls-button:hover {
    background: rgb(64, 64, 64);
  }
  .dark .react-flow__controls-button svg {
    fill: rgb(212, 212, 212);
  }
  .dark .react-flow__controls-button svg path {
    fill: rgb(212, 212, 212);
  }
  .dark .react-flow__minimap {
    background: rgb(38, 38, 38);
  }
  .dark .react-flow__edge-path {
    stroke: rgb(163, 163, 163);
  }
`;

import type { GraphConfig, NodeType } from "@/types/graphConfig";
import FloatingConfigPanel from "./FloatingConfigPanel";
import NodePanel from "./NodePanel";
import { nodeTypes } from "./nodes";
import {
  END_NODE_ID,
  START_NODE_ID,
  useGraphConfig,
  type AgentNode,
} from "./useGraphConfig";

// LocalStorage key for viewport state
const VIEWPORT_STORAGE_KEY = "xyzen:agent-graph-viewport";

interface SavedViewport {
  [graphId: string]: Viewport;
}

function saveViewport(graphId: string, viewport: Viewport) {
  try {
    const saved = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    const viewports: SavedViewport = saved ? JSON.parse(saved) : {};
    viewports[graphId] = viewport;
    // Keep only last 20 viewports to prevent bloat
    const keys = Object.keys(viewports);
    if (keys.length > 20) {
      delete viewports[keys[0]];
    }
    localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewports));
  } catch {
    // Ignore storage errors
  }
}

function loadViewport(graphId: string): Viewport | null {
  try {
    const saved = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (saved) {
      const viewports: SavedViewport = JSON.parse(saved);
      return viewports[graphId] || null;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

interface AgentGraphEditorProps {
  /** Initial GraphConfig value */
  value: GraphConfig | null;
  /** Called when the graph changes */
  onChange?: (config: GraphConfig) => void;
  /** Editor height */
  height?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Unique ID for viewport persistence (optional) */
  graphId?: string;
}

/**
 * Visual graph editor for designing agent workflows.
 *
 * Features:
 * - Drag-and-drop node creation from palette
 * - Visual edge connections between nodes
 * - Floating node configuration panel
 * - Viewport state persistence in localStorage
 * - Mini-map navigation
 * - Zoom and pan controls
 */
function AgentGraphEditorInner({
  value,
  onChange,
  height = "500px",
  readOnly = false,
  className = "",
  graphId,
}: AgentGraphEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const viewportInitializedRef = useRef(false);

  // Generate a stable graph ID for viewport persistence
  const stableGraphId = useMemo(() => {
    return graphId || (value?.metadata as { id?: string })?.id || "default";
  }, [graphId, value?.metadata]);

  // Inject dark mode styles once
  useEffect(() => {
    const styleId = "react-flow-dark-mode-styles";
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement("style");
      styleElement.id = styleId;
      styleElement.textContent = reactFlowDarkModeStyles;
      document.head.appendChild(styleElement);
    }
  }, []);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNode,
    deleteNode,
  } = useGraphConfig(value, onChange);

  // Get selected node config
  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  // Handle node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: AgentNode) => {
    // Don't select START or END nodes for editing
    if (node.id === START_NODE_ID || node.id === END_NODE_ID) {
      setSelectedNodeId(null);
      return;
    }
    setSelectedNodeId(node.id);
  }, []);

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Handle drag over (for dropping new nodes)
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Handle drop (create new node)
  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const type = event.dataTransfer.getData(
        "application/agentnode",
      ) as NodeType;
      if (!type || !reactFlowInstance || !reactFlowWrapper.current) {
        return;
      }

      // Calculate drop position
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      // Create the new node
      const newNodeId = addNode(type, position);
      setSelectedNodeId(newNodeId);
    },
    [reactFlowInstance, addNode],
  );

  // Save viewport to localStorage when it changes
  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      saveViewport(stableGraphId, viewport);
    },
    [stableGraphId],
  );

  // Restore viewport from localStorage on init
  const handleInit = useCallback(
    (instance: ReactFlowInstance) => {
      setReactFlowInstance(instance);

      // Only restore viewport once
      if (!viewportInitializedRef.current) {
        const savedViewport = loadViewport(stableGraphId);
        if (savedViewport) {
          // Use requestAnimationFrame to ensure the flow is fully rendered
          requestAnimationFrame(() => {
            instance.setViewport(savedViewport);
          });
        }
        viewportInitializedRef.current = true;
      }
    },
    [stableGraphId],
  );

  // Note: Sync to parent is now handled in useGraphConfig hook
  // This prevents infinite loops and centralizes sync logic

  // Handle node update from config panel
  const handleNodeUpdate = useCallback(
    (updates: Parameters<typeof updateNode>[1]) => {
      if (selectedNodeId) {
        updateNode(selectedNodeId, updates);
      }
    },
    [selectedNodeId, updateNode],
  );

  // Handle node delete
  const handleNodeDelete = useCallback(() => {
    if (selectedNodeId) {
      deleteNode(selectedNodeId);
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, deleteNode]);

  // Determine if using percentage height
  const isPercentHeight = height === "100%" || height.endsWith("%");

  return (
    <div
      className={`relative ${isPercentHeight ? "h-full" : ""} ${className}`}
      style={isPercentHeight ? undefined : { height }}
    >
      {/* Toolbar */}
      {!readOnly && (
        <div className="absolute top-3 left-3 z-10">
          <NodePanel />
        </div>
      )}

      {/* React Flow canvas */}
      <div
        ref={reactFlowWrapper}
        className="h-full rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-50 dark:bg-neutral-900"
      >
        <ReactFlow
          nodes={nodes as Node[]}
          edges={edges as Edge[]}
          onNodesChange={
            readOnly ? undefined : (onNodesChange as OnNodesChange<Node>)
          }
          onEdgesChange={
            readOnly ? undefined : (onEdgesChange as OnEdgesChange<Edge>)
          }
          onConnect={readOnly ? undefined : onConnect}
          onInit={handleInit}
          onMoveEnd={handleMoveEnd}
          onNodeClick={onNodeClick as NodeMouseHandler<Node>}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          fitView={!loadViewport(stableGraphId)}
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode={readOnly ? null : "Delete"}
          selectionKeyCode={readOnly ? null : "Shift"}
          multiSelectionKeyCode={readOnly ? null : "Meta"}
          snapToGrid
          snapGrid={[15, 15]}
          defaultEdgeOptions={{
            type: "smoothstep",
            style: { strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            className="bg-neutral-50! dark:bg-neutral-900!"
          />
          <Controls
            showZoom
            showFitView
            showInteractive={!readOnly}
            position="bottom-left"
            className="bg-white! dark:bg-neutral-800! border-neutral-200! dark:border-neutral-700! shadow-sm! rounded-lg!"
          />
          <MiniMap
            nodeStrokeWidth={3}
            position="bottom-right"
            className="bg-white! dark:bg-neutral-800! border-neutral-200! dark:border-neutral-700! rounded-lg! shadow-sm!"
            maskColor="rgba(0, 0, 0, 0.08)"
            style={{ width: 120, height: 80 }}
          />

          {/* Floating config panel */}
          {!readOnly && selectedNode && (
            <FloatingConfigPanel
              node={selectedNode.data.config}
              onUpdate={handleNodeUpdate}
              onClose={() => setSelectedNodeId(null)}
              onDelete={handleNodeDelete}
            />
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

/**
 * AgentGraphEditor wrapped with its own ReactFlowProvider.
 * This ensures the editor has an isolated ReactFlow context,
 * preventing conflicts when used inside another ReactFlow canvas
 * (e.g., SpatialWorkspace).
 */
export function AgentGraphEditor(props: AgentGraphEditorProps) {
  return (
    <ReactFlowProvider>
      <AgentGraphEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export default AgentGraphEditor;
