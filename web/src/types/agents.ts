// Agent type definitions and type guards

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
}

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
