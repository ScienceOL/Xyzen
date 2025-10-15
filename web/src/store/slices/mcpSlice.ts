import { mcpService } from "@/service/mcpService";
import type { McpServer, McpServerCreate } from "@/types/mcp";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";
import { LoadingKeys } from "./loadingSlice";

export interface McpSlice {
  mcpServers: McpServer[];
  lastFetchTime: number; // 添加最后一次获取时间
  fetchMcpServers: () => Promise<void>;
  refreshMcpServers: () => Promise<void>;
  addMcpServer: (server: McpServerCreate) => Promise<void>;
  editMcpServer: (
    id: string,
    server: Partial<McpServerCreate>,
  ) => Promise<void>;
  removeMcpServer: (id: string) => Promise<void>;
  updateMcpServerInList: (server: McpServer) => void;
}

export const createMcpSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  McpSlice
> = (set, get) => ({
  mcpServers: [],
  lastFetchTime: 0,
  fetchMcpServers: async () => {
    const { setLoading } = get();

    // 缓存机制：如果5秒内已经获取过，直接返回
    const now = Date.now();
    const { lastFetchTime } = get();
    if (now - lastFetchTime < 5000) {
      console.log("McpSlice: 使用缓存的MCP服务器数据");
      return;
    }

    setLoading(LoadingKeys.MCP_SERVERS, true);

    try {
      console.log("McpSlice: Starting to fetch MCP servers...");
      const servers = await mcpService.getMcpServers();
      console.log(`McpSlice: Loaded ${servers.length} MCP servers`);
      set({ mcpServers: servers, lastFetchTime: now });
    } catch (error) {
      console.error("Failed to fetch MCP servers:", error);
    } finally {
      setLoading(LoadingKeys.MCP_SERVERS, false);
    }
  },
  refreshMcpServers: async () => {
    const { setLoading } = get();
    setLoading(LoadingKeys.MCP_SERVERS, true);
    try {
      await mcpService.refreshMcpServers();
      // The backend will send updates via WebSocket,
      // so we just need to wait a bit for the updates to arrive.
      // A better solution might be to refetch after a delay.
      setTimeout(() => {
        get().fetchMcpServers();
      }, 1000); // Refetch after 1 second
    } catch (error) {
      console.error("Failed to refresh MCP servers:", error);
    } finally {
      // Keep loading true for a moment to show feedback
      setTimeout(() => setLoading(LoadingKeys.MCP_SERVERS, false), 1500);
    }
  },
  addMcpServer: async (server) => {
    const { setLoading } = get();
    setLoading(LoadingKeys.MCP_SERVER_CREATE, true);

    try {
      const newServer = await mcpService.createMcpServer(server);
      set((state: McpSlice) => {
        state.mcpServers.push(newServer);
      });
      get().closeAddMcpServerModal();
    } catch (error) {
      console.error("Failed to add MCP server:", error);
      throw error;
    } finally {
      setLoading(LoadingKeys.MCP_SERVER_CREATE, false);
    }
  },
  editMcpServer: async (id, server) => {
    const { setLoading } = get();
    setLoading(LoadingKeys.MCP_SERVER_UPDATE, true);

    try {
      const updatedServer = await mcpService.updateMcpServer(id, server);
      set((state: McpSlice) => {
        const index = state.mcpServers.findIndex((s) => s.id === id);
        if (index !== -1) {
          state.mcpServers[index] = updatedServer;
        }
      });
    } catch (error) {
      console.error("Failed to edit MCP server:", error);
      throw error;
    } finally {
      setLoading(LoadingKeys.MCP_SERVER_UPDATE, false);
    }
  },
  removeMcpServer: async (id) => {
    const { setLoading } = get();
    setLoading(LoadingKeys.MCP_SERVER_DELETE, true);

    try {
      await mcpService.deleteMcpServer(id);
      set((state: McpSlice) => {
        state.mcpServers = state.mcpServers.filter((s) => s.id !== id);
      });
    } catch (error) {
      console.error("Failed to remove MCP server:", error);
      throw error;
    } finally {
      setLoading(LoadingKeys.MCP_SERVER_DELETE, false);
    }
  },
  updateMcpServerInList: (server) => {
    set((state: McpSlice) => {
      const index = state.mcpServers.findIndex((s) => s.id === server.id);
      if (index !== -1) {
        state.mcpServers[index] = server;
      } else {
        state.mcpServers.push(server);
      }
    });
  },
});
