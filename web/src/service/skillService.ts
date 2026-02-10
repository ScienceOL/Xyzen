import { authService } from "@/service/authService";
import { useXyzen } from "@/store";
import type {
  AttachSkillRequest,
  SkillCreateRequest,
  SkillParseRequest,
  SkillParseResponse,
  SkillRead,
} from "@/types/skills";

const getBackendUrl = () => {
  const url = useXyzen.getState().backendUrl;
  if (!url || url === "") {
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

const getErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  try {
    const data = (await response.json()) as { detail?: string };
    if (typeof data.detail === "string" && data.detail.trim()) {
      return data.detail;
    }
  } catch {
    // Ignore JSON parsing failures and fallback to text/body status.
  }

  try {
    const text = await response.text();
    if (text.trim()) {
      return text;
    }
  } catch {
    // ignore text parsing errors
  }

  return fallback;
};

class SkillService {
  async listSkills(): Promise<SkillRead[]> {
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/skills/`, {
      headers: createAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(response, "Failed to list available skills"),
      );
    }

    return response.json();
  }

  async listAgentSkills(agentId: string): Promise<SkillRead[]> {
    const response = await fetch(
      `${getBackendUrl()}/xyzen/api/v1/agents/${agentId}/skills`,
      {
        headers: createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(response, "Failed to list agent skills"),
      );
    }

    return response.json();
  }

  async attachSkill(agentId: string, skillId: string): Promise<void> {
    const payload: AttachSkillRequest = { skill_id: skillId };
    const response = await fetch(
      `${getBackendUrl()}/xyzen/api/v1/agents/${agentId}/skills`,
      {
        method: "POST",
        headers: createAuthHeaders(),
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(response, "Failed to attach skill to agent"),
      );
    }
  }

  async detachSkill(agentId: string, skillId: string): Promise<void> {
    const response = await fetch(
      `${getBackendUrl()}/xyzen/api/v1/agents/${agentId}/skills/${skillId}`,
      {
        method: "DELETE",
        headers: createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(response, "Failed to detach skill from agent"),
      );
    }
  }

  async parseSkill(payload: SkillParseRequest): Promise<SkillParseResponse> {
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/skills/parse`, {
      method: "POST",
      headers: createAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(response, "Failed to parse SKILL.md payload"),
      );
    }

    return response.json();
  }

  async createSkill(payload: SkillCreateRequest): Promise<SkillRead> {
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/skills/`, {
      method: "POST",
      headers: createAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, "Failed to create skill"));
    }

    return response.json();
  }

  async listSkillResources(skillId: string): Promise<string[]> {
    const response = await fetch(
      `${getBackendUrl()}/xyzen/api/v1/skills/${skillId}/resources`,
      {
        headers: createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(response, "Failed to list skill resources"),
      );
    }

    return response.json();
  }
}

export const skillService = new SkillService();
