import { useCallback, useMemo } from "react";
import {
  type Node,
  type Edge,
  type OnConnect,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
} from "@xyflow/react";
import type {
  GraphConfig,
  GraphNodeConfig,
  GraphEdgeConfig,
  NodeType,
} from "@/types/graphConfig";
import {
  createDefaultLLMNode,
  createDefaultToolNode,
  createDefaultRouterNode,
} from "@/types/graphConfig";

// React Flow node data structure with index signature for compatibility
export interface AgentNodeData {
  label: string;
  nodeType: NodeType;
  config: GraphNodeConfig;
  [key: string]: unknown;
}

// React Flow edge data structure with index signature for compatibility
export interface AgentEdgeData {
  label?: string;
  hasCondition: boolean;
  config: GraphEdgeConfig;
  [key: string]: unknown;
}

export type AgentNode = Node<AgentNodeData, string>;
export type AgentEdge = Edge<AgentEdgeData>;

// Constants for special nodes
const START_NODE_ID = "__START__";
const END_NODE_ID = "__END__";

/**
 * Convert GraphConfig to React Flow nodes and edges
 */
export function graphConfigToFlow(config: GraphConfig | null): {
  nodes: AgentNode[];
  edges: AgentEdge[];
} {
  if (!config || !config.nodes || !config.edges) {
    return { nodes: createDefaultNodes(), edges: [] };
  }

  const nodes: AgentNode[] = [
    // START node (always present)
    {
      id: START_NODE_ID,
      type: "startNode",
      position: { x: 50, y: 200 },
      data: {
        label: "START",
        nodeType: "llm" as NodeType, // placeholder
        config: {} as GraphNodeConfig,
      },
      deletable: false,
    },
    // END node (always present)
    {
      id: END_NODE_ID,
      type: "endNode",
      position: { x: 600, y: 200 },
      data: {
        label: "END",
        nodeType: "llm" as NodeType, // placeholder
        config: {} as GraphNodeConfig,
      },
      deletable: false,
    },
  ];

  // Add user-defined nodes
  let xOffset = 200;
  for (const nodeConfig of config.nodes) {
    const position = nodeConfig.position || { x: xOffset, y: 200 };
    nodes.push({
      id: nodeConfig.id,
      type: "agentNode",
      position,
      data: {
        label: nodeConfig.name,
        nodeType: nodeConfig.type,
        config: nodeConfig,
      },
    });
    xOffset += 180;
  }

  // Convert edges
  const edges: AgentEdge[] = config.edges.map((edgeConfig, index) => ({
    id: `edge-${index}`,
    source:
      edgeConfig.from_node === "START" ? START_NODE_ID : edgeConfig.from_node,
    target: edgeConfig.to_node === "END" ? END_NODE_ID : edgeConfig.to_node,
    type: edgeConfig.condition ? "conditionalEdge" : "default",
    animated: !!edgeConfig.condition,
    label:
      edgeConfig.label ||
      (edgeConfig.condition ? edgeConfig.condition.target : undefined),
    data: {
      label: edgeConfig.label || undefined,
      hasCondition: !!edgeConfig.condition,
      config: edgeConfig,
    },
  }));

  return { nodes, edges };
}

/**
 * Convert React Flow nodes and edges back to GraphConfig
 */
export function flowToGraphConfig(
  nodes: AgentNode[],
  edges: AgentEdge[],
  existingConfig?: GraphConfig | null,
): GraphConfig {
  // Filter out START and END nodes
  const userNodes = nodes.filter(
    (n) => n.id !== START_NODE_ID && n.id !== END_NODE_ID,
  );

  // Convert nodes
  const graphNodes: GraphNodeConfig[] = userNodes.map((node) => ({
    ...node.data.config,
    id: node.id,
    name: node.data.label,
    type: node.data.nodeType,
    position: { x: node.position.x, y: node.position.y },
  }));

  // Convert edges
  const graphEdges: GraphEdgeConfig[] = edges.map((edge) => ({
    from_node: edge.source === START_NODE_ID ? "START" : edge.source,
    to_node: edge.target === END_NODE_ID ? "END" : edge.target,
    condition: edge.data?.config?.condition || null,
    label: edge.data?.label || null,
    priority: edge.data?.config?.priority || 0,
  }));

  // Find entry point (first node connected from START)
  const startEdge = graphEdges.find((e) => e.from_node === "START");
  const entryPoint = startEdge?.to_node || (graphNodes[0]?.id ?? "");

  return {
    version: existingConfig?.version || "1.0",
    state_schema: existingConfig?.state_schema || { fields: {} },
    nodes: graphNodes,
    edges: graphEdges,
    entry_point: entryPoint,
    exit_points: existingConfig?.exit_points || ["END"],
    prompt_templates: existingConfig?.prompt_templates || {},
    metadata: existingConfig?.metadata || {},
    max_execution_time_seconds:
      existingConfig?.max_execution_time_seconds || 300,
    enable_checkpoints: existingConfig?.enable_checkpoints ?? true,
  };
}

/**
 * Create default START and END nodes
 */
function createDefaultNodes(): AgentNode[] {
  return [
    {
      id: START_NODE_ID,
      type: "startNode",
      position: { x: 50, y: 200 },
      data: {
        label: "START",
        nodeType: "llm" as NodeType,
        config: {} as GraphNodeConfig,
      },
      deletable: false,
    },
    {
      id: END_NODE_ID,
      type: "endNode",
      position: { x: 400, y: 200 },
      data: {
        label: "END",
        nodeType: "llm" as NodeType,
        config: {} as GraphNodeConfig,
      },
      deletable: false,
    },
  ];
}

/**
 * Hook to manage graph state and sync with GraphConfig JSON
 */
export function useGraphConfig(
  initialConfig: GraphConfig | null,
  onChange?: (config: GraphConfig) => void,
) {
  // Convert initial config to React Flow format
  const initialFlow = useMemo(
    () => graphConfigToFlow(initialConfig),
    [initialConfig],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNode>(
    initialFlow.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<AgentEdge>(
    initialFlow.edges,
  );

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const newEdge: AgentEdge = {
        ...connection,
        id: `edge-${Date.now()}`,
        type: "default",
        data: {
          hasCondition: false,
          config: {
            from_node:
              connection.source === START_NODE_ID
                ? "START"
                : connection.source!,
            to_node:
              connection.target === END_NODE_ID ? "END" : connection.target!,
            priority: 0,
          },
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges],
  );

  // Notify parent of changes
  const syncToConfig = useCallback(() => {
    if (onChange) {
      const config = flowToGraphConfig(nodes, edges, initialConfig);
      onChange(config);
    }
  }, [nodes, edges, initialConfig, onChange]);

  // Add a new node
  const addNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }) => {
      const id = `node_${Date.now()}`;
      const pos = position || { x: 250, y: 200 };

      let config: GraphNodeConfig;
      switch (type) {
        case "llm":
          config = createDefaultLLMNode(id, "New LLM Node");
          break;
        case "tool":
          config = createDefaultToolNode(id, "New Tool Node");
          break;
        case "router":
          config = createDefaultRouterNode(id, "New Router");
          break;
        default:
          config = {
            id,
            name: `New ${type} Node`,
            type,
          };
      }

      const newNode: AgentNode = {
        id,
        type: "agentNode",
        position: pos,
        data: {
          label: config.name,
          nodeType: type,
          config,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      return id;
    },
    [setNodes],
  );

  // Update a node's configuration
  const updateNode = useCallback(
    (nodeId: string, updates: Partial<GraphNodeConfig>) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                label: updates.name || node.data.label,
                config: { ...node.data.config, ...updates },
              },
            };
          }
          return node;
        }),
      );
    },
    [setNodes],
  );

  // Delete a node
  const deleteNode = useCallback(
    (nodeId: string) => {
      if (nodeId === START_NODE_ID || nodeId === END_NODE_ID) {
        return; // Can't delete START or END
      }
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
    },
    [setNodes, setEdges],
  );

  // Get current GraphConfig
  const getConfig = useCallback((): GraphConfig => {
    return flowToGraphConfig(nodes, edges, initialConfig);
  }, [nodes, edges, initialConfig]);

  // Reset to initial config
  const reset = useCallback(() => {
    const flow = graphConfigToFlow(initialConfig);
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [initialConfig, setNodes, setEdges]);

  return {
    // React Flow state
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,

    // Actions
    addNode,
    updateNode,
    deleteNode,
    syncToConfig,
    getConfig,
    reset,

    // Setters for direct manipulation
    setNodes,
    setEdges,
  };
}

export { START_NODE_ID, END_NODE_ID };
