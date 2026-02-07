import { useTranslation } from "react-i18next";
import type { StorageStats } from "./types";

interface StatusBarProps {
  itemCount: number;
  stats: StorageStats;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Format size in MB with 2 decimal places
const formatSizeInMB = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
};

export const StatusBar = ({ itemCount, stats }: StatusBarProps) => {
  const { t } = useTranslation();
  const available =
    stats.availableBytes ?? Math.max(0, stats.total - stats.used);
  const usagePercentage =
    stats.usagePercentage ??
    (stats.total > 0 ? (stats.used / stats.total) * 100 : 0);

  // Determine color based on usage
  const getUsageColor = () => {
    if (usagePercentage >= 90) return "text-red-600 dark:text-red-400";
    if (usagePercentage >= 75) return "text-orange-600 dark:text-orange-400";
    return "text-neutral-500";
  };

  const getProgressBarColor = () => {
    if (usagePercentage >= 90) return "bg-red-500";
    if (usagePercentage >= 75) return "bg-orange-500";
    return "bg-blue-500";
  };

  return (
    <div className="flex h-10 select-none items-center justify-between border-t border-white/20 dark:border-neutral-700/30 px-4 text-xs font-medium text-neutral-500 dark:text-neutral-400">
      <div className="flex items-center gap-3">
        <span>{t("knowledge.status.items", { count: itemCount })}</span>
        <span className="h-3 w-px bg-neutral-300/50 dark:bg-neutral-600/50" />
        <span className={getUsageColor()}>
          {t("knowledge.status.used", {
            used: formatSizeInMB(stats.used),
          })}
        </span>
        <span className="hidden sm:inline h-3 w-px bg-neutral-300/50 dark:bg-neutral-600/50" />
        <span className="hidden sm:inline">
          {t("knowledge.status.available", {
            available: formatSize(available),
          })}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Progress bar */}
        <div className="w-20 sm:w-28 h-1.5 bg-neutral-200/50 dark:bg-neutral-700/50 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getProgressBarColor()}`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          />
        </div>
        {usagePercentage > 0 && (
          <span className={getUsageColor()}>{usagePercentage.toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
};
