import { http } from "@/service/http/client";
import type { McpServer, McpServerCreate, McpServerUpdate } from "@/types/mcp";

export const mcpService = {
  async getMcpServers(): Promise<McpServer[]> {
    return http.get("/xyzen/api/v1/mcps");
  },

  async createMcpServer(server: McpServerCreate): Promise<McpServer> {
    return http.post("/xyzen/api/v1/mcps", server);
  },

  async updateMcpServer(
    id: string,
    server: McpServerUpdate,
  ): Promise<McpServer> {
    return http.patch(`/xyzen/api/v1/mcps/${id}`, server);
  },

  async deleteMcpServer(id: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/mcps/${id}`);
  },

  async refreshMcpServers(): Promise<void> {
    return http.post("/xyzen/api/v1/mcps/refresh");
  },

  async activateSmitheryServer(
    qualifiedName: string,
    profile?: string,
  ): Promise<McpServer> {
    return http.post("/xyzen/api/v1/mcps/smithery/activate", {
      qualifiedName,
      profile,
    });
  },

  async getBuiltinMcpServers(): Promise<unknown[]> {
    try {
      return await http.get("/xyzen/api/v1/mcps/discover");
    } catch (error) {
      console.warn("Error discovering builtin MCP servers:", error);
      return []; // Fail gracefully
    }
  },

  async getBuiltinSearchServers(): Promise<unknown[]> {
    try {
      return await http.get("/xyzen/api/v1/mcps/search-servers/discover");
    } catch (error) {
      console.warn("Error discovering builtin search servers:", error);
      return [];
    }
  },

  async getSearchServers(): Promise<McpServer[]> {
    return http.get("/xyzen/api/v1/mcps");
  },

  async getSessionSearchEngine(sessionId: string): Promise<McpServer | null> {
    try {
      return await http.get(
        `/xyzen/api/v1/sessions/${sessionId}/search-engine`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "status" in error &&
        (error as { status: number }).status === 404
      ) {
        return null;
      }
      throw error;
    }
  },

  async setSessionSearchEngine(
    sessionId: string,
    mcpServerId: string,
  ): Promise<McpServer> {
    return http.put(`/xyzen/api/v1/sessions/${sessionId}/search-engine`, {
      mcp_server_id: mcpServerId,
    });
  },

  async removeSessionSearchEngine(sessionId: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/sessions/${sessionId}/search-engine`);
  },

  async testTool(
    serverId: string,
    toolName: string,
    parameters: unknown,
  ): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    execution_time_ms?: number;
  }> {
    return http.post(`/xyzen/api/v1/mcps/${serverId}/tools/${toolName}/test`, {
      parameters,
    });
  },
};
