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
    <div className="flex h-8 select-none items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 text-xs font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-4">
        <span>{t("knowledge.status.items", { count: itemCount })}</span>
        <span className="text-neutral-300 dark:text-neutral-700">|</span>
        <span className={getUsageColor()}>
          {t("knowledge.status.usedOfTotal", {
            used: formatSize(stats.used),
            total: formatSize(stats.total),
          })}
        </span>
        <span className="text-neutral-300 dark:text-neutral-700">|</span>
        <span className=" hidden sm:inline">
          {t("knowledge.status.available", {
            available: formatSize(available),
          })}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Progress bar */}
        <div className="w-24 sm:w-32 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getProgressBarColor()}`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          />
        </div>
        {usagePercentage > 0 && (
          <span className={getUsageColor()}>{usagePercentage.toFixed(1)}%</span>
        )}
      </div>
    </div>
  );
};
