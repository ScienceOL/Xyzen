import { http } from "@/service/http/client";
import type {
  AttachSkillRequest,
  SkillCreateRequest,
  SkillParseRequest,
  SkillParseResponse,
  SkillRead,
} from "@/types/skills";

class SkillService {
  async listSkills(): Promise<SkillRead[]> {
    return http.get("/xyzen/api/v1/skills/");
  }

  async listAgentSkills(agentId: string): Promise<SkillRead[]> {
    return http.get(`/xyzen/api/v1/agents/${agentId}/skills`);
  }

  async attachSkill(agentId: string, skillId: string): Promise<void> {
    const payload: AttachSkillRequest = { skill_id: skillId };
    return http.post(`/xyzen/api/v1/agents/${agentId}/skills`, payload);
  }

  async detachSkill(agentId: string, skillId: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/agents/${agentId}/skills/${skillId}`);
  }

  async parseSkill(payload: SkillParseRequest): Promise<SkillParseResponse> {
    return http.post("/xyzen/api/v1/skills/parse", payload);
  }

  async createSkill(payload: SkillCreateRequest): Promise<SkillRead> {
    return http.post("/xyzen/api/v1/skills/", payload);
  }

  async listSkillResources(skillId: string): Promise<string[]> {
    return http.get(`/xyzen/api/v1/skills/${skillId}/resources`);
  }

  async updateSkill(
    skillId: string,
    data: {
      name?: string;
      description?: string;
      skill_md?: string;
      license?: string | null;
      compatibility?: string | null;
      metadata_json?: Record<string, unknown> | null;
      resources?: { path: string; content: string }[];
    },
  ): Promise<SkillRead> {
    return http.patch(`/xyzen/api/v1/skills/${skillId}`, data);
  }

  async deleteSkill(skillId: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/skills/${skillId}`);
  }
}

export const skillService = new SkillService();
