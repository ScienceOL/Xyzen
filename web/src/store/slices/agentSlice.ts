import { authService } from "@/service/authService";
import { rootAgentService } from "@/service/rootAgentService";
import { sessionService } from "@/service/sessionService";
import type {
  Agent,
  AgentSpatialLayout,
  AgentStatsAggregated,
  AgentWithLayout,
  DailyStatsResponse,
  YesterdaySummary,
} from "@/types/agents";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface AgentSlice {
  agents: AgentWithLayout[];
  agentsLoading: boolean;

  // Root (CEO) agent
  rootAgent: AgentWithLayout | null;
  rootAgentLoading: boolean;
  fetchRootAgent: () => Promise<void>;

  // Map from agentId -> sessionId for layout persistence
  // Layout is stored in Session, not Agent
  sessionIdByAgentId: Record<string, string>;

  // Agent stats for growth visualization (aggregated from sessions/messages)
  agentStats: Record<string, AgentStatsAggregated>;
  agentStatsLoading: boolean;

  // Daily activity data for charts (last 7 days)
  dailyActivity: Record<string, DailyStatsResponse>;
  // Yesterday summary for each agent
  yesterdaySummary: Record<string, YesterdaySummary>;

  fetchAgents: () => Promise<void>;
  fetchAgentStats: () => Promise<void>;
  fetchDailyActivity: () => Promise<void>;
  incrementLocalAgentMessageCount: (agentId: string) => void;
  reorderAgents: (agentIds: string[]) => Promise<void>;

  isCreatingAgent: boolean;
  createAgent: (agent: Omit<Agent, "id">) => Promise<string | undefined>;
  addForkedAgent: (
    agentId: string,
    centerPosition: { x: number; y: number },
  ) => Promise<void>;
  updateAgent: (agent: Agent | AgentWithLayout) => Promise<void>;
  updateAgentLayout: (
    agentId: string,
    layout: AgentSpatialLayout,
  ) => Promise<void>;
  updateAgentAvatar: (agentId: string, avatarUrl: string) => Promise<void>;
  updateAgentProvider: (
    agentId: string,
    providerId: string | null,
  ) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
}

const defaultSpatialLayoutForIndex = (
  index: number,
): AgentWithLayout["spatial_layout"] => {
  // Simple deterministic grid so the spatial UI has stable starting positions.
  // Default to 2x1 grid size for compact horizontal layout
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    position: { x: col * 360, y: row * 220 },
    size: "medium",
    gridSize: { w: 2, h: 1 },
  };
};

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

  // Root (CEO) agent
  rootAgent: null,
  rootAgentLoading: false,

  // Map from agentId -> sessionId
  sessionIdByAgentId: {},

  // Agent stats state
  agentStats: {},
  agentStatsLoading: false,

  // Daily activity and yesterday summary
  dailyActivity: {},
  yesterdaySummary: {},

  isCreatingAgent: false,

  fetchAgents: async () => {
    set({ agentsLoading: true });
    try {
      // Store existing layouts before fetching (to preserve unsaved layouts)
      const existingAgents = get().agents;
      const existingLayoutMap: Record<string, AgentSpatialLayout> = {};
      const existingAvatarMap: Record<string, string> = {};
      existingAgents.forEach((agent) => {
        if (agent.spatial_layout) {
          existingLayoutMap[agent.id] = agent.spatial_layout;
        }
        if (agent.avatar) {
          existingAvatarMap[agent.id] = agent.avatar;
        }
      });

      const response = await fetch(`${get().backendUrl}/xyzen/api/v1/agents/`, {
        headers: createAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch agents");
      }

      const allAgents: Agent[] = await response.json();
      // Defensive filter: exclude root agent in case backend didn't filter it
      const rootAgentId = get().rootAgent?.id;
      const rawAgents = rootAgentId
        ? allAgents.filter((a) => a.id !== rootAgentId)
        : allAgents;

      // Fetch sessions for each agent to get spatial_layout and avatar
      // Build session mapping and extract layouts/avatars
      const sessionMap: Record<string, string> = {};
      const layoutMap: Record<string, AgentSpatialLayout> = {};
      const avatarMap: Record<string, string> = {};

      await Promise.all(
        rawAgents.map(async (agent) => {
          try {
            const session = await sessionService.getSessionByAgent(agent.id);
            sessionMap[agent.id] = session.id;
            if (session.spatial_layout) {
              layoutMap[agent.id] = session.spatial_layout;
            }
            if (session.avatar) {
              avatarMap[agent.id] = session.avatar;
            }
          } catch {
            // Session doesn't exist yet - will be created when user starts chat
            console.debug(`No session found for agent ${agent.id}`);
          }
        }),
      );

      // Enrich agents with layout and avatar from:
      // 1. Session (highest priority - persisted)
      // 2. Existing local state (preserve unsaved changes)
      // 3. Default values (fallback for new agents)
      const agents: AgentWithLayout[] = rawAgents.map((agent, index) => ({
        ...agent,
        spatial_layout:
          layoutMap[agent.id] ??
          existingLayoutMap[agent.id] ??
          defaultSpatialLayoutForIndex(index),
        avatar:
          avatarMap[agent.id] ?? existingAvatarMap[agent.id] ?? agent.avatar,
      }));

      set({
        agents,
        agentsLoading: false,
        sessionIdByAgentId: sessionMap,
      });

      // Also fetch stats for growth visualization (await to ensure all data is ready)
      await get().fetchAgentStats();
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      set({ agentsLoading: false });
      throw error;
    }
  },

  fetchRootAgent: async () => {
    set({ rootAgentLoading: true });
    try {
      const data = await rootAgentService.getRootAgent(get().backendUrl);
      const agent = data.agent;

      // Fetch session to get avatar/layout (same pattern as fetchAgents)
      let spatialLayout: AgentSpatialLayout | undefined;
      let avatar: string | undefined;
      try {
        const session = await sessionService.getSessionByAgent(agent.id);
        if (session.spatial_layout) spatialLayout = session.spatial_layout;
        if (session.avatar) avatar = session.avatar;
      } catch {
        // Session doesn't exist yet
      }

      const rootAgent: AgentWithLayout = {
        ...agent,
        spatial_layout: spatialLayout ?? defaultSpatialLayoutForIndex(0),
        avatar: avatar ?? agent.avatar,
      };
      set({ rootAgent, rootAgentLoading: false });
    } catch (error) {
      console.error("Failed to fetch root agent:", error);
      set({ rootAgentLoading: false });
    }
  },

  fetchAgentStats: async () => {
    set({ agentStatsLoading: true });
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/stats`,
        {
          headers: createAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch agent stats");
      }

      const stats: Record<string, AgentStatsAggregated> = await response.json();
      set({ agentStats: stats, agentStatsLoading: false });

      // Also fetch daily activity for visualization (await to ensure all data is ready)
      await get().fetchDailyActivity();
    } catch (error) {
      console.error("Failed to fetch agent stats:", error);
      set({ agentStatsLoading: false });
      // Don't throw - stats are optional enhancement
    }
  },

  fetchDailyActivity: async () => {
    const agents = get().agents;
    if (agents.length === 0) return;

    const backendUrl = get().backendUrl;
    const dailyActivity: Record<string, DailyStatsResponse> = {};
    const yesterdaySummary: Record<string, YesterdaySummary> = {};

    // Fetch daily stats and yesterday summary for each agent in parallel
    await Promise.all(
      agents.map(async (agent) => {
        try {
          // Fetch daily stats (last 7 days)
          const dailyResponse = await fetch(
            `${backendUrl}/xyzen/api/v1/agents/stats/${agent.id}/daily`,
            { headers: createAuthHeaders() },
          );
          if (dailyResponse.ok) {
            dailyActivity[agent.id] = await dailyResponse.json();
          }

          // Fetch yesterday summary
          const yesterdayResponse = await fetch(
            `${backendUrl}/xyzen/api/v1/agents/stats/${agent.id}/yesterday`,
            { headers: createAuthHeaders() },
          );
          if (yesterdayResponse.ok) {
            yesterdaySummary[agent.id] = await yesterdayResponse.json();
          }
        } catch (error) {
          console.debug(
            `Failed to fetch activity for agent ${agent.id}:`,
            error,
          );
        }
      }),
    );

    set({ dailyActivity, yesterdaySummary });
  },

  /**
   * Optimistically increment the local message count for an agent.
   * Used for immediate UI feedback when a message is sent.
   * Actual stats will sync from backend on next fetchAgentStats().
   */
  incrementLocalAgentMessageCount: (agentId) => {
    set((state) => {
      const existingStats = state.agentStats[agentId];
      if (existingStats) {
        state.agentStats[agentId] = {
          ...existingStats,
          message_count: existingStats.message_count + 1,
        };
      } else {
        // Create placeholder stats if not yet fetched
        state.agentStats[agentId] = {
          agent_id: agentId,
          session_count: 0,
          topic_count: 0,
          message_count: 1,
          input_tokens: 0,
          output_tokens: 0,
        };
      }
    });
  },

  reorderAgents: async (agentIds: string[]) => {
    // Store previous order for rollback
    const previousAgents = [...get().agents];

    // Optimistic update: reorder agents locally based on agentIds
    set((state) => {
      const agentMap = new Map(state.agents.map((a) => [a.id, a]));
      const reorderedAgents: AgentWithLayout[] = [];

      for (const id of agentIds) {
        const agent = agentMap.get(id);
        if (agent) {
          reorderedAgents.push(agent);
        }
      }

      // Add any agents not in the new order (shouldn't happen normally)
      for (const agent of state.agents) {
        if (!agentIds.includes(agent.id)) {
          reorderedAgents.push(agent);
        }
      }

      state.agents = reorderedAgents;
    });

    // Persist to backend
    try {
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/reorder`,
        {
          method: "PUT",
          headers: createAuthHeaders(),
          body: JSON.stringify({ agent_ids: agentIds }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to reorder agents: ${errorText}`);
      }
    } catch (error) {
      // Rollback on error
      console.error("Failed to reorder agents:", error);
      set({ agents: previousAgents });
      throw error;
    }
  },

  createAgent: async (agent) => {
    const { isCreatingAgent } = get();
    if (isCreatingAgent) {
      console.log("Agent creation already in progress");
      return undefined;
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
      const createdAgent = await response.json();

      // Directly add to local state instead of refetching all agents
      const existingAgents = get().agents;
      const newAgent: AgentWithLayout = {
        ...createdAgent,
        spatial_layout: defaultSpatialLayoutForIndex(existingAgents.length),
      };
      set({ agents: [...existingAgents, newAgent] });

      return createdAgent.id as string;
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      set({ isCreatingAgent: false });
    }
  },

  addForkedAgent: async (agentId, centerPosition) => {
    try {
      // Fetch the single agent data
      const response = await fetch(
        `${get().backendUrl}/xyzen/api/v1/agents/${agentId}`,
        { headers: createAuthHeaders() },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch forked agent");
      }
      const agent = await response.json();

      // Fetch session for this agent to get avatar if available
      let avatar = agent.avatar;
      try {
        const session = await sessionService.getSessionByAgent(agentId);
        if (session.avatar) {
          avatar = session.avatar;
        }
      } catch {
        // Session doesn't exist yet - will be created when user starts chat
        console.debug(`No session found for agent ${agentId}`);
      }

      // Incrementally add to agents array, using the passed center position
      // Also set pendingNewAgentId for animation when SpatialWorkspace mounts
      const existingAgents = get().agents;
      const newAgent: AgentWithLayout = {
        ...agent,
        avatar,
        spatial_layout: {
          position: centerPosition,
          size: "medium",
          gridSize: { w: 2, h: 1 },
        },
      };
      set({
        agents: [...existingAgents, newAgent],
      });
    } catch (error) {
      console.error("Failed to add forked agent:", error);
      // Fallback: use fetchAgents to refresh all
      await get().fetchAgents();
    }
  },

  updateAgent: async (agent) => {
    // Save previous state for rollback
    const previousAgents = get().agents;

    // Optimistic update: apply changes to local state immediately
    set((state) => {
      const idx = state.agents.findIndex((a) => a.id === agent.id);
      if (idx !== -1) {
        state.agents[idx] = { ...state.agents[idx], ...agent };
      }
    });

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

      // Reconcile with server response to pick up any server-side changes
      const updatedAgent: Agent = await response.json();
      set((state) => {
        const idx = state.agents.findIndex((a) => a.id === agent.id);
        if (idx !== -1) {
          // Preserve local-only fields (spatial_layout, avatar from session)
          const { spatial_layout, avatar } = state.agents[idx];
          state.agents[idx] = {
            ...state.agents[idx],
            ...updatedAgent,
            spatial_layout,
            avatar,
          };
        }
      });
    } catch (error) {
      // Rollback on error
      set({ agents: previousAgents });
      console.error(error);
      throw error;
    }
  },

  updateAgentLayout: async (agentId, layout) => {
    try {
      // Get the session ID for this agent
      let sessionId = get().sessionIdByAgentId[agentId];

      if (!sessionId) {
        // Try to fetch the session if not cached
        try {
          const session = await sessionService.getSessionByAgent(agentId);
          sessionId = session.id;
          // Cache it
          set((state) => {
            state.sessionIdByAgentId[agentId] = sessionId;
          });
        } catch {
          // Session doesn't exist - create one first
          // This happens when user drags an agent that hasn't been used yet
          console.warn(
            `No session found for agent ${agentId}, creating one...`,
          );
          const agent = get().agents.find((a) => a.id === agentId);
          const newSession = await sessionService.createSession({
            name: agent?.name ?? "Agent Session",
            agent_id: agentId,
            spatial_layout: layout,
          });
          sessionId = newSession.id;
          set((state) => {
            state.sessionIdByAgentId[agentId] = sessionId;
          });

          // Update local state optimistically
          set((state) => {
            const agentData = state.agents.find((a) => a.id === agentId);
            if (agentData) {
              agentData.spatial_layout = layout;
            }
          });
          return;
        }
      }

      // Update the session's spatial_layout via Session API
      await sessionService.updateSession(sessionId, { spatial_layout: layout });

      // Update local state optimistically
      set((state) => {
        const agent = state.agents.find((a) => a.id === agentId);
        if (agent) {
          agent.spatial_layout = layout;
        }
      });
    } catch (error) {
      console.error("Failed to update agent layout:", error);
      throw error;
    }
  },

  updateAgentAvatar: async (agentId, avatarUrl) => {
    try {
      // Get the session ID for this agent
      let sessionId = get().sessionIdByAgentId[agentId];

      if (!sessionId) {
        // Try to fetch the session if not cached
        try {
          const session = await sessionService.getSessionByAgent(agentId);
          sessionId = session.id;
          // Cache it
          set((state) => {
            state.sessionIdByAgentId[agentId] = sessionId;
          });
        } catch (fetchError) {
          // Session doesn't exist - create one first
          console.warn(
            `${fetchError} No session found for agent ${agentId}, creating one...`,
          );
          const agent = get().agents.find((a) => a.id === agentId);
          const newSession = await sessionService.createSession({
            name: agent?.name ?? "Agent Session",
            agent_id: agentId,
            avatar: avatarUrl,
          });
          sessionId = newSession.id;
          set((state) => {
            state.sessionIdByAgentId[agentId] = sessionId;
          });

          // Update local state
          set((state) => {
            const agentData = state.agents.find((a) => a.id === agentId);
            if (agentData) {
              agentData.avatar = avatarUrl;
            }
          });
          return;
        }
      }

      // Update the session's avatar via Session API
      await sessionService.updateSession(sessionId, { avatar: avatarUrl });

      // Update local state optimistically
      set((state) => {
        const agent = state.agents.find((a) => a.id === agentId);
        if (agent) {
          agent.avatar = avatarUrl;
        }
      });
    } catch (error) {
      console.error("Failed to update agent avatar:", error);
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
