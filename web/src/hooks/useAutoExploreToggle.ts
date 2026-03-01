import { useXyzen } from "@/store";
import { useCallback, useState } from "react";

export function useAutoExploreToggle() {
  const toggleAutoExplore = useXyzen((s) => s.toggleAutoExplore);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setLoading(true);
      try {
        await toggleAutoExplore(enabled);
      } catch (error) {
        console.error("Failed to toggle auto-explore:", error);
      } finally {
        setLoading(false);
      }
    },
    [toggleAutoExplore],
  );

  return { handleToggle, loading };
}
