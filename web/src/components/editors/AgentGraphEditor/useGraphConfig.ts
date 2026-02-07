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
  GraphNodeKind,
  EdgePredicate,
} from "@/types/graphConfig";
import {
  createDefaultLLMNode,
  createDefaultToolNode,
  createDefaultTransformNode,
  createDefaultComponentNode,
} from "@/types/graphConfig";

/**
 * Create a stable hash of graph config for comparison.
 * Compares full node configurations to ensure all changes are synced.
 */
function getConfigHash(config: GraphConfig | null): string {
  if (!config) return "";
  return JSON.stringify({
    nodes: config.graph?.nodes,
    edges: config.graph?.edges,
    entrypoints: config.graph?.entrypoints,
  });
}

// React Flow node data structure with index signature for compatibility
export interface AgentNodeData {
  label: string;
  nodeType: GraphNodeKind;
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
 * Convert v3 GraphConfig to React Flow nodes and edges.
 */
export function graphConfigToFlow(config: GraphConfig | null): {
  nodes: AgentNode[];
  edges: AgentEdge[];
} {
  if (!config?.graph?.nodes || !config?.graph?.edges) {
    return { nodes: createDefaultNodes(), edges: [] };
  }

  // Read positions from ui.positions
  const positions = (config.ui?.positions ?? {}) as Record<
    string,
    { x: number; y: number }
  >;

  const nodes: AgentNode[] = [
    // START node (always present)
    {
      id: START_NODE_ID,
      type: "startNode",
      position: { x: 50, y: 200 },
      data: {
        label: "START",
        nodeType: "llm" as GraphNodeKind, // placeholder
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
        nodeType: "llm" as GraphNodeKind, // placeholder
        config: {} as GraphNodeConfig,
      },
      deletable: false,
    },
  ];

  // Add user-defined nodes
  let xOffset = 200;
  for (const nodeConfig of config.graph.nodes) {
    const position = positions[nodeConfig.id] || { x: xOffset, y: 200 };
    nodes.push({
      id: nodeConfig.id,
      type: "agentNode",
      position,
      data: {
        label: nodeConfig.name,
        nodeType: nodeConfig.kind,
        config: nodeConfig,
      },
    });
    xOffset += 180;
  }

  // Create edges from entrypoints (START → entrypoint nodes)
  const edges: AgentEdge[] = [];
  for (const ep of config.graph.entrypoints) {
    edges.push({
      id: `edge-start-${ep}`,
      source: START_NODE_ID,
      target: ep,
      type: "default",
      data: {
        hasCondition: false,
        config: {
          from_node: ep, // placeholder — START edges don't exist in v3
          to_node: ep,
        },
      },
    });
  }

  // Convert graph edges
  config.graph.edges.forEach((edgeConfig, index) => {
    let conditionLabel: string | undefined;
    if (edgeConfig.when) {
      if (typeof edgeConfig.when === "string") {
        conditionLabel = edgeConfig.when;
      } else {
        const pred = edgeConfig.when as EdgePredicate;
        conditionLabel = `${pred.state_path} ${pred.operator}`;
      }
    }

    edges.push({
      id: `edge-${index}`,
      source: edgeConfig.from_node,
      target: edgeConfig.to_node === "END" ? END_NODE_ID : edgeConfig.to_node,
      type: edgeConfig.when ? "conditionalEdge" : "default",
      animated: !!edgeConfig.when,
      label: edgeConfig.label || conditionLabel,
      data: {
        label: edgeConfig.label || undefined,
        hasCondition: !!edgeConfig.when,
        config: edgeConfig,
      },
    });
  });

  return { nodes, edges };
}

/**
 * Convert React Flow nodes and edges back to v3 GraphConfig.
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
  // the editor hasn't been properly initialized yet. Return existingConfig unchanged.
  if (userNodes.length === 0 && existingConfig?.graph?.nodes?.length) {
    return existingConfig;
  }

  // Collect positions for ui.positions
  const uiPositions: Record<string, { x: number; y: number }> = {};

  // Convert nodes (they're already v3 GraphNodeConfig in the data)
  const graphNodes: GraphNodeConfig[] = userNodes.map((node) => {
    uiPositions[node.id] = { x: node.position.x, y: node.position.y };
    // Rebuild the node with potentially updated name
    return {
      ...node.data.config,
      id: node.id,
      name: node.data.label,
    } as GraphNodeConfig;
  });

  // Separate START edges (for entrypoints) from regular edges
  const startEdges = edges.filter((e) => e.source === START_NODE_ID);

  // Derive entrypoints from START edges
  const entrypoints = startEdges.map((e) => e.target);

  // Convert regular edges to v3 format
  const graphEdges: GraphEdgeConfig[] = [];
  for (const edge of edges) {
    // Skip START edges — they become entrypoints
    if (edge.source === START_NODE_ID) continue;

    graphEdges.push({
      from_node: edge.source,
      to_node: edge.target === END_NODE_ID ? "END" : edge.target,
      when: edge.data?.config?.when || null,
      label: edge.data?.label || null,
      priority: edge.data?.config?.priority || 0,
    });
  }

  // Fallback entrypoint
  const finalEntrypoints =
    entrypoints.length > 0
      ? entrypoints
      : existingConfig?.graph?.entrypoints || [graphNodes[0]?.id || "agent"];

  return {
    schema_version: "3.0",
    key: existingConfig?.key || "custom_graph",
    revision: existingConfig?.revision || 1,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
      entrypoints: finalEntrypoints,
    },
    state: existingConfig?.state || {},
    limits: existingConfig?.limits || {
      max_time_s: 300,
      max_steps: 128,
      max_concurrency: 10,
    },
    prompt_config: existingConfig?.prompt_config || null,
    metadata: existingConfig?.metadata || null,
    deps: existingConfig?.deps || null,
    ui: { ...(existingConfig?.ui || {}), positions: uiPositions },
  };
}

/**
 * Create default START and END nodes.
 */
function createDefaultNodes(): AgentNode[] {
  return [
    {
      id: START_NODE_ID,
      type: "startNode",
      position: { x: 50, y: 200 },
      data: {
        label: "START",
        nodeType: "llm" as GraphNodeKind,
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
        nodeType: "llm" as GraphNodeKind,
        config: {} as GraphNodeConfig,
      },
      deletable: false,
    },
  ];
}

/**
 * Hook to manage graph state and sync with v3 GraphConfig JSON.
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
  useEffect(() => {
    const externalHash = getConfigHash(initialConfig);

    if (
      externalHash === lastExternalHashRef.current ||
      externalHash === lastPushedHashRef.current
    ) {
      return;
    }

    isSyncingFromExternalRef.current = true;
    lastExternalHashRef.current = externalHash;

    const flow = graphConfigToFlow(initialConfig);
    setNodes(flow.nodes);
    setEdges(flow.edges);

    setTimeout(() => {
      isSyncingFromExternalRef.current = false;
    }, 0);
  }, [initialConfig, setNodes, setEdges]);

  // Sync TO parent when internal state changes (but not during external sync)
  useEffect(() => {
    if (isSyncingFromExternalRef.current) return;
    if (!onChange) return;
    if (!initialConfig) return;

    const config = flowToGraphConfig(nodes, edges, initialConfig);
    const configHash = getConfigHash(config);

    if (
      configHash === lastPushedHashRef.current ||
      configHash === lastExternalHashRef.current
    ) {
      return;
    }

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
    (kind: GraphNodeKind, position?: { x: number; y: number }) => {
      const id = `node_${Date.now()}`;
      const pos = position || { x: 250, y: 200 };

      let config: GraphNodeConfig;
      switch (kind) {
        case "llm":
          config = createDefaultLLMNode(id, "New LLM Node");
          break;
        case "tool":
          config = createDefaultToolNode(id, "New Tool Node");
          break;
        case "transform":
          config = createDefaultTransformNode(id, "New Transform Node");
          break;
        case "component":
          config = createDefaultComponentNode(id, "New Component");
          break;
      }

      const newNode: AgentNode = {
        id,
        type: "agentNode",
        position: pos,
        data: {
          label: config.name,
          nodeType: kind,
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
    (
      nodeId: string,
      updates: {
        name?: string;
        description?: string | null;
        config?: Record<string, unknown>;
      },
    ) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            const currentConfig = node.data.config;
            const newConfig = updates.config
              ? ({
                  ...currentConfig,
                  config: { ...currentConfig.config, ...updates.config },
                } as GraphNodeConfig)
              : currentConfig;

            return {
              ...node,
              data: {
                ...node.data,
                label: updates.name || node.data.label,
                config: {
                  ...newConfig,
                  name: updates.name || newConfig.name,
                  description:
                    updates.description !== undefined
                      ? updates.description
                      : newConfig.description,
                },
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
        return;
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
