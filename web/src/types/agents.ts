// Agent type definitions and type guards

// Universal agent type that can represent any agent
export interface Agent {
  id: string;
  name: string;
  description: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  agent_type: "regular" | "graph" | "builtin" | "system";

  // Regular agent properties
  prompt?: string;
  mcp_servers?: { id: string }[];
  mcp_server_ids?: string[];
  require_tool_confirmation?: boolean;
  provider_id?: string | null;
  avatar?: string | null;
  tags?: string[] | null;
  model?: string | null;
  temperature?: number | null;

  // Graph agent properties
  state_schema?: Record<string, unknown>;
  is_active?: boolean;
  is_published?: boolean;
  is_official?: boolean;
  node_count?: number;
  edge_count?: number;
  parent_agent_id?: string | null;
}

// Type-specific interfaces for strict typing when needed
export interface RegularAgent extends Agent {
  agent_type: "regular";
  prompt?: string;
  mcp_servers?: { id: string }[];
  mcp_server_ids?: string[];
  require_tool_confirmation?: boolean;
  provider_id?: string | null;
  avatar?: string | null;
  tags?: string[] | null;
  model?: string | null;
  temperature?: number | null;
}

export interface GraphAgent extends Agent {
  agent_type: "graph";
  state_schema: Record<string, unknown>;
  is_active?: boolean;
  is_published?: boolean;
  is_official?: boolean;
  node_count?: number;
  edge_count?: number;
  parent_agent_id?: string | null;
}

export interface SystemAgent extends Agent {
  agent_type: "builtin" | "system";
  prompt?: string;
  model?: string | null;
  temperature?: number | null;
}

// Type guard functions for better type safety
export const isRegularAgent = (agent: Agent): agent is RegularAgent => {
  return agent.agent_type === "regular";
};

export const isGraphAgent = (agent: Agent): agent is GraphAgent => {
  return agent.agent_type === "graph";
};

export const isSystemAgent = (agent: Agent): agent is SystemAgent => {
  return agent.agent_type === "builtin" || agent.agent_type === "system";
};
