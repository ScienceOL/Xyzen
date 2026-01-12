// Agent type definitions and type guards

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
