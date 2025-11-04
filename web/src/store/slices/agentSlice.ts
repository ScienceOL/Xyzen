import type { Agent } from "@/components/layouts/XyzenAgent";
import { authService } from "@/service/authService";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface AgentSlice {
  agents: Agent[];
  agentsLoading: boolean;
  hiddenGraphAgentIds: string[];
  fetchAgents: () => Promise<void>;
  createAgent: (agent: Omit<Agent, "id">) => Promise<void>;
  createGraphAgent: (graphAgent: GraphAgentCreate) => Promise<void>;
  updateAgent: (agent: Agent) => Promise<void>;
  updateAgentProvider: (
    agentId: string,
    providerId: string | null,
  ) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  removeGraphAgentFromSidebar: (id: string) => void;
  addGraphAgentToSidebar: (id: string) => void;
  // Helper methods for filtering by type
  getRegularAgents: () => Agent[];
  getGraphAgents: () => Agent[];
}

// Graph agent creation interface
export interface GraphAgentCreate {
  name: string;
  description: string;
  state_schema?: Record<string, unknown>;
}

// 创建带认证头的请求选项
const createAuthHeaders = (): HeadersInit => {
  const token = authService.getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

// Helper functions for localStorage persistence
const HIDDEN_GRAPH_AGENTS_KEY = "xyzen_hidden_graph_agents";

const loadHiddenGraphAgentIds = (): string[] => {
  try {
    const stored = localStorage.getItem(HIDDEN_GRAPH_AGENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveHiddenGraphAgentIds = (hiddenIds: string[]): void => {
  try {
    localStorage.setItem(HIDDEN_GRAPH_AGENTS_KEY, JSON.stringify(hiddenIds));
  } catch {
    // Ignore localStorage errors
  }
};

export const createAgentSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  AgentSlice
> = (set, get) => ({
  agents: [],
  agentsLoading: false,
  hiddenGraphAgentIds: loadHiddenGraphAgentIds(),
  fetchAgents: async () => {
    set({ agentsLoading: true });
    try {
      // Use unified endpoint that returns both regular and graph agents
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/all/unified`,
        {
          headers: createAuthHeaders(),
        },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch agents");
      }
      const allAgents: Agent[] = await response.json();

      // Filter out hidden graph agents
      const { hiddenGraphAgentIds } = get();
      const visibleAgents = allAgents.filter((agent) => {
        // Keep all regular agents
        if (agent.agent_type === "regular") return true;
        // Keep graph agents that are not hidden
        return !hiddenGraphAgentIds.includes(agent.id);
      });

      set({ agents: visibleAgents, agentsLoading: false });
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      set({ agentsLoading: false });
      throw error;
    }
  },
  createAgent: async (agent) => {
    try {
      const response = await fetch(`${get().backendUrl}/xyzen/api/v1/agents/`, {
        method: "POST",
        headers: createAuthHeaders(),
        body: JSON.stringify(agent),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create agent: ${errorText}`);
      }
      await get().fetchAgents();
    } catch (error) {
      console.error(error);
      throw error;
    }
  },
  updateAgent: async (agent) => {
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/${agent.id}`,
        {
          method: "PATCH",
          headers: createAuthHeaders(),
          body: JSON.stringify(agent),
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update agent: ${errorText}`);
      }
      await get().fetchAgents();
    } catch (error) {
      console.error(error);
      throw error;
    }
  },
  updateAgentProvider: async (agentId, providerId) => {
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/${agentId}`,
        {
          method: "PATCH",
          headers: createAuthHeaders(),
          body: JSON.stringify({ provider_id: providerId }),
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update agent provider: ${errorText}`);
      }
      // Update local state optimistically
      set((state) => {
        const agent = state.agents.find((a) => a.id === agentId);
        if (agent) {
          agent.provider_id = providerId;
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  },
  createGraphAgent: async (graphAgent) => {
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/graph-agents/`,
        {
          method: "POST",
          headers: createAuthHeaders(),
          body: JSON.stringify({
            ...graphAgent,
            state_schema: graphAgent.state_schema || {
              type: "object",
              properties: {
                messages: { type: "array" },
                current_step: { type: "string" },
                user_input: { type: "string" },
                final_output: { type: "string" },
                execution_context: { type: "object" },
              },
            },
          }),
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create graph agent: ${errorText}`);
      }
      await get().fetchAgents(); // Refresh unified agent list
    } catch (error) {
      console.error(error);
      throw error;
    }
  },
  deleteAgent: async (id) => {
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/${id}`,
        {
          method: "DELETE",
          headers: createAuthHeaders(),
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete agent: ${errorText}`);
      }
      await get().fetchAgents();
    } catch (error) {
      console.error(error);
      throw error;
    }
  },
  removeGraphAgentFromSidebar: (id: string) => {
    // Add to hidden list and remove from current agents
    set((state) => {
      if (!state.hiddenGraphAgentIds.includes(id)) {
        state.hiddenGraphAgentIds.push(id);
      }
      state.agents = state.agents.filter((agent) => agent.id !== id);
    });
    // Persist to localStorage
    saveHiddenGraphAgentIds(get().hiddenGraphAgentIds);
  },
  addGraphAgentToSidebar: (id: string) => {
    // Remove from hidden list and refresh agents
    set((state) => {
      state.hiddenGraphAgentIds = state.hiddenGraphAgentIds.filter(
        (hiddenId) => hiddenId !== id,
      );
    });
    // Persist to localStorage
    saveHiddenGraphAgentIds(get().hiddenGraphAgentIds);
    // Refresh agents to show the newly unhidden agent
    get().fetchAgents();
  },
  // Helper methods for filtering by agent type
  getRegularAgents: () => {
    return get().agents.filter((agent) => agent.agent_type === "regular");
  },
  getGraphAgents: () => {
    return get().agents.filter((agent) => agent.agent_type === "graph");
  },
});
