import { authService } from "@/service/authService";
import type { Agent, SystemAgentTemplate } from "@/types/agents";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface AgentSlice {
  agents: Agent[];
  agentsLoading: boolean;

  // System agent templates
  systemAgentTemplates: SystemAgentTemplate[];
  templatesLoading: boolean;
  fetchSystemAgentTemplates: () => Promise<void>;

  fetchAgents: () => Promise<void>;

  isCreatingAgent: boolean;
  createAgent: (agent: Omit<Agent, "id">) => Promise<void>;
  createAgentFromTemplate: (
    systemKey: string,
    customName?: string,
  ) => Promise<void>;
  updateAgent: (agent: Agent) => Promise<void>;
  updateAgentProvider: (
    agentId: string,
    providerId: string | null,
  ) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
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

export const createAgentSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  AgentSlice
> = (set, get) => ({
  agents: [],
  agentsLoading: false,

  // System agent templates state
  systemAgentTemplates: [],
  templatesLoading: false,

  isCreatingAgent: false,

  fetchSystemAgentTemplates: async () => {
    set({ templatesLoading: true });
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/templates/system`,
        {
          headers: createAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch system agent templates");
      }

      const templates: SystemAgentTemplate[] = await response.json();
      set({ systemAgentTemplates: templates, templatesLoading: false });
    } catch (error) {
      console.error("Failed to fetch system agent templates:", error);
      set({ templatesLoading: false });
      throw error;
    }
  },

  fetchAgents: async () => {
    set({ agentsLoading: true });
    try {
      const response = await fetch(`${get().backendUrl}/xyzen/api/v1/agents/`, {
        headers: createAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch agents");
      }

      const agents: Agent[] = await response.json();
      set({ agents, agentsLoading: false });
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      set({ agentsLoading: false });
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

  createAgentFromTemplate: async (systemKey: string, customName?: string) => {
    const { isCreatingAgent } = get();
    if (isCreatingAgent) {
      console.log("Agent creation already in progress");
      return;
    }

    set({ isCreatingAgent: true });
    try {
      const url = `${get().backendUrl}/xyzen/api/v1/agents/from-template/${systemKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: createAuthHeaders(),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create agent from template: ${errorText}`);
      }

      // If custom name provided, update the agent
      if (customName) {
        const createdAgent = await response.json();
        await fetch(
          `${get().backendUrl}/xyzen/api/v1/agents/${createdAgent.id}`,
          {
            method: "PATCH",
            headers: createAuthHeaders(),
            body: JSON.stringify({ name: customName }),
          },
        );
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
});
