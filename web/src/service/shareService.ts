import { authService } from "@/service/authService";
import { useXyzen } from "@/store";

export interface ChatShareCreate {
  session_id: string;
  topic_id: string;
  message_ids?: string[];
  title?: string;
  allow_fork?: boolean;
  expires_at?: string;
  max_uses?: number;
}

export interface ChatShareRead {
  id: string;
  token: string;
  user_id: string;
  session_id: string;
  topic_id: string;
  agent_id?: string;
  title?: string;
  message_count: number;
  allow_fork: boolean;
  status: "active" | "revoked" | "expired";
  expires_at?: string;
  max_uses?: number;
  use_count: number;
  created_at: string;
}

export interface ChatSharePublicRead {
  token: string;
  title?: string;
  message_count: number;
  allow_fork: boolean;
  messages_snapshot: Record<string, unknown>[];
  agent_snapshot?: Record<string, unknown>;
  created_at: string;
}

export interface ForkResult {
  session_id: string;
  topic_id: string;
  agent_id: string;
}

class ShareService {
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

  async createShare(data: ChatShareCreate): Promise<ChatShareRead> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/chat-shares/`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(data),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create share: ${error}`);
    }

    return response.json();
  }

  async listShares(): Promise<ChatShareRead[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/chat-shares/`,
      {
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to fetch shares");
    }

    return response.json();
  }

  async getSharePublic(token: string): Promise<ChatSharePublicRead> {
    // Public endpoint — only send auth if available (not required)
    const headers: Record<string, string> = {};
    const authToken = authService.getToken();
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/chat-shares/${token}`,
      { headers },
    );

    if (!response.ok) {
      throw new Error("Failed to fetch share");
    }

    return response.json();
  }

  async forkShare(token: string): Promise<ForkResult> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/chat-shares/${token}/fork`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to fork share");
    }

    return response.json();
  }

  async revokeShare(shareId: string): Promise<ChatShareRead> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/chat-shares/${shareId}`,
      {
        method: "DELETE",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to revoke share");
    }

    return response.json();
  }
}

export const shareService = new ShareService();
