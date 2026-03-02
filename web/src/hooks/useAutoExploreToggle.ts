import { useXyzen } from "@/store";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function useAutoExploreToggle() {
  const { t } = useTranslation();
  const toggleAutoExplore = useXyzen((s) => s.toggleAutoExplore);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setLoading(true);
      try {
        await toggleAutoExplore(enabled);
        toast.success(
          enabled
            ? t("agents.rootAgent.autoExploreEnabled")
            : t("agents.rootAgent.autoExploreDisabled"),
        );
      } catch (error) {
        console.error("Failed to toggle auto-explore:", error);
        toast.error(t("agents.rootAgent.autoExploreFailed"));
      } finally {
        setLoading(false);
      }
    },
    [toggleAutoExplore, t],
  );

  return { handleToggle, loading };
}
