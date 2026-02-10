import { skillService } from "@/service/skillService";
import type { SkillCreateRequest, SkillRead } from "@/types/skills";

export interface SkillPartition {
  connected: SkillRead[];
  available: SkillRead[];
}

export function partitionSkills(
  allSkills: SkillRead[],
  attachedSkills: SkillRead[],
): SkillPartition {
  const attachedIds = new Set(attachedSkills.map((skill) => skill.id));
  return {
    connected: attachedSkills,
    available: allSkills.filter((skill) => !attachedIds.has(skill.id)),
  };
}

export async function toggleSkillAttachment(
  agentId: string,
  skillId: string,
  isAttached: boolean,
): Promise<void> {
  if (isAttached) {
    await skillService.detachSkill(agentId, skillId);
    return;
  }

  await skillService.attachSkill(agentId, skillId);
}

export async function createAndAttachSkill(
  agentId: string,
  payload: SkillCreateRequest,
): Promise<SkillRead> {
  const created = await skillService.createSkill(payload);
  await skillService.attachSkill(agentId, created.id);
  return created;
}
