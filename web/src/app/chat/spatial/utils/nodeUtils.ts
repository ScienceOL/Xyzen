import type { AgentStatsAggregated, AgentWithLayout } from "@/types/agents";
import { NODE_SIZES } from "../constants";
import type {
  AgentFlowNode,
  AgentStatsDisplay,
  DailyActivityData,
  FlowAgentNodeData,
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
