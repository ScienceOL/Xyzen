import { useCallback, useEffect, useMemo, useRef } from "react";
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
  EdgeCondition,
} from "@/types/graphConfig";
import {
  createDefaultLLMNode,
  createDefaultToolNode,
  createDefaultRouterNode,
} from "@/types/graphConfig";

/**
 * Create a stable hash of graph config for comparison.
 * Only compares structural elements (nodes, edges, entry_point) to avoid
 * unnecessary re-syncs from metadata changes.
 */
function getConfigHash(config: GraphConfig | null): string {
  if (!config) return "";
  // Only hash the structural parts that affect the visual representation
  return JSON.stringify({
    nodes: config.nodes?.map((n) => ({ id: n.id, type: n.type, name: n.name })),
    edges: config.edges?.map((e) => ({
      from: e.from_node,
      to: e.to_node,
    })),
    entry: config.entry_point,
  });
}

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
  const edges: AgentEdge[] = config.edges.map((edgeConfig, index) => {
    // Get label from condition - handle both EdgeCondition objects and ConditionType strings
    let conditionLabel: string | undefined;
    if (edgeConfig.condition) {
      if (typeof edgeConfig.condition === "string") {
        // ConditionType string (e.g., "has_tool_calls", "no_tool_calls")
        conditionLabel = edgeConfig.condition;
      } else {
        // EdgeCondition object with target property
        conditionLabel = (edgeConfig.condition as EdgeCondition).target;
      }
    }

    return {
      id: `edge-${index}`,
      source:
        edgeConfig.from_node === "START" ? START_NODE_ID : edgeConfig.from_node,
      target: edgeConfig.to_node === "END" ? END_NODE_ID : edgeConfig.to_node,
      type: edgeConfig.condition ? "conditionalEdge" : "default",
      animated: !!edgeConfig.condition,
      label: edgeConfig.label || conditionLabel,
      data: {
        label: edgeConfig.label || undefined,
        hasCondition: !!edgeConfig.condition,
        config: edgeConfig,
      },
    };
  });

  return { nodes, edges };
}

/**
 * Convert React Flow nodes and edges back to GraphConfig
 *
 * IMPORTANT: If the visual editor hasn't been properly initialized (no user nodes),
 * but existingConfig has nodes, we preserve the existing config to avoid data loss.
 */
export function flowToGraphConfig(
  nodes: AgentNode[],
  edges: AgentEdge[],
  existingConfig?: GraphConfig | null,
): GraphConfig {
  // Filter out START and END pseudo-nodes to get actual user nodes
  const userNodes = nodes.filter(
    (n) => n.id !== START_NODE_ID && n.id !== END_NODE_ID,
  );

  // SAFETY CHECK: If visual editor has no user nodes but existingConfig has nodes,
  // the editor hasn't been properly initialized yet. Return existingConfig unchanged
  // to avoid accidentally wiping out the graph configuration.
  if (userNodes.length === 0 && existingConfig?.nodes?.length) {
    return existingConfig;
  }

  // Convert nodes
  const graphNodes: GraphNodeConfig[] = userNodes.map((node) => ({
    ...node.data.config,
    id: node.id,
    name: node.data.label,
    type: node.data.nodeType,
    position: { x: node.position.x, y: node.position.y },
  }));

  // Convert edges (only if we have user edges, otherwise preserve existing)
  // Filter out only the direct START→END edge (both conditions must be true)
  const userEdges = edges.filter(
    (e) => !(e.source === START_NODE_ID && e.target === END_NODE_ID),
  );
  const graphEdges: GraphEdgeConfig[] =
    userEdges.length > 0 || !existingConfig?.edges?.length
      ? userEdges.map((edge) => ({
          from_node: edge.source === START_NODE_ID ? "START" : edge.source,
          to_node: edge.target === END_NODE_ID ? "END" : edge.target,
          condition: edge.data?.config?.condition || null,
          label: edge.data?.label || null,
          priority: edge.data?.config?.priority || 0,
        }))
      : existingConfig.edges;

  // Find entry point (first node connected from START)
  // Preserve existingConfig.entry_point as fallback to avoid losing it during sync
  const startEdge = graphEdges.find((e) => e.from_node === "START");
  const entryPoint =
    startEdge?.to_node ||
    existingConfig?.entry_point ||
    graphNodes[0]?.id ||
    "agent"; // Default to "agent" as last resort (standard ReAct pattern)

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
 *
 * This hook handles bidirectional sync between:
 * - External config (from parent/JSON editor)
 * - Internal React Flow state (nodes/edges)
 *
 * It uses a ref-based tracking system to prevent infinite update loops.
 */
export function useGraphConfig(
  initialConfig: GraphConfig | null,
  onChange?: (config: GraphConfig) => void,
) {
  // Track the last config hash we synced FROM external to prevent loops
  // When external config changes, we compare hashes to detect genuine changes
  const lastExternalHashRef = useRef<string>("");

  // Track the last config hash we pushed TO parent to detect our own updates bouncing back
  const lastPushedHashRef = useRef<string>("");

  // Track if we're currently syncing from external to prevent echo
  const isSyncingFromExternalRef = useRef(false);

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

  // Sync FROM external config (e.g., JSON editor) TO internal state
  // Only syncs when external config structurally differs from what we last saw
  useEffect(() => {
    const externalHash = getConfigHash(initialConfig);

    // Skip if:
    // 1. This is the same external config we already processed
    // 2. This is our own update bouncing back from parent
    if (
      externalHash === lastExternalHashRef.current ||
      externalHash === lastPushedHashRef.current
    ) {
      return;
    }

    // Mark that we're syncing from external
    isSyncingFromExternalRef.current = true;
    lastExternalHashRef.current = externalHash;

    // Actually sync the state
    const flow = graphConfigToFlow(initialConfig);
    setNodes(flow.nodes);
    setEdges(flow.edges);

    // Reset the flag after React processes the state updates
    // Using setTimeout to ensure it happens after the state updates propagate
    setTimeout(() => {
      isSyncingFromExternalRef.current = false;
    }, 0);
  }, [initialConfig, setNodes, setEdges]);

  // Sync TO parent when internal state changes (but not during external sync)
  useEffect(() => {
    // Skip if we're currently syncing from external (prevents echo)
    if (isSyncingFromExternalRef.current) {
      return;
    }

    // Skip if no onChange handler
    if (!onChange) {
      return;
    }

    // Skip if we haven't received a valid external config yet.
    // This prevents pushing empty/broken config before initialization.
    if (!initialConfig) {
      return;
    }

    // Generate config from current state
    const config = flowToGraphConfig(nodes, edges, initialConfig);
    const configHash = getConfigHash(config);

    // Skip if:
    // 1. This would be the same as what we last pushed
    // 2. This matches what we received from external (no internal changes)
    if (
      configHash === lastPushedHashRef.current ||
      configHash === lastExternalHashRef.current
    ) {
      return;
    }

    // Track what we're pushing and notify parent
    lastPushedHashRef.current = configHash;
    onChange(config);
  }, [nodes, edges, initialConfig, onChange]);

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
