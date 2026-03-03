"use client";

import { cn } from "@/lib/utils";
import { topicService } from "@/service/topicService";
import { useXyzen } from "@/store";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

interface ContextUsageBannerProps {
  topicId: string;
}

export const ContextUsageBanner: React.FC<ContextUsageBannerProps> = ({
  topicId,
}) => {
  const { t } = useTranslation();
  const [compacting, setCompacting] = useState(false);
  const contextUsage = useXyzen((s) => s.channels[topicId]?.contextUsage);
  const activateChannel = useXyzen((s) => s.activateChannel);

  const handleCompact = useCallback(async () => {
    if (compacting) return;
    setCompacting(true);
    try {
      const result = await topicService.compactTopic(topicId);
      await activateChannel(result.new_topic_id);
    } catch (err) {
      console.error("Failed to compact topic:", err);
    } finally {
      setCompacting(false);
    }
  }, [topicId, compacting, activateChannel]);

  if (!contextUsage?.nearLimit) return null;

  const isCritical = contextUsage.critical;
  const percent = Math.round(contextUsage.usagePercent);

  return (
    <div
      className={cn(
        "mx-3 mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ring-1 ring-inset",
        isCritical
          ? "bg-red-50/80 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-200 dark:ring-red-800/40"
          : "bg-amber-50/80 text-amber-700 ring-amber-200 dark:bg-amber-950/20 dark:text-amber-200 dark:ring-amber-800/40",
      )}
    >
      <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        {isCritical
          ? t("app.contextUsage.critical")
          : t("app.contextUsage.warning", { percent })}
      </span>
      <button
        type="button"
        onClick={handleCompact}
        disabled={compacting}
        className={cn(
          "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
          isCritical
            ? "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
            : "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60",
          compacting && "cursor-wait opacity-60",
        )}
      >
        {compacting
          ? t("app.contextUsage.compacting")
          : t("app.contextUsage.newChatButton")}
      </button>
    </div>
  );
};
