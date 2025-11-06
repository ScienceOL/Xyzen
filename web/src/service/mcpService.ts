import { authService } from "@/service/authService";
import { useXyzen } from "@/store";
import type {
  ExplorableMcpServer,
  McpServer,
  McpServerCreate,
  McpServerUpdate,
} from "@/types/mcp";

const getBackendUrl = () => {
  const url = useXyzen.getState().backendUrl;
  // 🔥 修复：如果 backendUrl 为空或只有 http（不安全），使用当前页面的协议和域名
  if (!url || url === "" || url === "http://") {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}//${window.location.host}`;
    }
  }
  return url;
};

const createAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = authService.getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

export const mcpService = {
  async getMcpServers(): Promise<McpServer[]> {
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/mcps`, {
      headers: createAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch MCP servers");
    }
    return response.json();
  },

  async createMcpServer(server: McpServerCreate): Promise<McpServer> {
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/mcps`, {
      method: "POST",
      headers: createAuthHeaders(),
      body: JSON.stringify(server),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create MCP server: ${response.status} ${errorText}`,
      );
    }
    return response.json();
  },

  async updateMcpServer(
    id: string,
    server: McpServerUpdate,
  ): Promise<McpServer> {
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/mcps/${id}`, {
      method: "PATCH",
      headers: createAuthHeaders(),
      body: JSON.stringify(server),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to update MCP server: ${response.status} ${errorText}`,
      );
    }
    return response.json();
  },

  async deleteMcpServer(id: string): Promise<void> {
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/mcps/${id}`, {
      method: "DELETE",
      headers: createAuthHeaders(),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to delete MCP server: ${response.status} ${errorText}`,
      );
    }
  },

  async refreshMcpServers(): Promise<void> {
    const response = await fetch(
      `${getBackendUrl()}/xyzen/api/v1/mcps/refresh`,
      {
        method: "POST",
        headers: createAuthHeaders(),
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to trigger MCP server refresh: ${response.status} ${errorText}`,
      );
    }
  },

  async getBuiltinMcpServers(): Promise<ExplorableMcpServer[]> {
    try {
      const response = await fetch(
        `${getBackendUrl()}/xyzen/api/v1/mcps/discover`,
        {
          headers: createAuthHeaders(),
        },
      );
      if (!response.ok) {
        console.warn("Failed to discover builtin MCP servers");
        return []; // Fail gracefully
      }
      return response.json();
    } catch (error) {
      console.warn("Error discovering builtin MCP servers:", error);
      return []; // Fail gracefully
    }
  },
};
