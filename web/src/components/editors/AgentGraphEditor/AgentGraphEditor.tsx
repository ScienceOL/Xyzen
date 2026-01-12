import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  useEffect,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type ReactFlowInstance,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeMouseHandler,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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

import { nodeTypes } from "./nodes";
import NodePanel from "./NodePanel";
import NodeConfigPanel from "./NodeConfigPanel";
import {
  useGraphConfig,
  START_NODE_ID,
  END_NODE_ID,
  type AgentNode,
} from "./useGraphConfig";
import type { GraphConfig, NodeType } from "@/types/graphConfig";

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
}

/**
 * Visual graph editor for designing agent workflows.
 *
 * Features:
 * - Drag-and-drop node creation from palette
 * - Visual edge connections between nodes
 * - Node configuration panel
 * - Mini-map navigation
 * - Zoom and pan controls
 */
export function AgentGraphEditor({
  value,
  onChange,
  height = "500px",
  readOnly = false,
  className = "",
}: AgentGraphEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
    getConfig,
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

  // Sync changes to parent (note: onChange is intentionally not in deps to avoid loops)
  useEffect(() => {
    if (onChange) {
      const config = getConfig();
      onChange(config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

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
      className={`flex gap-3 ${isPercentHeight ? "h-full" : ""} ${className}`}
      style={isPercentHeight ? undefined : { height }}
    >
      {/* Main canvas area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Node palette */}
        {!readOnly && <NodePanel className="mb-3 flex-shrink-0" />}

        {/* React Flow canvas */}
        <div
          ref={reactFlowWrapper}
          className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-50 dark:bg-neutral-900 min-h-0"
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
            onInit={setReactFlowInstance}
            onNodeClick={onNodeClick as NodeMouseHandler<Node>}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
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
              className="!bg-neutral-50 dark:!bg-neutral-900"
            />
            <Controls
              showZoom
              showFitView
              showInteractive={!readOnly}
              className="!bg-white dark:!bg-neutral-800 !border-neutral-200 dark:!border-neutral-700 !shadow-md"
            />
            <MiniMap
              nodeStrokeWidth={3}
              className="!bg-white dark:!bg-neutral-800 !border-neutral-200 dark:!border-neutral-700"
              maskColor="rgba(0, 0, 0, 0.1)"
            />
          </ReactFlow>
        </div>
      </div>

      {/* Config panel (shown when node selected) */}
      {!readOnly && (
        <div
          className={`
            w-72 rounded-lg border border-neutral-200 dark:border-neutral-700
            bg-white dark:bg-neutral-800 overflow-hidden
            transition-all duration-200
            ${selectedNode ? "opacity-100" : "opacity-50"}
          `}
        >
          <NodeConfigPanel
            node={selectedNode?.data.config || null}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNodeId(null)}
            onDelete={handleNodeDelete}
          />
        </div>
      )}
    </div>
  );
}

export default AgentGraphEditor;
