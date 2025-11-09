import { mcpService } from "@/service/mcpService";
import type {
  BuiltinMcpData,
  ExplorableMcpServer,
  McpServer,
  McpServerCreate,
  McpServerUpdate,
} from "@/types/mcp";
import { convertBuiltinServers } from "@/utils/mcpConverters";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";
import { LoadingKeys } from "./loadingSlice";

export interface McpSlice {
  mcpServers: McpServer[];
  builtinMcpServers: ExplorableMcpServer<BuiltinMcpData>[];
  lastFetchTime: number; // 添加最后一次获取时间
  isEditMcpServerModalOpen: boolean;
  editingMcpServer: McpServer | null;
  fetchMcpServers: () => Promise<void>;
  fetchBuiltinMcpServers: () => Promise<void>;
  refreshMcpServers: () => Promise<void>;
  addMcpServer: (server: McpServerCreate) => Promise<void>;
  quickAddBuiltinServer: (
    server: ExplorableMcpServer<BuiltinMcpData>,
  ) => Promise<void>;
  activateSmitheryServer: (
    qualifiedName: string,
    profile?: string,
  ) => Promise<void>;
  editMcpServer: (id: string, server: McpServerUpdate) => Promise<void>;
  removeMcpServer: (id: string) => Promise<void>;
  updateMcpServerInList: (server: McpServer) => void;
  openEditMcpServerModal: (server: McpServer) => void;
  closeEditMcpServerModal: () => void;
}

export const createMcpSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  McpSlice
> = (set, get) => ({
  mcpServers: [],
  builtinMcpServers: [],
  lastFetchTime: 0,
  isEditMcpServerModalOpen: false,
  editingMcpServer: null,
  openEditMcpServerModal: (server) => {
    set({ isEditMcpServerModalOpen: true, editingMcpServer: server });
  },
  closeEditMcpServerModal: () => {
    set({ isEditMcpServerModalOpen: false, editingMcpServer: null });
  },
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
  fetchBuiltinMcpServers: async () => {
    try {
      const rawServers = await mcpService.getBuiltinMcpServers();
      // 转换为新格式
      const builtinServers = convertBuiltinServers(rawServers);
      const { mcpServers, backendUrl } = get();

      // Filter out servers that user has already added
      const existingUrls = mcpServers.map((s) => s.url);
      const filtered = builtinServers.filter((bs) => {
        // Ensure URL has trailing slash for comparison
        const mountPath = bs.data.mount_path.endsWith("/")
          ? bs.data.mount_path
          : `${bs.data.mount_path}/`;
        const fullUrl = `${backendUrl}${mountPath}`;
        return !existingUrls.includes(fullUrl);
      });

      set({ builtinMcpServers: filtered });
    } catch (error) {
      console.error("Failed to fetch builtin MCP servers:", error);
      set({ builtinMcpServers: [] });
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
  quickAddBuiltinServer: async (server) => {
    const { backendUrl, token, setLoading } = get();
    setLoading(LoadingKeys.MCP_SERVER_CREATE, true);

    try {
      // Ensure URL has trailing slash for MCP server endpoint
      const mountPath = server.data.mount_path.endsWith("/")
        ? server.data.mount_path
        : `${server.data.mount_path}/`;

      const serverToCreate: McpServerCreate = {
        name: server.name,
        description: server.description,
        url: `${backendUrl}${mountPath}`,
        token: token || "",
      };

      const newServer = await mcpService.createMcpServer(serverToCreate);
      set((state: McpSlice) => {
        state.mcpServers.push(newServer);
        // Remove from builtin list since it's now added
        state.builtinMcpServers = state.builtinMcpServers.filter(
          (bs) => bs.data.module_name !== server.data.module_name,
        );
      });
      get().closeAddMcpServerModal();
    } catch (error) {
      console.error("Failed to add builtin MCP server:", error);
      throw error;
    } finally {
      setLoading(LoadingKeys.MCP_SERVER_CREATE, false);
    }
  },
  activateSmitheryServer: async (qualifiedName, profile) => {
    const { setLoading } = get();
    setLoading(LoadingKeys.MCP_SERVER_CREATE, true);

    try {
      const newServer = await mcpService.activateSmitheryServer(
        qualifiedName,
        profile,
      );
      set((state: McpSlice) => {
        state.mcpServers.push(newServer);
      });
      get().closeAddMcpServerModal();
    } catch (error) {
      console.error("Failed to activate Smithery MCP server:", error);
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
