import { http } from "@/service/http/client";
import type { AgentSpatialLayout } from "@/types/agents";

export interface SessionCreate {
  name: string;
  description?: string;
  is_active?: boolean;
  agent_id?: string;
  provider_id?: string;
  model?: string;
  model_tier?: "ultra" | "pro" | "standard" | "lite";
  knowledge_set_id?: string;
  avatar?: string;
  spatial_layout?: AgentSpatialLayout;
}

export interface SessionUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
  provider_id?: string;
  model?: string;
  model_tier?: "ultra" | "pro" | "standard" | "lite";
  knowledge_set_id?: string | null;
  avatar?: string;
  spatial_layout?: AgentSpatialLayout;
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
  model_tier?: "ultra" | "pro" | "standard" | "lite";
  knowledge_set_id?: string;
  avatar?: string;
  spatial_layout?: AgentSpatialLayout;
  created_at: string;
  updated_at: string;
}

class SessionService {
  async createSession(sessionData: SessionCreate): Promise<SessionRead> {
    return http.post("/xyzen/api/v1/sessions/", sessionData);
  }

  async getSessions(): Promise<SessionRead[]> {
    return http.get("/xyzen/api/v1/sessions/");
  }

  async getSessionByAgent(agentId: string): Promise<SessionRead> {
    return http.get(`/xyzen/api/v1/sessions/by-agent/${agentId}`);
  }

  async updateSession(
    sessionId: string,
    sessionData: SessionUpdate,
  ): Promise<SessionRead> {
    return http.patch(`/xyzen/api/v1/sessions/${sessionId}`, sessionData);
  }

  async clearSessionTopics(sessionId: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/sessions/${sessionId}/topics`);
  }
}

export const sessionService = new SessionService();
