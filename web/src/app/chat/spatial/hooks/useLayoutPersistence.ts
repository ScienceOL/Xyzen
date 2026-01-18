import type { AgentSpatialLayout } from "@/types/agents";
import { useCallback, useRef } from "react";
import type { SaveStatus } from "../SaveStatusIndicator";

interface UseLayoutPersistenceOptions {
  updateAgentLayout: (
    agentId: string,
    layout: AgentSpatialLayout,
  ) => Promise<void>;
  onStatusChange: (status: SaveStatus) => void;
}

/**
 * Hook to manage debounced layout saving with retry capability
 */
export function useLayoutPersistence({
  updateAgentLayout,
  onStatusChange,
}: UseLayoutPersistenceOptions) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSavesRef = useRef<Map<string, AgentSpatialLayout>>(new Map());
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(
    (agentId: string, layout: AgentSpatialLayout) => {
      pendingSavesRef.current.set(agentId, layout);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      onStatusChange("saving");

      saveTimerRef.current = setTimeout(async () => {
        const saves = Array.from(pendingSavesRef.current.entries());
        pendingSavesRef.current.clear();

        try {
          await Promise.all(
            saves.map(([id, layout]) => updateAgentLayout(id, layout)),
          );

          onStatusChange("saved");

          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(
            () => onStatusChange("idle"),
            2000,
          );
        } catch (error) {
          console.error("Failed to save layouts:", error);
          onStatusChange("failed");
        }
      }, 2000);
    },
    [updateAgentLayout, onStatusChange],
  );

  const handleRetrySave = useCallback(() => {
    const saves = Array.from(pendingSavesRef.current.entries());
    if (saves.length > 0) {
      onStatusChange("saving");
      Promise.all(saves.map(([id, layout]) => updateAgentLayout(id, layout)))
        .then(() => {
          pendingSavesRef.current.clear();
          onStatusChange("saved");
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(
            () => onStatusChange("idle"),
            2000,
          );
        })
        .catch(() => onStatusChange("failed"));
    }
  }, [updateAgentLayout, onStatusChange]);

  return {
    scheduleSave,
    handleRetrySave,
  };
}
