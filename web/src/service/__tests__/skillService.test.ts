import { beforeEach, describe, expect, it, vi } from "vitest";

const getTokenMock = vi.fn();
const getStateMock = vi.fn();

vi.mock("@/service/authService", () => ({
  authService: {
    getToken: () => getTokenMock(),
  },
}));

vi.mock("@/store", () => ({
  useXyzen: {
    getState: () => getStateMock(),
  },
}));

import { skillService } from "@/service/skillService";

function mockJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("skillService", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    getTokenMock.mockReset();
    getStateMock.mockReset();

    getTokenMock.mockReturnValue("token-123");
    getStateMock.mockReturnValue({ backendUrl: "http://api.test" });
  });

  it("lists all skills with auth headers", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse([{ id: "s1" }]));

    const result = await skillService.listSkills();

    expect(result).toEqual([{ id: "s1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/xyzen/api/v1/skills/",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer token-123",
        }),
      }),
    );
  });

  it("lists attached skills for an agent", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse([{ id: "s2" }]));

    const result = await skillService.listAgentSkills("agent-1");

    expect(result).toEqual([{ id: "s2" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/xyzen/api/v1/agents/agent-1/skills",
      expect.any(Object),
    );
  });

  it("attaches a skill to an agent", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ status: "attached" }));

    await skillService.attachSkill("agent-1", "skill-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/xyzen/api/v1/agents/agent-1/skills",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skill_id: "skill-1" }),
      }),
    );
  });

  it("detaches a skill from an agent", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await skillService.detachSkill("agent-1", "skill-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/xyzen/api/v1/agents/agent-1/skills/skill-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("parses SKILL.md payload", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ valid: true, name: "my-skill", description: "desc" }),
    );

    const payload = {
      skill_md: "---\nname: my-skill\ndescription: desc\n---\nInstructions",
      resources: [{ path: "scripts/a.py", content: "print(1)" }],
    };

    const result = await skillService.parseSkill(payload);

    expect(result.valid).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/xyzen/api/v1/skills/parse",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });

  it("creates a skill", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ id: "created-skill", name: "my-skill" }),
    );

    const payload = {
      name: "my-skill",
      description: "desc",
      skill_md: "---\nname: my-skill\ndescription: desc\n---\nInstructions",
      resources: [],
    };

    const result = await skillService.createSkill(payload);

    expect(result).toEqual({ id: "created-skill", name: "my-skill" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/xyzen/api/v1/skills/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });

  it("lists skill resource paths", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(["docs/guide.md", "scripts/run.py"]),
    );

    const result = await skillService.listSkillResources("skill-1");

    expect(result).toEqual(["docs/guide.md", "scripts/run.py"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/xyzen/api/v1/skills/skill-1/resources",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
        }),
      }),
    );
  });

  it("surfaces backend detail message on failures", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(
        { detail: "Skill name already in use" },
        { status: 409, statusText: "Conflict" },
      ),
    );

    await expect(
      skillService.createSkill({
        name: "my-skill",
        description: "desc",
        skill_md: "x",
      }),
    ).rejects.toThrow("Skill name already in use");
  });
});
