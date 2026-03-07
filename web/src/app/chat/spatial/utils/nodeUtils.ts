import type { AgentStatsAggregated, AgentWithLayout } from "@/types/agents";
import { GROUP_PADDING, MIN_GROUP_SIZE, NODE_SIZES } from "../constants";
import type {
  AgentFlowNode,
  AgentStatsDisplay,
  DailyActivityData,
  FlowAgentNodeData,
  FlowGroupNodeData,
  YesterdaySummaryData,
} from "../types";

/**
 * Calculate node size from gridSize or size property
 */
export const calculateNodeSize = (
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
 * Convert AgentWithLayout to AgentFlowNode for ReactFlow rendering.
 * Role defaults to first line of description for UI display.
 * stats is derived from agentStats for visualization.
 */
export const agentToFlowNode = (
  agent: AgentWithLayout,
  stats?: AgentStatsAggregated,
  sessionId?: string,
  dailyActivity?: DailyActivityData[],
  yesterdaySummary?: YesterdaySummaryData,
  lastConversationTime?: string,
  isMarketplacePublished?: boolean,
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
      agent: agent,
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
      lastConversationTime,
      isMarketplacePublished,
      onFocus: () => {},
    } as FlowAgentNodeData,
  };
};

const DEFAULT_AVATAR =
  "https://api.dicebear.com/7.x/avataaars/svg?seed=default";

/**
 * Calculate group container size from child node positions and sizes.
 */
export const calculateGroupSize = (
  children: Array<{
    position: { x: number; y: number };
    size: { w: number; h: number };
  }>,
): { w: number; h: number } => {
  if (children.length === 0) return MIN_GROUP_SIZE;

  let maxRight = 0;
  let maxBottom = 0;
  for (const child of children) {
    const right = child.position.x + child.size.w;
    const bottom = child.position.y + child.size.h;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  }

  return {
    w: Math.max(
      MIN_GROUP_SIZE.w,
      maxRight + GROUP_PADDING.left + GROUP_PADDING.right,
    ),
    h: Math.max(
      MIN_GROUP_SIZE.h,
      maxBottom + GROUP_PADDING.top + GROUP_PADDING.bottom,
    ),
  };
};

/**
 * Convert agents to flow nodes with group hierarchy support.
 *
 * Rules:
 * - CEO (parent_id=null, id=rootAgentId): rendered as "ceo" node, canvas top-level
 * - CEO's direct children (parent_id=rootAgentId): canvas top-level
 *   - If they have their own children → rendered as "group" container
 *   - If they don't → rendered as normal "agent" node
 * - Deeper children (parent_id != rootAgentId && parent_id != null):
 *   - If parent is expanded → rendered inside group with parentId set
 *   - If parent is collapsed → not rendered
 *
 * xyflow requires parent nodes to appear before children in the array.
 */
export const agentsToGroupedFlowNodes = (
  agents: AgentWithLayout[],
  rootAgentId: string | null,
  expandState: Record<string, boolean>,
  buildFlowNodeFn: (agent: AgentWithLayout) => AgentFlowNode,
): AgentFlowNode[] => {
  // Build parent→children map
  const childrenByParent = new Map<string, AgentWithLayout[]>();
  const agentMap = new Map<string, AgentWithLayout>();

  for (const agent of agents) {
    agentMap.set(agent.id, agent);
    const parentId = agent.parent_id;
    if (parentId && parentId !== rootAgentId) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(agent);
      childrenByParent.set(parentId, children);
    }
  }

  // Identify non-CEO parent agents (ministers with children)
  const parentAgentIds = new Set<string>();
  for (const [parentId] of childrenByParent) {
    // Only if the parent itself exists in agents and is a CEO's direct child
    const parent = agentMap.get(parentId);
    if (parent) parentAgentIds.add(parentId);
  }

  const result: AgentFlowNode[] = [];

  for (const agent of agents) {
    const isCeo = agent.id === rootAgentId;
    const isGroupChild = agent.parent_id && agent.parent_id !== rootAgentId;

    if (isCeo) {
      // CEO — always rendered as normal (buildFlowNodeFn handles type: "ceo")
      result.push(buildFlowNodeFn(agent));
      continue;
    }

    if (isGroupChild) {
      // This is a child of a non-CEO parent (minister's subordinate)
      // It will be handled when we process its parent group
      continue;
    }

    // CEO's direct child (parent_id == rootAgentId or null/undefined)
    if (parentAgentIds.has(agent.id)) {
      // This agent is a "minister" with children → create group node
      const children = childrenByParent.get(agent.id) ?? [];
      const isExpanded = expandState[agent.id] !== false; // default expanded

      const childAvatars = children.map((c) => c.avatar || DEFAULT_AVATAR);

      // Calculate group size from children
      const childRects = children.map((c) => ({
        position: c.spatial_layout.position,
        size: calculateNodeSize(
          c.spatial_layout.gridSize,
          c.spatial_layout.size,
        ),
      }));
      const groupSize = calculateGroupSize(childRects);

      const groupNode = {
        id: agent.id,
        type: "group" as const,
        position: agent.spatial_layout.position,
        data: {
          agent: agent,
          agentId: agent.id,
          name: agent.name,
          avatar: agent.avatar || DEFAULT_AVATAR,
          isExpanded,
          childCount: children.length,
          childAvatars,
          onToggleExpand: () => {},
          onFocus: () => {},
        } as FlowGroupNodeData,
        style: isExpanded
          ? { width: groupSize.w, height: groupSize.h }
          : undefined,
      };

      // Parent must come before children in the array
      result.push(groupNode as unknown as AgentFlowNode);

      if (isExpanded) {
        // Add children inside the group
        for (const child of children) {
          const childNode = buildFlowNodeFn(child);
          childNode.parentId = agent.id;
          childNode.extent = "parent";
          // Adjust child position relative to group (offset by GROUP_PADDING)
          childNode.position = {
            x: child.spatial_layout.position.x + GROUP_PADDING.left,
            y: child.spatial_layout.position.y + GROUP_PADDING.top,
          };
          result.push(childNode);
        }
      }
    } else {
      // Normal agent, no children — render as regular agent node
      result.push(buildFlowNodeFn(agent));
    }
  }

  return result;
};
