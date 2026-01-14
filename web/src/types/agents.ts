// Agent type definitions and type guards

// Spatial/layout primitives (used by spatial chat UI)
export type XYPosition = { x: number; y: number };
export type GridSize = { w: number; h: number };
export type AgentWidgetSize = "large" | "medium" | "small";

export interface AgentSpatialLayout {
  position: XYPosition;
  gridSize?: GridSize;
  size?: AgentWidgetSize;
}

/**
 * Aggregated stats for an agent (computed from sessions/messages/consume, not stored).
 * This matches the backend AgentStatsAggregated schema.
 */
export interface AgentStatsAggregated {
  agent_id: string;
  session_count: number;
  topic_count: number;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
}

/**
 * Daily message count for activity visualization.
 */
export interface DailyMessageCount {
  date: string; // ISO date string (YYYY-MM-DD)
  message_count: number;
}

/**
 * Daily activity stats for an agent (last N days).
 */
export interface DailyStatsResponse {
  agent_id: string;
  daily_counts: DailyMessageCount[];
}

/**
 * Yesterday's activity summary for a session/agent.
 */
export interface YesterdaySummary {
  agent_id: string;
  message_count: number;
  last_message_content?: string | null;
  summary?: string | null;
}

/**
 * Calculate the visual scale multiplier based on message count.
 * Uses a logarithmic curve for diminishing returns:
 * - Each message adds 1/1000 growth initially
 * - Growth rate diminishes as count increases
 * - Capped at 2x size to prevent UI overflow
 *
 * Formula: scale = 1 + 0.3 * ln(1 + messageCount / 100)
 * - At 0 messages: scale = 1.0
 * - At 100 messages: scale = 1.21
 * - At 500 messages: scale = 1.54
 * - At 1000 messages: scale = 1.69
 * - Asymptotically approaches 2.0
 */
export const calculateGrowthScale = (messageCount: number): number => {
  // Logarithmic growth with diminishing returns
  const scale = 1 + 0.3 * Math.log(1 + messageCount / 100);
  // Cap at 2x to prevent overflow
  return Math.min(scale, 2.0);
};

// Metadata for a system agent template
export interface SystemAgentMetadata {
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  tags: string[];
  author?: string | null;
  license?: string | null;
}

// Component metadata for exported agent components
export interface ComponentMetadata {
  key: string;
  name: string;
  description: string;
  component_type: string;
  version: string;
  author?: string | null;
  tags?: string[];
}

// System agent template returned by GET /templates/system
export interface SystemAgentTemplate {
  key: string;
  metadata: SystemAgentMetadata;
  forkable: boolean;
  components: ComponentMetadata[];
  error?: string;
}

// Universal agent type that can represent any agent
export interface Agent {
  id: string;
  name: string;
  description: string;
  user_id: string;
  created_at: string;
  updated_at: string;

  // Regular agent properties
  prompt?: string;
  mcp_servers?: { id: string; name: string; description: string }[];
  mcp_server_ids?: string[];
  require_tool_confirmation?: boolean;
  provider_id?: string | null;
  knowledge_set_id?: string | null;
  avatar?: string | null;
  tags?: string[] | null;
  model?: string | null;
  temperature?: number | null;

  // Graph configuration for agent behavior
  graph_config?: Record<string, unknown> | null;
}

/**
 * UI-enriched agent type.
 * Note: `spatial_layout` is a frontend concern and is not sent to the Agent API.
 */
export type AgentWithLayout = Agent & {
  spatial_layout: AgentSpatialLayout;
  /** Aggregated usage stats for growth visualization; fetched from /agents/stats API */
  stats?: AgentStatsAggregated;
};

// System/builtin agents (official agents provided by the platform)
export interface SystemAgent extends Agent {
  is_official?: boolean;
  is_builtin?: boolean;
}

// Type guard functions for better type safety
export const isSystemAgent = (agent: Agent): agent is SystemAgent => {
  return (
    !!(agent as SystemAgent).is_official || !!(agent as SystemAgent).is_builtin
  );
};
