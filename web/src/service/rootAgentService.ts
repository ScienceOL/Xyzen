import { authService } from "@/service/authService";
import type { Agent } from "@/types/agents";

export interface RootAgentResponse {
  agent: Agent;
  root_agent_id: string;
}

export interface RootAgentUpdate {
  prompt?: string;
  model?: string | null;
  provider_id?: string | null;
}

class RootAgentService {
  private getHeaders(): HeadersInit {
    const token = authService.getToken();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  async getRootAgent(backendUrl: string): Promise<RootAgentResponse> {
    const response = await fetch(`${backendUrl}/xyzen/api/v1/root-agent/`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch root agent");
    }
    return response.json();
  }

  async updateRootAgent(
    backendUrl: string,
    agentId: string,
    data: RootAgentUpdate,
  ): Promise<Agent> {
    const response = await fetch(
      `${backendUrl}/xyzen/api/v1/root-agent/${agentId}`,
      {
        method: "PATCH",
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to update root agent");
    }
    return response.json();
  }
}

export const rootAgentService = new RootAgentService();
