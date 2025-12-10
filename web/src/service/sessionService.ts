import { authService } from "@/service/authService";
import { useXyzen } from "@/store";

export interface SessionCreate {
  name: string;
  description?: string;
  is_active?: boolean;
  agent_id?: string;
  provider_id?: string;
  model?: string;
}

export interface SessionUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
  provider_id?: string;
  model?: string;
}

export interface SessionRead {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  agent_id?: string;
  user_id: string;
  provider_id?: string;
  model?: string;
  created_at: string;
  updated_at: string;
}

class SessionService {
  private getBackendUrl(): string {
    const { backendUrl } = useXyzen.getState();
    if (!backendUrl || backendUrl === "") {
      if (typeof window !== "undefined") {
        return `${window.location.protocol}//${window.location.host}`;
      }
    }
    return backendUrl;
  }

  private createAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const token = authService.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Create a new session
   */
  async createSession(sessionData: SessionCreate): Promise<SessionRead> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/sessions/`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(sessionData),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create session: ${error}`);
    }

    return response.json();
  }

  /**
   * Get all sessions for the current user
   */
  async getSessions(): Promise<SessionRead[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/sessions/`,
      {
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to fetch sessions");
    }

    return response.json();
  }

  /**
   * Get session by agent ID
   */
  async getSessionByAgent(agentId: string): Promise<SessionRead> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/sessions/by-agent/${agentId}`,
      {
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to fetch session by agent");
    }

    return response.json();
  }

  /**
   * Update a session (including provider and model)
   */
  async updateSession(
    sessionId: string,
    sessionData: SessionUpdate,
  ): Promise<SessionRead> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/sessions/${sessionId}`,
      {
        method: "PATCH",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(sessionData),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update session: ${error}`);
    }

    return response.json();
  }

  /**
   * Clear all topics in a session
   */
  async clearSessionTopics(sessionId: string): Promise<void> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/sessions/${sessionId}/topics`,
      {
        method: "DELETE",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to clear session topics: ${error}`);
    }
  }
}

export const sessionService = new SessionService();
