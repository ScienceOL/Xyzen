import type { Node, NodeProps } from "@xyflow/react";

export type XYPosition = { x: number; y: number };
export type GridSize = { w: number; h: number };
export type AgentWidgetSize = "large" | "medium" | "small";

/**
 * Stats data for agent display.
 */
export interface AgentStatsDisplay {
  messageCount: number;
  topicCount: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Persistable agent widget data (no functions).
 *
 * Note: XYFlow stores position on the Node itself, but we also keep a copy here
 * so it can be persisted/serialized without the full Node shape.
 */
export interface AgentData {
  name: string;
  role: string;
  desc: string;
  avatar: string;
  status: "idle" | "busy" | "offline";
  size: AgentWidgetSize;
  gridSize?: GridSize; // 1-3 grid system
  position: XYPosition;
  /** Stats for display visualization */
  stats?: AgentStatsDisplay;
}

/** Runtime-only fields injected by the workspace. */
export interface AgentNodeRuntimeData {
  onFocus: (id: string) => void;
  isFocused?: boolean;
}

export type AgentNodeData = AgentData & AgentNodeRuntimeData;

// XYFlow requires node.data to be a Record
export type FlowAgentNodeData = AgentNodeData & Record<string, unknown>;

export type AgentFlowNode = Node<FlowAgentNodeData, "agent">;
export type AgentFlowNodeProps = NodeProps<AgentFlowNode>;
