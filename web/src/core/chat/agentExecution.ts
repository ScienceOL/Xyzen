import type { PhaseExecution } from "@/types/agentEvents";

export const getLastNonEmptyPhaseContent = (
  phases: Pick<PhaseExecution, "streamedContent">[] | null | undefined,
): string | null => {
  if (!phases || phases.length === 0) {
    return null;
  }

  for (let i = phases.length - 1; i >= 0; i -= 1) {
    const phaseContent = phases[i]?.streamedContent;
    // Use trim only to detect emptiness; return the original string to preserve whitespace.
    if (phaseContent && phaseContent.trim().length > 0) {
      return phaseContent;
    }
  }

  return null;
};
