import { authService } from "@/service/authService";
import type { Agent } from "@/types/agents";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";
// Note: Removed default MCP auto-attachment imports to avoid implicitly adding servers

export interface AgentSlice {
  agents: Agent[];
  agentsLoading: boolean;
  publishedAgents: Agent[];
  publishedAgentsLoading: boolean;
  officialAgents: Agent[];
  officialAgentsLoading: boolean;
  hiddenGraphAgentIds: string[];
  systemAgents: Agent[];
  systemAgentsLoading: boolean;
  fetchAgents: () => Promise<void>;
  fetchPublishedGraphAgents: () => Promise<void>;
  fetchOfficialGraphAgents: () => Promise<void>;
  fetchSystemAgents: () => Promise<void>;
  getSystemChatAgent: () => Promise<Agent>;
  getSystemWorkshopAgent: () => Promise<Agent>;
  syncSystemAgentMcps: () => Promise<void>;
  isCreatingAgent: boolean;
  createAgent: (agent: Omit<Agent, "id">) => Promise<void>;
  createGraphAgent: (graphAgent: GraphAgentCreate) => Promise<void>;
  updateAgent: (agent: Agent) => Promise<void>;
  updateAgentProvider: (
    agentId: string,
    providerId: string | null,
  ) => Promise<void>;
  toggleGraphAgentPublish: (agentId: string) => Promise<void>;
  setGraphAgentPublish: (
    agentId: string,
    isPublished: boolean,
  ) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  removeGraphAgentFromSidebar: (id: string) => void;
  addGraphAgentToSidebar: (id: string) => void;
  // Helper methods for filtering by type
  getRegularAgents: () => Agent[];
  getGraphAgents: () => Agent[];
  getSystemAgents: () => Agent[];
  // Debug helper
  getAgentStats: () => {
    total: number;
    regular: number;
    graph: number;
    system: number;
    regularAgents: { id: string; name: string }[];
    graphAgents: { id: string; name: string; is_published?: boolean }[];
  };
}

// Graph agent creation interface
export interface GraphAgentCreate {
  name: string;
  description: string;
  state_schema?: Record<string, unknown>;
  is_published?: boolean;
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

// Removed helper that auto-attached default MCPs to system agents

export const createAgentSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  AgentSlice
> = (set, get) => ({
  agents: [],
  agentsLoading: false,
  publishedAgents: [],
  publishedAgentsLoading: false,
  officialAgents: [],
  officialAgentsLoading: false,
  hiddenGraphAgentIds: loadHiddenGraphAgentIds(),
  systemAgents: [],
  systemAgentsLoading: false,
  isCreatingAgent: false,
  fetchAgents: async () => {
    set({ agentsLoading: true });
    try {
      // Fetch regular agents and graph agents separately
      const [regularResponse, graphResponse] = await Promise.all([
        fetch(`${get().backendUrl}/xyzen/api/v1/agents/`, {
          headers: createAuthHeaders(),
        }),
        fetch(`${get().backendUrl}/xyzen/api/v1/graph-agents/`, {
          headers: createAuthHeaders(),
        }),
      ]);

      if (!regularResponse.ok) {
        throw new Error("Failed to fetch regular agents");
      }
      if (!graphResponse.ok) {
        throw new Error("Failed to fetch graph agents");
      }

      const regularAgents: Agent[] = await regularResponse.json();
      const graphAgents: Agent[] = await graphResponse.json();

      // Add agent_type markers to ensure proper typing
      const typedRegularAgents = regularAgents.map((agent) => ({
        ...agent,
        agent_type: "regular" as const,
      }));

      const typedGraphAgents = graphAgents.map((agent) => ({
        ...agent,
        agent_type: "graph" as const,
      }));

      // Combine all agents (don't filter here, let components filter as needed)
      const allAgents = [...typedRegularAgents, ...typedGraphAgents];

      // Debug: Combined agents total: ${allAgents.length} (${typedRegularAgents.length} regular + ${typedGraphAgents.length} graph)

      set({ agents: allAgents, agentsLoading: false });
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      set({ agentsLoading: false });
      throw error;
    }
  },
  fetchPublishedGraphAgents: async () => {
    set({ publishedAgentsLoading: true });
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/graph-agents/published`,
        {
          headers: createAuthHeaders(),
        },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch published graph agents");
      }
      const publishedAgents: Agent[] = await response.json();

      // Add agent_type marker to ensure proper typing
      const typedPublishedAgents = publishedAgents.map((agent) => ({
        ...agent,
        agent_type: "graph" as const,
        is_published: true, // Ensure published flag is set
      }));

      // Published graph agents fetched: ${typedPublishedAgents.length}
      set({
        publishedAgents: typedPublishedAgents,
        publishedAgentsLoading: false,
      });
    } catch (error) {
      console.error("Failed to fetch published graph agents:", error);
      set({ publishedAgentsLoading: false });
      throw error;
    }
  },
  fetchOfficialGraphAgents: async () => {
    set({ officialAgentsLoading: true });
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/graph-agents/official`,
        {
          headers: createAuthHeaders(),
        },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch official graph agents");
      }
      const officialAgents: Agent[] = await response.json();

      // Add agent_type marker to ensure proper typing
      const typedOfficialAgents = officialAgents.map((agent) => ({
        ...agent,
        agent_type: "graph" as const,
        is_official: true, // Ensure official flag is set
      }));

      // Official graph agents fetched: ${typedOfficialAgents.length}
      set({
        officialAgents: typedOfficialAgents,
        officialAgentsLoading: false,
      });
    } catch (error) {
      console.error("Failed to fetch official graph agents:", error);
      set({ officialAgentsLoading: false });
      throw error;
    }
  },
  createAgent: async (agent) => {
    const { isCreatingAgent } = get();
    if (isCreatingAgent) {
      console.log("Agent creation already in progress");
      return;
    }

    set({ isCreatingAgent: true });
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
    } finally {
      set({ isCreatingAgent: false });
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
  toggleGraphAgentPublish: async (agentId: string) => {
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/graph-agents/${agentId}/toggle-publish`,
        {
          method: "PATCH",
          headers: createAuthHeaders(),
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to toggle publish status: ${errorText}`);
      }
      const updatedAgent: Agent = await response.json();

      // Update local state optimistically
      set((state) => {
        // Update in agents list
        const agentIndex = state.agents.findIndex((a) => a.id === agentId);
        if (agentIndex !== -1) {
          state.agents[agentIndex].is_published = updatedAgent.is_published;
        }

        // Update in publishedAgents list
        const publishedIndex = state.publishedAgents.findIndex(
          (a) => a.id === agentId,
        );
        if (updatedAgent.is_published) {
          // Add to published list if not there
          if (publishedIndex === -1) {
            state.publishedAgents.push(updatedAgent);
          } else {
            state.publishedAgents[publishedIndex] = updatedAgent;
          }
        } else {
          // Remove from published list if unpublished
          if (publishedIndex !== -1) {
            state.publishedAgents.splice(publishedIndex, 1);
          }
        }
      });

      // Refresh to ensure consistency
      await get().fetchAgents();
      await get().fetchPublishedGraphAgents();
    } catch (error) {
      console.error(error);
      throw error;
    }
  },
  setGraphAgentPublish: async (agentId: string, isPublished: boolean) => {
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/graph-agents/${agentId}`,
        {
          method: "PATCH",
          headers: createAuthHeaders(),
          body: JSON.stringify({ is_published: isPublished }),
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to set publish status: ${errorText}`);
      }
      const updatedAgent: Agent = await response.json();

      // Update local state optimistically
      set((state) => {
        // Update in agents list
        const agentIndex = state.agents.findIndex((a) => a.id === agentId);
        if (agentIndex !== -1) {
          state.agents[agentIndex].is_published = isPublished;
        }

        // Update in publishedAgents list
        const publishedIndex = state.publishedAgents.findIndex(
          (a) => a.id === agentId,
        );
        if (isPublished) {
          // Add to published list if not there
          if (publishedIndex === -1) {
            state.publishedAgents.push(updatedAgent);
          } else {
            state.publishedAgents[publishedIndex] = updatedAgent;
          }
        } else {
          // Remove from published list if unpublished
          if (publishedIndex !== -1) {
            state.publishedAgents.splice(publishedIndex, 1);
          }
        }
      });

      // Refresh to ensure consistency
      await get().fetchAgents();
      await get().fetchPublishedGraphAgents();
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
    // Remove from hidden list and add agent to main array
    set((state) => {
      state.hiddenGraphAgentIds = state.hiddenGraphAgentIds.filter(
        (hiddenId) => hiddenId !== id,
      );

      // Check if this is an official or published agent that needs to be added to the main agents array
      const officialAgent = state.officialAgents.find((a) => a.id === id);
      const publishedAgent = state.publishedAgents.find((a) => a.id === id);

      if (officialAgent && !state.agents.some((a) => a.id === id)) {
        // Ensure official agent has proper type markers for sidebar display
        const agentToAdd = {
          ...officialAgent,
          agent_type: "graph" as const,
          is_official: true,
        };
        state.agents.push(agentToAdd);
      } else if (publishedAgent && !state.agents.some((a) => a.id === id)) {
        // Ensure published agent has proper type markers for sidebar display
        const agentToAdd = {
          ...publishedAgent,
          agent_type: "graph" as const,
          is_published: true,
        };
        state.agents.push(agentToAdd);
      }
    });
    // Persist to localStorage
    saveHiddenGraphAgentIds(get().hiddenGraphAgentIds);
    // Note: Don't call fetchAgents() here as it might override our changes
  },
  fetchSystemAgents: async () => {
    set({ systemAgentsLoading: true });
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/system/all`,
        {
          headers: createAuthHeaders(),
        },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch system agents");
      }
      const systemAgents: Agent[] = await response.json();
      // Do not auto-attach any MCP servers; show exactly what backend returns
      set({ systemAgents, systemAgentsLoading: false });
    } catch (error) {
      console.error("Failed to fetch system agents:", error);
      set({ systemAgentsLoading: false });
      throw error;
    }
  },
  getSystemChatAgent: async () => {
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/system/chat`,
        {
          headers: createAuthHeaders(),
        },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch system chat agent");
      }
      const agent = await response.json();
      return agent;
    } catch (error) {
      console.error("Failed to fetch system chat agent:", error);
      throw error;
    }
  },
  getSystemWorkshopAgent: async () => {
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/system/workshop`,
        {
          headers: createAuthHeaders(),
        },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch system workshop agent");
      }
      const agent = await response.json();
      return agent;
    } catch (error) {
      console.error("Failed to fetch system workshop agent:", error);
      throw error;
    }
  },
  // Sync system agents with their default MCPs in the backend
  syncSystemAgentMcps: async () => {
    // No-op: we've removed auto-syncing of system agent MCPs
    return;
  },
  // Helper methods for filtering by agent type
  getRegularAgents: () => {
    return get().agents.filter((agent) => agent.agent_type === "regular");
  },
  getGraphAgents: () => {
    return get().agents.filter((agent) => agent.agent_type === "graph");
  },
  getSystemAgents: () => {
    return get().systemAgents;
  },
  // Debug helper to verify agent types and counts
  getAgentStats: () => {
    const { agents } = get();
    const regular = agents.filter((agent) => agent.agent_type === "regular");
    const graph = agents.filter((agent) => agent.agent_type === "graph");
    const system = agents.filter(
      (agent) =>
        agent.agent_type === "builtin" || agent.agent_type === "system",
    );

    return {
      total: agents.length,
      regular: regular.length,
      graph: graph.length,
      system: system.length,
      regularAgents: regular.map((a) => ({ id: a.id, name: a.name })),
      graphAgents: graph.map((a) => ({
        id: a.id,
        name: a.name,
        is_published: a.agent_type === "graph" ? a.is_published : undefined,
      })),
    };
  },
});
