import { http } from "@/service/http/client";

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
  async createShare(data: ChatShareCreate): Promise<ChatShareRead> {
    return http.post("/xyzen/api/v1/chat-shares/", data);
  }

  async listShares(): Promise<ChatShareRead[]> {
    return http.get("/xyzen/api/v1/chat-shares/");
  }

  async getSharePublic(token: string): Promise<ChatSharePublicRead> {
    // Public endpoint — auth is optional (token sent if available)
    return http.get(`/xyzen/api/v1/chat-shares/${token}`);
  }

  async forkShare(token: string): Promise<ForkResult> {
    return http.post(`/xyzen/api/v1/chat-shares/${token}/fork`);
  }

  async revokeShare(shareId: string): Promise<ChatShareRead> {
    return http.delete(`/xyzen/api/v1/chat-shares/${shareId}`);
  }
}

export const shareService = new ShareService();
