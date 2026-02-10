import { beforeEach, describe, expect, it, vi } from "vitest";

const attachMock = vi.fn();
const detachMock = vi.fn();
const createMock = vi.fn();

vi.mock("@/service/skillService", () => ({
  skillService: {
    attachSkill: (...args: unknown[]) => attachMock(...args),
    detachSkill: (...args: unknown[]) => detachMock(...args),
    createSkill: (...args: unknown[]) => createMock(...args),
  },
}));

import {
  createAndAttachSkill,
  partitionSkills,
  toggleSkillAttachment,
} from "../skillActions";

describe("skillActions (SkillsButton behavior)", () => {
  beforeEach(() => {
    attachMock.mockReset();
    detachMock.mockReset();
    createMock.mockReset();
  });

  it("partitions connected and available skills", () => {
    const allSkills = [
      { id: "s1", name: "A", description: "A" },
      { id: "s2", name: "B", description: "B" },
      { id: "s3", name: "C", description: "C" },
    ];
    const attached = [{ id: "s2", name: "B", description: "B" }];

    const result = partitionSkills(
      allSkills as never[],
      attached as never[],
    );

    expect(result.connected).toEqual(attached);
    expect(result.available).toEqual([
      { id: "s1", name: "A", description: "A" },
      { id: "s3", name: "C", description: "C" },
    ]);
  });

  it("detaches when skill is already connected", async () => {
    detachMock.mockResolvedValueOnce(undefined);

    await toggleSkillAttachment("agent-1", "skill-1", true);

    expect(detachMock).toHaveBeenCalledWith("agent-1", "skill-1");
    expect(attachMock).not.toHaveBeenCalled();
  });

  it("attaches when skill is not connected", async () => {
    attachMock.mockResolvedValueOnce(undefined);

    await toggleSkillAttachment("agent-1", "skill-2", false);

    expect(attachMock).toHaveBeenCalledWith("agent-1", "skill-2");
    expect(detachMock).not.toHaveBeenCalled();
  });

  it("creates and auto-attaches the skill for current agent", async () => {
    createMock.mockResolvedValueOnce({
      id: "created-skill",
      name: "demo",
      description: "demo",
    });
    attachMock.mockResolvedValueOnce(undefined);

    const created = await createAndAttachSkill("agent-1", {
      name: "demo",
      description: "demo",
      skill_md: "---\nname: demo\ndescription: demo\n---\nbody",
      resources: [],
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(attachMock).toHaveBeenCalledWith("agent-1", "created-skill");
    expect(created.id).toBe("created-skill");
  });
});
